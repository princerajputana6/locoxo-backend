import shipmentModel from '../models/shipmentModel.js'
import orderModel from '../models/orderModel.js'
import { getAdapter } from '../services/shipping/index.js'
import { emitOrderUpdate, emitAdminOrderUpdate } from '../realtime.js'

// Map shipment status → order.status
const SHIP_TO_ORDER_STATUS = {
    created: 'Processing',
    label_generated: 'Processing',
    picked_up: 'Shipped',
    in_transit: 'Shipped',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    failed: 'Cancelled',
    returned: 'Returned',
    cancelled: 'Cancelled',
}

const broadcast = (shipment, orderStatus) => {
    const payload = {
        orderId: shipment.orderId.toString(),
        userId: shipment.userId.toString(),
        shipment,
        orderStatus
    }
    emitOrderUpdate(payload.orderId, payload)
    emitAdminOrderUpdate(payload)
}

// Admin: create a shipment for an order
export const createShipment = async (req, res) => {
    try {
        const { orderId, provider } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) return res.json({ success: false, message: 'Order not found' })

        const existing = await shipmentModel.findOne({ orderId })
        if (existing) return res.json({ success: false, message: 'Shipment already exists', shipment: existing })

        const adapter = getAdapter(provider)
        const { awb, trackingUrl, expectedDelivery, raw } = await adapter.createShipment(order)

        const shipment = await shipmentModel.create({
            orderId,
            userId: order.userId,
            provider: adapter.name,
            awb,
            trackingUrl,
            expectedDelivery,
            status: 'created',
            events: [{ status: 'created', description: 'Shipment created' }],
            providerPayload: raw
        })

        order.status = SHIP_TO_ORDER_STATUS.created
        order.trackingNumber = awb
        await order.save()

        broadcast(shipment, order.status)
        res.json({ success: true, shipment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Admin: append a status event manually (useful for the mock carrier or to override)
export const appendEvent = async (req, res) => {
    try {
        const { status, description, location } = req.body
        const shipment = await shipmentModel.findById(req.params.id)
        if (!shipment) return res.json({ success: false, message: 'Shipment not found' })

        shipment.events.push({ status, description, location })
        shipment.status = status
        if (location) shipment.currentLocation = location
        await shipment.save()

        const orderStatus = SHIP_TO_ORDER_STATUS[status] || 'Processing'
        await orderModel.findByIdAndUpdate(shipment.orderId, { status: orderStatus })

        broadcast(shipment, orderStatus)
        res.json({ success: true, shipment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Admin or anyone with orderId: fetch shipment for an order
export const getByOrder = async (req, res) => {
    try {
        const shipment = await shipmentModel.findOne({ orderId: req.params.orderId })
        if (!shipment) return res.json({ success: true, shipment: null })
        res.json({ success: true, shipment })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Public: track by AWB
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

// Public webhook for carriers to push status changes
// POST /api/shipment/webhook/:provider
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
        await shipment.save()

        const orderStatus = SHIP_TO_ORDER_STATUS[parsed.status] || 'Processing'
        await orderModel.findByIdAndUpdate(shipment.orderId, { status: orderStatus })

        broadcast(shipment, orderStatus)
        res.json({ success: true })
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: error.message })
    }
}
