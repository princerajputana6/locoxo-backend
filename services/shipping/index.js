/**
 * Shipping provider adapter registry.
 *
 * To plug in a real carrier (Shiprocket, Delhivery, DHL, etc.) implement the
 * ShippingAdapter interface and register it below. The rest of the app never
 * imports a specific provider — it goes through getAdapter().
 *
 * interface ShippingAdapter {
 *   name: string
 *   createShipment(order): Promise<{ awb, trackingUrl, expectedDelivery, raw }>
 *   getStatus(awb): Promise<{ status, currentLocation, events, raw }>
 *   parseWebhook(req): { awb, status, currentLocation, event } | null
 *   cancel(awb): Promise<boolean>
 * }
 */

import mockAdapter from './mockAdapter.js'

const adapters = {
    mock: mockAdapter,
    // shiprocket: shiprocketAdapter,  // add when integrating
    // delhivery:  delhiveryAdapter,
}

export const getAdapter = (name) => {
    const key = (name || process.env.SHIPPING_PROVIDER || 'mock').toLowerCase()
    return adapters[key] || adapters.mock
}

export const listProviders = () => Object.keys(adapters)
