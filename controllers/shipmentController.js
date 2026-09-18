import shipmentModel from '../models/shipmentModel.js'
import orderModel from '../models/orderModel.js'
import { getAdapter } from '../services/shipping/index.js'
import velocityAdapter, { getWarehouseConfig } from '../services/shipping/velocityAdapter.js'
import { getAdminSettings } from '../models/adminSettingsModel.js'
import company from '../config/company.js'
import { emitOrderUpdate, emitAdminOrderUpdate } from '../realtime.js'

// Map shipment status → order.status (admin workflow: Pending→Confirmed→Packed→
// Pickuped→Delivered plus Cancelled/Returned). Everything in-transit lives under
// "Pickuped"; the fine-grained carrier status is shown from shipment.status.
const SHIP_TO_ORDER_STATUS = {
    created: 'Pickuped',
    label_generated: 'Pickuped',
    picked_up: 'Pickuped',
    in_transit: 'Pickuped',
    out_for_delivery: 'Pickuped',
    delivered: 'Delivered',
    failed: 'Cancelled',
    returned: 'Returned',
    cancelled: 'Cancelled',
}

// Human-readable label for a shipment status (UI + customer timeline).
export const STATUS_LABEL = {
    created: 'Shipment created',
    label_generated: 'Label generated',
    picked_up: 'Picked up',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    failed: 'Delivery failed',
    returned: 'Returned',
    cancelled: 'Cancelled',
}

const broadcast = (shipment, orderStatus) => {
    const payload = {
        orderId: shipment.orderId.toString(),
        userId: shipment.userId?.toString(),
        shipment,
        orderStatus,
    }
    emitOrderUpdate(payload.orderId, payload)
    emitAdminOrderUpdate(payload)
}

// Merge a getStatus() result into a shipment doc, de-duplicating carrier events.
// Returns true if anything changed.
const applyStatusResult = (shipment, result) => {
    let changed = false
    const seen = new Set(
        shipment.events.map((e) => `${e.status}|${new Date(e.timestamp).getTime()}|${e.description || ''}`)
    )
    for (const ev of result.events || []) {
        const key = `${ev.status}|${new Date(ev.timestamp).getTime()}|${ev.description || ''}`
        if (!seen.has(key)) { shipment.events.push(ev); seen.add(key); changed = true }
    }
    if (result.status && result.status !== shipment.status) { shipment.status = result.status; changed = true }
    if (result.currentLocation && result.currentLocation !== shipment.currentLocation) {
        shipment.currentLocation = result.currentLocation; changed = true
    }
    if (result.deliveredDate && !shipment.deliveredAt) { shipment.deliveredAt = result.deliveredDate; changed = true }
    if (result.trackUrl && result.trackUrl !== shipment.carrierTrackUrl) { shipment.carrierTrackUrl = result.trackUrl; changed = true }
    shipment.lastSyncedAt = new Date()
    return changed
}

