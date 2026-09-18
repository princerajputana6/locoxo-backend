/**
 * Velocity Shipping (formerly Shipfast) adapter.
 *
 * Implements the ShippingAdapter interface consumed by the rest of the app via
 * services/shipping/index.js → getAdapter(). Nothing outside this file knows the
 * Velocity request/response shapes.
 *
 * Auth: POST /custom/api/v1/auth-token with { username (mobile +91…), password }.
 * The returned token is sent as a raw `Authorization: <token>` header (NO Bearer)
 * and is valid for 24h — we cache it in memory and refresh a few minutes early.
 *
 * Docs: Velocity Shipping Custom API Documentation V1.
 *   Base URL           https://shazam.velocity.in/
 *   Auth               /custom/api/v1/auth-token
 *   Warehouse          /custom/api/v1/warehouse
 *   Serviceability     /custom/api/v1/serviceability
 *   Forward (1-shot)   /custom/api/v1/forward-order-orchestration
 *   Reverse (1-shot)   /custom/api/v1/reverse-order-orchestration
 *   Cancel             /custom/api/v1/cancel-order
 *   Tracking           /custom/api/v1/order-tracking
 *   Reports            /custom/api/v1/reports
 *
 * Required env:  VELOCITY_USERNAME, VELOCITY_PASSWORD
 * Optional env:  VELOCITY_BASE_URL, VELOCITY_WAREHOUSE_ID, VELOCITY_PICKUP_LOCATION,
 *                VELOCITY_CLIENT_ID
 */

import company from '../../config/company.js'
import { getAdminSettings } from '../../models/adminSettingsModel.js'

const BASE_URL = (process.env.VELOCITY_BASE_URL || 'https://shazam.velocity.in').replace(/\/+$/, '')
const USERNAME = process.env.VELOCITY_USERNAME || ''
const PASSWORD = process.env.VELOCITY_PASSWORD || ''

// ── Token cache ──────────────────────────────────────────────────────────────
let cached = { token: null, expiresAt: 0 }

const isConfigured = () => Boolean(USERNAME && PASSWORD)

