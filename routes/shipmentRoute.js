import express from 'express'
import {
    createShipment,
    appendEvent,
    getByOrder,
    trackByAwb,
    handleWebhook
} from '../controllers/shipmentController.js'
import adminAuth from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const shipmentRouter = express.Router()

// Public
shipmentRouter.get('/track/:awb', trackByAwb)
shipmentRouter.post('/webhook/:provider', handleWebhook)

// Customer
shipmentRouter.get('/order/:orderId', authUser, getByOrder)

// Admin
shipmentRouter.post('/admin/create', adminAuth, createShipment)
shipmentRouter.post('/admin/:id/event', adminAuth, appendEvent)
shipmentRouter.get('/admin/order/:orderId', adminAuth, getByOrder)

export default shipmentRouter
