/**
 * Shipping provider adapter registry.
 *
 * The rest of the app never imports a specific provider — it goes through
 * getAdapter(). To plug in another carrier, implement the ShippingAdapter
 * interface and register it below.
 *
 * interface ShippingAdapter {
 *   name: string
 *   isConfigured?(): boolean
 *   createShipment(order, opts): Promise<{ awb, courierName, labelUrl, ... }>
 *   createReturn?(order, opts): Promise<{ awb, courierName, ... }>
 *   getStatus(awb): Promise<{ status, currentLocation, events, raw }>
 *   getStatusBulk?(awbs): Promise<{ [awb]: statusResult }>
 *   serviceability?(args): Promise<{ serviceable, zone, carriers }>
 *   createWarehouse?(details): Promise<{ warehouseId }>
 *   parseWebhook(req): { awb, status, currentLocation, event } | null
 *   cancel(awb): Promise<boolean>
 * }
 */

import mockAdapter from './mockAdapter.js'
import velocityAdapter from './velocityAdapter.js'

const adapters = {
    mock: mockAdapter,
    velocity: velocityAdapter,
}

// Default provider: explicit env wins; otherwise Velocity when it has credentials,
// else the mock carrier so the app still works end-to-end in dev.
const defaultProvider = () => {
    if (process.env.SHIPPING_PROVIDER) return process.env.SHIPPING_PROVIDER.toLowerCase()
    if (velocityAdapter.isConfigured?.()) return 'velocity'
    return 'mock'
}

export const getAdapter = (name) => {
    const key = (name || defaultProvider()).toLowerCase()
    return adapters[key] || adapters.mock
}

export const listProviders = () => Object.keys(adapters)
