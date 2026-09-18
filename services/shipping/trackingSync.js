/**
 * Background tracking poller.
 *
 * Velocity exposes only a pull-based order-tracking API (no webhook in the spec),
 * so we periodically sync every active shipment and push changes to the admin +
 * customer over Socket.IO (via shipmentController.syncActiveShipments).
 *
 * Interval is configurable with TRACKING_SYNC_MINUTES (default 20). Set it to 0
 * to disable the poller entirely (e.g. if you later add a real webhook).
 */

import { syncActiveShipments } from '../../controllers/shipmentController.js'

let timer = null

export const startTrackingSync = () => {
    const minutes = process.env.TRACKING_SYNC_MINUTES !== undefined
        ? Number(process.env.TRACKING_SYNC_MINUTES)
        : 20
    if (!minutes || minutes <= 0) {
        console.log('Tracking sync disabled (TRACKING_SYNC_MINUTES=0)')
        return
    }
    if (timer) clearInterval(timer)

    const run = async () => {
        try {
            const { synced } = await syncActiveShipments()
            if (synced) console.log(`Tracking sync: ${synced} shipment(s) updated`)
        } catch (e) {
            console.log('Tracking sync error:', e.message)
        }
    }

    // First run shortly after boot, then on the interval.
    setTimeout(run, 30 * 1000)
    timer = setInterval(run, minutes * 60 * 1000)
    console.log(`Tracking sync started (every ${minutes} min)`)
}

export const stopTrackingSync = () => { if (timer) clearInterval(timer); timer = null }
