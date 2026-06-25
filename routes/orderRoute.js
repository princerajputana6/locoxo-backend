import express from 'express'
import {placeOrder, placeOrderStripe, placeOrderRazorpay, placeOrderCashfree, verifyCashfree, allOrders, userOrders, updateStatus, verifyStripe, verifyRazorpay, downloadInvoice} from '../controllers/orderController.js'
import adminAuth  from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const orderRouter = express.Router()

// Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)

// Payment Features
orderRouter.post('/place',authUser,placeOrder)
orderRouter.post('/stripe',authUser,placeOrderStripe)
orderRouter.post('/razorpay',authUser,placeOrderRazorpay)
orderRouter.post('/cashfree',authUser,placeOrderCashfree)

// User Feature
orderRouter.post('/userorders',authUser,userOrders)

// verify payment
orderRouter.post('/verifyStripe',authUser, verifyStripe)
orderRouter.post('/verifyRazorpay',authUser, verifyRazorpay)
orderRouter.post('/verifyCashfree',authUser, verifyCashfree)

// Invoice download
orderRouter.get('/invoice/:orderId',authUser,downloadInvoice)

export default orderRouter