// Push the mapped order status + delivery snapshot onto the order doc.
const syncOrderFromShipment = async (shipment) => {
    const orderStatus = SHIP_TO_ORDER_STATUS[shipment.status] || 'Pickuped'
    const order = await orderModel.findById(shipment.orderId)
    if (!order) return orderStatus
    const prev = order.status
    Object.assign(order, {
        status: orderStatus,
        trackingNumber: shipment.awb,
    })
    order.delivery = { ...(order.delivery || {}), courierName: shipment.courierName, partnerName: shipment.courierName, shipmentId: shipment.awb }
    if (prev !== orderStatus) {
        order.statusHistory = order.statusHistory || []
        order.statusHistory.push({ status: orderStatus, at: new Date(), by: 'velocity', note: STATUS_LABEL[shipment.status] || '' })
    }
    await order.save()
    return orderStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// Core "ship" action — allocate a courier via the provider, store AWB + label,
// and advance the order to "Pickuped". Shared by the HTTP handler AND the order
// status-update path (marking an order "Shipped"/"Pickuped" auto-ships it).
//
// Throws on provider failure (so callers can surface e.g. "wallet empty").
// Returns { shipment, result, alreadyShipped }.
// ─────────────────────────────────────────────────────────────────────────────
export const shipOrder = async (order, { provider, carrierId, weight, dimensions } = {}) => {
    let shipment = await shipmentModel.findOne({ orderId: order._id, isReturn: { $ne: true } })
    if (shipment && shipment.awb && shipment.status !== 'cancelled') {
        return { shipment, alreadyShipped: true }
    }

    const adapter = getAdapter(provider)
    const result = await adapter.createShipment(order, { carrierId, weight, dimensions })

    const doc = {
        orderId: order._id,
        userId: order.userId,
        provider: adapter.name,
        awb: result.awb,
        trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/track-order/${order._id}`,
        carrierTrackUrl: result.trackingUrl || null,
        status: 'created',
        currentLocation: null,
        expectedDelivery: result.expectedDelivery || null,
        courierName: result.courierName,
        courierCompanyId: result.courierCompanyId,
        labelUrl: result.labelUrl,
        manifestUrl: result.manifestUrl,
        providerShipmentId: result.providerShipmentId,
        providerOrderId: result.providerOrderId,
        appliedWeight: result.appliedWeight,
        cod: result.cod,
        charges: result.charges,
        events: [{ status: 'created', description: `Courier allocated: ${result.courierName || adapter.name}`, timestamp: new Date() }],
        providerPayload: result.raw,
    }

    shipment = shipment
        ? await shipmentModel.findByIdAndUpdate(shipment._id, doc, { new: true })
        : await shipmentModel.create(doc)

    const orderStatus = await syncOrderFromShipment(shipment)
    broadcast(shipment, orderStatus)
    return { shipment, result, alreadyShipped: false }
}

// Admin HTTP endpoint: ship one order (from the "Ship Order" button).
export const createShipment = async (req, res) => {
    try {
        const { orderId, provider, carrierId, weight, dimensions } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) return res.json({ success: false, message: 'Order not found' })

        const { shipment, result, alreadyShipped } = await shipOrder(order, { provider, carrierId, weight, dimensions })
        if (alreadyShipped) return res.json({ success: false, message: 'Shipment already exists for this order', shipment })

        res.json({ success: true, message: `Shipped via ${result.courierName || shipment.provider}`, shipment })
    } catch (error) {
        console.log('createShipment:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// Admin: append a status event manually (mock carrier / manual override).
export const appendEvent = async (req, res) => {
    try {
        const { status, description, location } = req.body
        const shipment = await shipmentModel.findById(req.params.id)
        if (!shipment) return res.json({ success: false, message: 'Shipment not found' })

        shipment.events.push({ status, description, location })
        shipment.status = status
        if (location) shipment.currentLocation = location
        if (status === 'delivered') shipment.deliveredAt = new Date()
        await shipment.save()

        const orderStatus = await syncOrderFromShipment(shipment)
        broadcast(shipment, orderStatus)
        res.json({ success: true, shipment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Admin or customer: fetch shipment for an order.
export const getByOrder = async (req, res) => {
    try {
        // Prefer the forward shipment; fall back to any (e.g. return-only order).
        const shipment = await shipmentModel.findOne({ orderId: req.params.orderId, isReturn: { $ne: true } })
            || await shipmentModel.findOne({ orderId: req.params.orderId })
        if (!shipment) return res.json({ success: true, shipment: null })
        res.json({ success: true, shipment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Public: track by AWB.
export const trackByAwb = async (req, res) => {
    try {
        const shipment = await shipmentModel.findOne({ awb: req.params.awb })
            .populate('orderId', 'orderNumber address items amount status')
        if (!shipment) return res.json({ success: false, message: 'Tracking ID not found' })
        res.json({ success: true, shipment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh tracking for a single order/shipment (manual "Refresh tracking" button).
// ─────────────────────────────────────────────────────────────────────────────
export const refreshTracking = async (req, res) => {
    try {
        const { orderId, awb } = req.body
        const query = awb ? { awb } : { orderId, isReturn: { $ne: true } }
        const shipment = await shipmentModel.findOne(query)
        if (!shipment) return res.json({ success: false, message: 'Shipment not found' })
        if (!shipment.awb) return res.json({ success: false, message: 'No AWB to track yet' })

        const adapter = getAdapter(shipment.provider)
        const result = await adapter.getStatus(shipment.awb)
        const changed = applyStatusResult(shipment, result)
        await shipment.save()

        const orderStatus = await syncOrderFromShipment(shipment)
        if (changed) broadcast(shipment, orderStatus)
        res.json({ success: true, changed, shipment })
    } catch (error) {
        console.log('refreshTracking:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// Called by the background poller — syncs every active shipment in bulk.
export const syncActiveShipments = async () => {
    const active = await shipmentModel.find({
        status: { $nin: ['delivered', 'cancelled', 'returned', 'failed'] },
        awb: { $exists: true, $ne: null },
    }).limit(200)
    if (!active.length) return { synced: 0 }

    // Group by provider; only Velocity supports bulk pulls.
    const byProvider = {}
    for (const s of active) (byProvider[s.provider] ||= []).push(s)

    let synced = 0
    for (const [provider, shipments] of Object.entries(byProvider)) {
        const adapter = getAdapter(provider)
        try {
            if (adapter.getStatusBulk) {
                const map = await adapter.getStatusBulk(shipments.map((s) => s.awb))
                for (const s of shipments) {
                    const result = map[s.awb]
                    if (!result) continue
                    const changed = applyStatusResult(s, result)
                    await s.save()
                    const orderStatus = await syncOrderFromShipment(s)
                    if (changed) { broadcast(s, orderStatus); synced++ }
                }
            } else {
                for (const s of shipments) {
                    const result = await adapter.getStatus(s.awb)
                    const changed = applyStatusResult(s, result)
                    await s.save()
                    const orderStatus = await syncOrderFromShipment(s)
                    if (changed) { broadcast(s, orderStatus); synced++ }
                }
            }
        } catch (e) {
            console.log(`Tracking sync (${provider}):`, e.message)
        }
    }
    return { synced }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: cancel a shipment (before pickup) via the provider.
// ─────────────────────────────────────────────────────────────────────────────
export const cancelShipment = async (req, res) => {
    try {
        const { orderId } = req.body
        const shipment = await shipmentModel.findOne({ orderId, isReturn: { $ne: true } })
        if (!shipment) return res.json({ success: false, message: 'No shipment to cancel' })

        const adapter = getAdapter(shipment.provider)
        if (shipment.awb) await adapter.cancel(shipment.awb)

        shipment.status = 'cancelled'
        shipment.events.push({ status: 'cancelled', description: 'Shipment cancelled', timestamp: new Date() })
        await shipment.save()

        await orderModel.findByIdAndUpdate(orderId, { status: 'Cancelled', $push: { statusHistory: { status: 'Cancelled', at: new Date(), by: req.adminEmail || 'admin', note: 'Shipment cancelled' } } })
        broadcast(shipment, 'Cancelled')
        res.json({ success: true, message: 'Shipment cancellation requested', shipment })
    } catch (error) {
        console.log('cancelShipment:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: serviceability check (list eligible carriers for a lane).
// ─────────────────────────────────────────────────────────────────────────────
export const checkServiceability = async (req, res) => {
    try {
        const { from, to, paymentMode, shipmentType } = req.body
        if (!from || !to) return res.json({ success: false, message: 'from and to pincodes are required' })
        const adapter = getAdapter()
        if (!adapter.serviceability) return res.json({ success: false, message: 'Provider does not support serviceability' })
        const result = await adapter.serviceability({ from, to, paymentMode, shipmentType })
        res.json({ success: true, ...result })
    } catch (error) {
        console.log('checkServiceability:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Velocity settings — read current warehouse + create one from company addr.
// ─────────────────────────────────────────────────────────────────────────────
export const getShippingSettings = async (req, res) => {
    try {
        const settings = await getAdminSettings()
        const wh = await getWarehouseConfig().catch(() => null)
        res.json({
            success: true,
            provider: getAdapter().name,
            configured: velocityAdapter.isConfigured?.() ?? false,
            warehouse: settings.velocity || null,
            effectiveWarehouse: wh,
            company: {
                name: company.legalName,
                address: company.address,
                phone: company.care.phone,
                email: company.care.email,
                gstin: company.gstin,
            },
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export const createWarehouse = async (req, res) => {
    try {
        const b = req.body || {}
        const details = {
            name: b.name || `${company.brand} Warehouse`,
            phone: (b.phone || company.care.phone || '').replace(/\D/g, '').slice(-10),
            email: b.email || company.care.email,
            contactPerson: b.contactPerson || company.legalName,
            gstNo: b.gstNo || company.gstin,
            street: b.street || [company.address.line1, company.address.line2].filter(Boolean).join(', '),
            zip: b.zip || company.address.pincode,
            city: b.city || company.address.city,
            state: b.state || company.address.state,
            country: b.country || company.address.country,
        }
        const { warehouseId } = await velocityAdapter.createWarehouse(details)
        if (!warehouseId) return res.json({ success: false, message: 'Velocity did not return a warehouse id' })

        const settings = await getAdminSettings()
        settings.velocity = {
            warehouseId,
            pickupLocation: b.pickupLocation || details.name,
            warehouseName: details.name,
            createdAt: new Date(),
        }
        await settings.save()
        res.json({ success: true, message: 'Pickup warehouse created', warehouse: settings.velocity })
    } catch (error) {
        console.log('createWarehouse:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public webhook (kept for a future provider push endpoint).
// POST /api/shipment/webhook/:provider
// ─────────────────────────────────────────────────────────────────────────────
export const handleWebhook = async (req, res) => {
    try {
        const adapter = getAdapter(req.params.provider)
        const parsed = adapter.parseWebhook(req)
        if (!parsed) return res.status(400).json({ success: false, message: 'Unrecognized payload' })

        const shipment = await shipmentModel.findOne({ awb: parsed.awb })
        if (!shipment) return res.status(404).json({ success: false, message: 'Unknown AWB' })

        shipment.events.push(parsed.event)
        shipment.status = parsed.status
        if (parsed.currentLocation) shipment.currentLocation = parsed.currentLocation
        if (parsed.status === 'delivered') shipment.deliveredAt = new Date()
        await shipment.save()

        const orderStatus = await syncOrderFromShipment(shipment)
        broadcast(shipment, orderStatus)
        res.json({ success: true })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: error.message })
    }
}
