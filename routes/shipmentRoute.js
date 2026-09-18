import express from 'express'
import {
    createShipment,
    appendEvent,
    getByOrder,
    trackByAwb,
    refreshTracking,
    cancelShipment,
    checkServiceability,
    getShippingSettings,
    createWarehouse,
    handleWebhook,
} from '../controllers/shipmentController.js'
import adminAuth from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const shipmentRouter = express.Router()

// Public
shipmentRouter.get('/track/:awb', trackByAwb)
shipmentRouter.post('/webhook/:provider', handleWebhook)

// Customer
shipmentRouter.get('/order/:orderId', authUser, getByOrder)
shipmentRouter.post('/refresh', authUser, refreshTracking)     // customer "Refresh tracking"

// Admin — shipping ops
shipmentRouter.post('/admin/create', adminAuth, createShipment)      // ship = allocate courier
shipmentRouter.post('/admin/:id/event', adminAuth, appendEvent)
shipmentRouter.get('/admin/order/:orderId', adminAuth, getByOrder)
shipmentRouter.post('/admin/refresh', adminAuth, refreshTracking)
shipmentRouter.post('/admin/cancel', adminAuth, cancelShipment)
shipmentRouter.post('/admin/serviceability', adminAuth, checkServiceability)

// Admin — Velocity settings / warehouse
shipmentRouter.get('/admin/settings', adminAuth, getShippingSettings)
shipmentRouter.post('/admin/warehouse', adminAuth, createWarehouse)

export default shipmentRouter
