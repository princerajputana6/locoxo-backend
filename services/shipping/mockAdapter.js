/**
 * Mock carrier — no external calls. Generates a fake AWB and a tracking URL
 * that points back to our own /track/:awb route so the UI is testable end-to-end
 * before a real carrier is wired in.
 */

const randomAwb = () => 'LOC' + Date.now() + Math.floor(Math.random() * 1000)

const mockAdapter = {
    name: 'mock',

    async createShipment(order) {
        const awb = randomAwb()
        const expected = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000) // +4 days
        return {
            awb,
            trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/track/${awb}`,
            expectedDelivery: expected,
            raw: { mock: true, orderNumber: order.orderNumber }
        }
    },

    async getStatus(awb) {
        return {
            status: 'in_transit',
            currentLocation: 'Mumbai Hub',
            events: [],
            raw: { mock: true, awb }
        }
    },

    parseWebhook(req) {
        // Standard shape we expect for the mock carrier's incoming webhook
        const { awb, status, location, description } = req.body || {}
        if (!awb || !status) return null
        return {
            awb,
            status,
            currentLocation: location,
            event: { status, description, location }
        }
    },

    async cancel() { return true }
}

export default mockAdapter