const getToken = async () => {
    if (!isConfigured()) {
        throw new Error('Velocity Shipping is not configured — set VELOCITY_USERNAME and VELOCITY_PASSWORD in the backend .env')
    }
    // Reuse a still-valid token (refresh 5 min early).
    if (cached.token && Date.now() < cached.expiresAt - 5 * 60 * 1000) return cached.token

    const res = await fetch(`${BASE_URL}/custom/api/v1/auth-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.token) {
        throw new Error(data.message || `Velocity auth failed (HTTP ${res.status})`)
    }
    cached = {
        token: data.token,
        // expires_at is an ISO-ish local time string; fall back to +23h.
        expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 23 * 60 * 60 * 1000,
    }
    return cached.token
}

// Authenticated JSON request with a single retry on a 401 (stale token).
const request = async (path, body, { retry = true } = {}) => {
    const token = await getToken()
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401 && retry) {
        cached = { token: null, expiresAt: 0 }
        return request(path, body, { retry: false })
    }
    if (!res.ok) {
        // Velocity returns errors as { meta: { message, details } } on some
        // endpoints and { message } / { errors } on others.
        const msg = data.meta?.details || data.meta?.message || data.message || data.error
            || (data.errors && JSON.stringify(data.errors)) || `HTTP ${res.status}`
        throw new Error(`Velocity ${path}: ${msg}`)
    }
    return data
}

// ── Status mapping ───────────────────────────────────────────────────────────
// Collapse Velocity's free-text statuses / activities into our shipment enum:
// created | label_generated | picked_up | in_transit | out_for_delivery |
// delivered | failed | returned | cancelled
export const mapVelocityStatus = (raw) => {
    const s = String(raw || '').toLowerCase().trim()
    if (!s) return null
    if (/(^|\b)(delivered)\b/.test(s) && !/rto|return/.test(s)) return 'delivered'
    if (/rto.*deliver|return.*deliver|returned|rto/.test(s)) return 'returned'
    if (/out.?for.?delivery|ofd/.test(s)) return 'out_for_delivery'
    if (/out.?for.?pickup|pickup.?scheduled|pickup.?pending|awaiting.?pickup/.test(s)) return 'created'
    if (/picked.?up|pickup.?done|pickup.?complete/.test(s)) return 'picked_up'
    if (/in.?transit|dispatch|in.?scan|out.?scan|shipped|bagged|received.?at|reached/.test(s)) return 'in_transit'
    if (/manifest|label|booked|order.?placed/.test(s)) return 'label_generated'
    if (/cancel/.test(s)) return 'cancelled'
    if (/lost|damaged|undelivered|failed|exception|not.?delivered/.test(s)) return 'failed'
    return null
}

const parseDimensions = (dims) => {
    // Accepts "30 x 20 x 5", "30×20×5cm", etc. Falls back to sane defaults.
    const nums = String(dims || '').match(/[\d.]+/g)?.map(Number).filter((n) => n > 0) || []
    return {
        length: nums[0] || Number(process.env.VELOCITY_DEFAULT_LENGTH) || 30,
        breadth: nums[1] || Number(process.env.VELOCITY_DEFAULT_BREADTH) || 25,
        height: nums[2] || Number(process.env.VELOCITY_DEFAULT_HEIGHT) || 5,
    }
}

const fmtOrderDate = (d) => {
    const dt = d ? new Date(d) : new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}

// Resolve the pickup warehouse (env override wins, else the runtime-created one
// stored in adminSettings by createWarehouse()).
export const getWarehouseConfig = async () => {
    if (process.env.VELOCITY_WAREHOUSE_ID) {
        return {
            warehouseId: process.env.VELOCITY_WAREHOUSE_ID,
            pickupLocation: process.env.VELOCITY_PICKUP_LOCATION || 'Primary',
        }
    }
    try {
        const settings = await getAdminSettings()
        if (settings?.velocity?.warehouseId) {
            return {
                warehouseId: settings.velocity.warehouseId,
                pickupLocation: settings.velocity.pickupLocation || 'Primary',
            }
        }
    } catch { /* settings unavailable — fall through */ }
    return null
}

const vendorDetails = () => ({
    email: company.care.email,
    phone: String(company.care.phone || '').replace(/\D/g, '').slice(-10),
    name: company.legalName,
    address: company.address.line1,
    address_2: company.address.line2 || '',
    city: company.address.city,
    state: company.address.state,
    country: company.address.country,
    pin_code: company.address.pincode,
    pickup_location: process.env.VELOCITY_PICKUP_LOCATION || 'Primary',
})

// ── Adapter ──────────────────────────────────────────────────────────────────
const velocityAdapter = {
    name: 'velocity',
    isConfigured,

    /**
     * Forward shipment (create order + auto-allocate courier + AWB + label).
     * @param order  Mongoose order doc
     * @param opts   { carrierId?, weight?, dimensions? } overrides
     */
    async createShipment(order, opts = {}) {
        const wh = await getWarehouseConfig()
        if (!wh) {
            throw new Error('No Velocity pickup warehouse configured — create one from Admin → Shipping first')
        }

        const a = order.address || {}
        const isCOD = String(order.paymentMethod || '').toUpperCase() === 'COD'
        const weight = Number(opts.weight ?? order.delivery?.weight) || Number(process.env.VELOCITY_DEFAULT_WEIGHT) || 0.5
        const dims = parseDimensions(opts.dimensions ?? order.delivery?.dimensions)

        const items = (order.items || []).map((it) => ({
            name: it.name,
            sku: it.sku || String(it.productId || it.name).slice(-24),
            units: Number(it.quantity) || 1,
            selling_price: Number(it.price) || 0,
            discount: 0,
            tax: 0,
        }))

        const payload = {
            order_id: order.orderNumber,
            order_date: fmtOrderDate(order.createdAt || order.date),
            carrier_id: opts.carrierId || '',            // blank ⇒ auto-allocation by shipping rules
            billing_customer_name: a.name || 'Customer',
            billing_address: [a.addressLine1, a.addressLine2].filter(Boolean).join(', '),
            billing_city: a.city,
            billing_pincode: String(a.pincode || ''),
            billing_state: a.state,
            billing_country: a.country || 'India',
            billing_email: order.billingEmail || company.care.email,
            billing_phone: String(a.phone || order.manualContact || '').replace(/\D/g, '').slice(-10),
            shipping_is_billing: true,
            print_label: true,
            order_items: items,
            payment_method: isCOD ? 'COD' : 'PREPAID',
            sub_total: Number(order.subtotal) || Number(order.amount) || 0,
            cod_collectible: isCOD ? (Number(order.amount) || 0) : 0,
            length: dims.length,
            breadth: dims.breadth,
            height: dims.height,
            weight,
            pickup_location: wh.pickupLocation,
            warehouse_id: wh.warehouseId,
            vendor_details: vendorDetails(),
        }

        const data = await request('/custom/api/v1/forward-order-orchestration', payload)
        const p = data.payload || {}
        if (!p.awb_code) {
            throw new Error(`Courier allocation failed for ${order.orderNumber} — Velocity returned no AWB`)
        }

        return {
            awb: p.awb_code,
            courierName: p.courier_name || '',
            courierCompanyId: p.courier_company_id || '',
            labelUrl: p.label_url || null,
            manifestUrl: p.manifest_url || null,
            providerShipmentId: p.shipment_id || '',
            providerOrderId: p.order_id || '',
            appliedWeight: p.applied_weight ?? weight,
            cod: !!p.cod,
            charges: p.charges || null,
            trackingUrl: `${BASE_URL.replace('shazam.', 'shipfastt.').replace('.velocity.in', '.in')}/track/${p.awb_code}`,
            expectedDelivery: null,
            raw: data,
        }
    },

    /**
     * Reverse (return) pickup — create order + allocate courier in one shot.
     * `order` here is a return-shaped object (customer = pickup, warehouse = drop).
     */
    async createReturn(order, opts = {}) {
        const wh = await getWarehouseConfig()
        if (!wh) throw new Error('No Velocity pickup warehouse configured')

        const a = order.address || {}
        const items = (order.items || []).map((it) => ({
            name: it.name,
            sku: it.sku || String(it.productId || it.name).slice(-24),
            units: Number(it.quantity) || 1,
            selling_price: Number(it.price) || 0,
            discount: 0,
            ...(it.qcEnable ? {
                qc_enable: true,
                qc_product_name: it.name,
                qc_brand: it.qcBrand || company.brand,
                qc_product_image: it.image || it.qcImage,
            } : {}),
        }))
        const dims = parseDimensions(opts.dimensions ?? order.delivery?.dimensions)

        const payload = {
            order_id: `RET-${order.orderNumber}`,
            order_date: fmtOrderDate(),
            carrier_id: opts.carrierId || '',
            // Pickup = customer address
            pickup_customer_name: a.name || 'Customer',
            pickup_address: [a.addressLine1, a.addressLine2].filter(Boolean).join(', '),
            pickup_city: a.city,
            pickup_state: a.state,
            pickup_country: a.country || 'India',
            pickup_pincode: String(a.pincode || ''),
            pickup_email: order.billingEmail || company.care.email,
            pickup_phone: String(a.phone || '').replace(/\D/g, '').slice(-10),
            pickup_isd_code: '91',
            // Shipping = our warehouse
            shipping_customer_name: company.legalName,
            shipping_address: company.address.line1,
            shipping_address_2: company.address.line2 || '',
            shipping_city: company.address.city,
            shipping_state: company.address.state,
            shipping_country: company.address.country,
            shipping_pincode: company.address.pincode,
            shipping_email: company.care.email,
            shipping_isd_code: '91',
            shipping_phone: String(company.care.phone || '').replace(/\D/g, '').slice(-10),
            order_items: items,
            payment_method: 'PREPAID',
            total_discount: '0',
            sub_total: Number(order.subtotal) || Number(order.amount) || 0,
            length: dims.length,
            breadth: dims.breadth,
            height: dims.height,
            weight: Number(opts.weight ?? order.delivery?.weight) || 0.3,
            warehouse_id: wh.warehouseId,
            request_pickup: true,
        }

        const data = await request('/custom/api/v1/reverse-order-orchestration', payload)
        const p = data.payload || {}
        return {
            awb: p.awb_code || '',
            courierName: p.courier_name || '',
            courierCompanyId: p.courier_company_id || '',
            providerShipmentId: p.shipment_id || '',
            providerOrderId: p.order_id || '',
            appliedWeight: p.applied_weight ?? null,
            charges: p.charges || null,
            isReturn: true,
            raw: data,
        }
    },

    /** Pull real-time tracking for a single AWB. */
    async getStatus(awb) {
        const data = await request('/custom/api/v1/order-tracking', { awbs: [awb] })
        const td = data?.result?.[awb]?.tracking_data
        if (!td) return { status: null, currentLocation: null, events: [], raw: data }

        const track = td.shipment_track?.[0] || {}
        const activities = td.shipment_track_activities || []

        const events = activities.map((ev) => ({
            status: mapVelocityStatus(ev.activity) || 'in_transit',
            description: ev.activity,
            location: ev.location,
            timestamp: ev.date ? new Date(ev.date) : new Date(),
        }))

        const status =
            mapVelocityStatus(td.shipment_status) ||
            mapVelocityStatus(track.current_status) ||
            (events[0]?.status) ||
            null

        return {
            status,
            currentLocation: track.destination || activities[0]?.location || null,
            deliveredDate: track.delivered_date ? new Date(track.delivered_date) : null,
            trackUrl: td.track_url || null,
            courierCompanyId: track.courier_company_id || null,
            events,
            raw: data,
        }
    },

    /** Pull tracking for many AWBs at once ⇒ { awb: statusResult }. */
    async getStatusBulk(awbs) {
        if (!awbs?.length) return {}
        const data = await request('/custom/api/v1/order-tracking', { awbs })
        const out = {}
        for (const awb of awbs) {
            const td = data?.result?.[awb]?.tracking_data
            if (!td) continue
            const track = td.shipment_track?.[0] || {}
            const activities = td.shipment_track_activities || []
            out[awb] = {
                status:
                    mapVelocityStatus(td.shipment_status) ||
                    mapVelocityStatus(track.current_status) ||
                    null,
                currentLocation: track.destination || activities[0]?.location || null,
                deliveredDate: track.delivered_date ? new Date(track.delivered_date) : null,
                trackUrl: td.track_url || null,
                events: activities.map((ev) => ({
                    status: mapVelocityStatus(ev.activity) || 'in_transit',
                    description: ev.activity,
                    location: ev.location,
                    timestamp: ev.date ? new Date(ev.date) : new Date(),
                })),
            }
        }
        return out
    },

    /** Cancel one or more AWBs (max 50 per call). */
    async cancel(awb) {
        const awbs = Array.isArray(awb) ? awb : [awb]
        await request('/custom/api/v1/cancel-order', { awbs })
        return true
    },

    /** Check pickup↔delivery serviceability and list eligible carriers. */
    async serviceability({ from, to, paymentMode = 'prepaid', shipmentType = 'forward' }) {
        const data = await request('/custom/api/v1/serviceability', {
            from: String(from),
            to: String(to),
            payment_mode: paymentMode,
            shipment_type: shipmentType,
        })
        return {
            serviceable: data.status === 'SUCCESS',
            zone: data.result?.zone || null,
            carriers: data.result?.serviceability_results || [],
            raw: data,
        }
    },

    /** Create a pickup warehouse in Velocity from a details object. */
    async createWarehouse(details) {
        const data = await request('/custom/api/v1/warehouse', {
            name: details.name,
            phone_number: details.phone,
            gst_no: details.gstNo || undefined,
            email: details.email,
            contact_person: details.contactPerson,
            address_attributes: {
                street_address: details.street,
                zip: details.zip,
                city: details.city,
                state: details.state,
                country: details.country || 'India',
            },
        })
        return { warehouseId: data.payload?.warehouse_id, raw: data }
    },

    /** Status-based summary report for forward / return shipments. */
    async report({ startDateTime, endDateTime, shipmentType = 'forward' }) {
        return request('/custom/api/v1/reports', {
            start_date_time: startDateTime,
            end_date_time: endDateTime,
            shipment_type: shipmentType,
        })
    },

    // We poll (getStatus) rather than receive webhooks, but keep a generic parser
    // so a future Velocity push endpoint can reuse the same pipeline.
    parseWebhook(req) {
        const { awb, awb_code, status, shipment_status, location, activity } = req.body || {}
        const id = awb || awb_code
        const raw = status || shipment_status || activity
        if (!id || !raw) return null
        return {
            awb: id,
            status: mapVelocityStatus(raw) || 'in_transit',
            currentLocation: location,
            event: { status: mapVelocityStatus(raw) || 'in_transit', description: activity || raw, location },
        }
    },
}

export default velocityAdapter
