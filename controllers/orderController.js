import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import influencerModel from "../models/influencerModel.js";
import productModel from "../models/productModel.js";
import stockAdjustmentModel from "../models/stockAdjustmentModel.js";
import Stripe from 'stripe'
import razorpay from 'razorpay'
import generateInvoice from '../utils/invoiceGenerator.js';
import fs from 'fs';
import { createOrder as createCashfreeOrder, getOrderStatus as getCashfreeStatus } from '../services/cashfreeService.js';
import { generateOrderNumber, customerIdFor } from '../utils/orderNumber.js';

// Decrement variant stock for every line of an order and log a 'sale' adjustment.
// Runs once per order (guarded by order.inventoryReduced by the caller).
const reduceInventoryForOrder = async (order, adminEmail) => {
    for (const it of (order.items || [])) {
        try {
            const product = await productModel.findById(it.productId)
            if (!product) continue
            const variant = (product.variants || []).find(
                (v) => v.size === it.size && (v.color === it.color || !it.color)
            ) || (product.variants || [])[0]
            if (!variant) continue
            const before = variant.stock || 0
            variant.stock = Math.max(0, before - (it.quantity || 1))
            await product.save()
            await stockAdjustmentModel.create({
                productId: product._id, productCode: product.productCode, productName: product.name,
                sku: variant.sku, size: variant.size, color: variant.color,
                type: 'sale', qtyChange: variant.stock - before, stockBefore: before, stockAfter: variant.stock,
                reason: `Order ${order.orderNumber} packed`, admin: adminEmail || 'admin',
            })
        } catch (err) { console.log('inventory reduce error:', err.message) }
    }
}

// global variables
const currency = 'inr'
const deliveryCharge = 10

// Reward the referrer (and the referred user) on the referred user's first order.
const applyReferralReward = async (userId) => {
    try {
        const user = await userModel.findById(userId);
        if (!user || !user.referredBy || user.referralRewarded) return;

        const referrerReward = Number(process.env.REFERRAL_REWARD_AMOUNT || 200);
        const refereeReward = Number(process.env.REFERRAL_REWARDEE_AMOUNT || 100);

        const referrer = await userModel.findById(user.referredBy);
        if (referrer) {
            referrer.wallet.balance += referrerReward;
            referrer.wallet.transactions.push({
                description: `Referral reward — ${user.name} placed their first order`,
                amount: referrerReward,
                type: 'credit'
            });
            referrer.referralCount += 1;
            referrer.referralEarnings += referrerReward;
            await referrer.save();
        }

        // Welcome reward for the referred user
        user.wallet.balance += refereeReward;
        user.wallet.transactions.push({
            description: 'Welcome referral reward',
            amount: refereeReward,
            type: 'credit'
        });
        user.referralRewarded = true;
        await user.save();
    } catch (err) {
        console.error('Referral reward error:', err);
    }
};

// gateway initialize — lazy so the server still boots when a gateway's keys
// aren't configured (only the endpoints that use that gateway will error).
let _stripe = null
const stripe = () => {
    if (!_stripe) {
        if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured')
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    }
    return _stripe
}

let _razorpayInstance = null
const razorpayInstance = () => {
    if (!_razorpayInstance) {
        if (!process.env.RAZORPAY_KEY_ID) throw new Error('Razorpay not configured')
        _razorpayInstance = new razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        })
    }
    return _razorpayInstance
}

// Placing orders using COD Method
const placeOrder = async (req,res) => {
    
    try {
        
        console.log('Full Request Body:', JSON.stringify(req.body, null, 2));
        
        const { userId, items, amount, address, orderNumber, subtotal, shippingCharge, referralCode } = req.body;
        
        console.log('Extracted Values:', { userId, orderNumber, subtotal, itemsCount: items?.length, amount });

        if (!orderNumber || !subtotal) {
            return res.json({success:false, message: `Missing required fields: ${!orderNumber ? 'orderNumber ' : ''}${!subtotal ? 'subtotal' : ''}`})
        }

        const orderData = {
            userId,
            orderNumber,
            items,
            subtotal,
            shippingCharge: shippingCharge || deliveryCharge,
            address,
            amount,
            paymentMethod:"COD",
            payment:false,
            date: Date.now()
        }

        // Handle influencer referral
        if (referralCode) {
            const influencer = await influencerModel.findOne({ referralCode });
            if (influencer) {
                orderData.influencerId = influencer._id;
                orderData.referralCode = referralCode;
                
                // Update influencer stats
                influencer.conversions += 1;
                influencer.totalSales += amount;
                influencer.totalEarnings += (amount * influencer.commissionRate) / 100;
                await influencer.save();
            }
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        await userModel.findByIdAndUpdate(userId,{cartData:{}})

        // Customer referral reward (first order)
        await applyReferralReward(userId)

        // Generate invoice
        try {
            const invoicePath = await generateInvoice(orderData);
            console.log('Invoice generated:', invoicePath);
        } catch (invoiceError) {
            console.error('Invoice generation error:', invoiceError);
            // Don't fail the order if invoice generation fails
        }

        res.json({success:true,message:"Order Placed", orderId: newOrder._id})


    } catch (error) {
        console.log('Order Error:', error)
        res.json({success:false,message:error.message})
    }

}

// Placing orders using Stripe Method
const placeOrderStripe = async (req,res) => {
    try {
        
        console.log('Full Request Body:', JSON.stringify(req.body, null, 2));
        
        const { userId, items, amount, address} = req.body
        const { origin } = req.headers;

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"Stripe",
            payment:false,
            date: Date.now()
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const line_items = items.map((item) => ({
            price_data: {
                currency:currency,
                product_data: {
                    name:item.name
                },
                unit_amount: item.price * 100
            },
            quantity: item.quantity
        }))

        line_items.push({
            price_data: {
                currency:currency,
                product_data: {
                    name:'Delivery Charges'
                },
                unit_amount: deliveryCharge * 100
            },
            quantity: 1
        })

        const session = await stripe().checkout.sessions.create({
            success_url: `${origin}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url:  `${origin}/verify?success=false&orderId=${newOrder._id}`,
            line_items,
            mode: 'payment',
        })

        res.json({success:true,session_url:session.url});

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// Verify Stripe 
const verifyStripe = async (req,res) => {

    const { orderId, success, userId } = req.body

    try {
        if (success === "true") {
            const order = await orderModel.findByIdAndUpdate(orderId, {payment:true}, { new: true });
            await userModel.findByIdAndUpdate(userId, {cartData: {}})
            await applyReferralReward(userId)

            // Generate invoice
            try {
                const invoicePath = await generateInvoice(order);
                console.log('Invoice generated:', invoicePath);
            } catch (invoiceError) {
                console.error('Invoice generation error:', invoiceError);
            }
            
            res.json({success: true});
        } else {
            await orderModel.findByIdAndDelete(orderId)
            res.json({success:false})
        }
        
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// Placing orders using Razorpay Method
const placeOrderRazorpay = async (req,res) => {
    try {
        
        const { userId, items, amount, address, orderNumber, subtotal, shippingCharge, referralCode } = req.body

        const orderData = {
            userId,
            orderNumber,
            items,
            subtotal,
            shippingCharge: shippingCharge || deliveryCharge,
            address,
            amount,
            paymentMethod:"Razorpay",
            payment:false,
            date: Date.now()
        }

        // Handle influencer referral
        if (referralCode) {
            const influencer = await influencerModel.findOne({ referralCode });
            if (influencer) {
                orderData.influencerId = influencer._id;
                orderData.referralCode = referralCode;
                
                // Update influencer stats (will be finalized on payment verification)
                influencer.conversions += 1;
                influencer.totalSales += amount;
                influencer.totalEarnings += (amount * influencer.commissionRate) / 100;
                await influencer.save();
            }
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const options = {
            amount: amount * 100,
            currency: currency.toUpperCase(),
            receipt : newOrder._id.toString()
        }

        await razorpayInstance().orders.create(options, (error,order)=>{
            if (error) {
                console.log(error)
                return res.json({success:false, message: error})
            }
            res.json({success:true,order})
        })

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

const verifyRazorpay = async (req,res) => {
    try {
        
        const { userId, razorpay_order_id  } = req.body

        const orderInfo = await razorpayInstance().orders.fetch(razorpay_order_id)
        if (orderInfo.status === 'paid') {
            const order = await orderModel.findByIdAndUpdate(orderInfo.receipt,{payment:true}, { new: true });
            await userModel.findByIdAndUpdate(req.body.userId,{cartData:{}})
            await applyReferralReward(req.body.userId)

            // Generate invoice
            try {
                const invoicePath = await generateInvoice(order);
                console.log('Invoice generated:', invoicePath);
            } catch (invoiceError) {
                console.error('Invoice generation error:', invoiceError);
            }
            
            res.json({ success: true, message: "Payment Successful" })
        } else {
             res.json({ success: false, message: 'Payment Failed' });
        }

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}


// Placing orders using Cashfree Method
const placeOrderCashfree = async (req,res) => {
    try {
        const { userId, items, amount, address, orderNumber, subtotal, shippingCharge, referralCode, email } = req.body

        const orderData = {
            userId,
            orderNumber,
            items,
            subtotal,
            shippingCharge: shippingCharge || deliveryCharge,
            address,
            amount,
            paymentMethod:"Cashfree",
            payment:false,
            date: Date.now()
        }

        // Handle influencer referral
        if (referralCode) {
            const influencer = await influencerModel.findOne({ referralCode });
            if (influencer) {
                orderData.influencerId = influencer._id;
                orderData.referralCode = referralCode;
                influencer.conversions += 1;
                influencer.totalSales += amount;
                influencer.totalEarnings += (amount * influencer.commissionRate) / 100;
                await influencer.save();
            }
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const frontendUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173'

        const cfOrder = await createCashfreeOrder({
            orderId: newOrder._id.toString(),
            amount,
            customer: {
                id: userId.toString(),
                name: address?.name,
                email: email,
                phone: address?.phone
            },
            returnUrl: `${frontendUrl}/verify-cashfree?orderId=${newOrder._id}`
        })

        res.json({
            success: true,
            orderId: newOrder._id,
            paymentSessionId: cfOrder.payment_session_id,
            cfOrderId: cfOrder.order_id,
            mode: (process.env.CASHFREE_ENV || 'TEST').toUpperCase() === 'PROD' ? 'production' : 'sandbox'
        })

    } catch (error) {
        console.log('Cashfree order error:', error)
        res.json({success:false,message:error.message})
    }
}

// Verify Cashfree payment
const verifyCashfree = async (req,res) => {
    try {
        const { userId, orderId } = req.body
        if (!orderId) return res.json({ success:false, message:'Missing orderId' })

        const status = await getCashfreeStatus(orderId) // Cashfree order_id === our order _id

        if (status === 'PAID') {
            const order = await orderModel.findByIdAndUpdate(orderId, { payment:true }, { new:true })
            await userModel.findByIdAndUpdate(userId, { cartData:{} })
            await applyReferralReward(userId)

            try {
                await generateInvoice(order);
            } catch (invoiceError) {
                console.error('Invoice generation error:', invoiceError);
            }

            return res.json({ success:true, message:'Payment Successful' })
        }

        res.json({ success:false, message:`Payment not completed (status: ${status})` })

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// All Orders data for Admin Panel
const allOrders = async (req,res) => {
    try {
        const { search, status, from, to } = req.body || {}
        const q = {}
        if (status && status !== 'All') q.status = status
        if (from || to) {
            q.date = {}
            if (from) q.date.$gte = new Date(from).getTime()
            if (to) q.date.$lte = new Date(to).getTime() + 86400000 // inclusive of the 'to' day
        }

        let orders = await orderModel.find(q).sort({ date: -1 }).populate('userId', 'name email phone').lean()

        // Attach a display customer id for each order.
        orders = orders.map((o) => ({
            ...o,
            customerId: o.customerId || customerIdFor(o.userId),
        }))

        // Free-text search across order number / customer id / customer name.
        const s = (search || '').trim().toLowerCase()
        if (s) {
            orders = orders.filter((o) =>
                `${o.orderNumber || ''} ${o.customerId || ''} ${o.userId?.name || ''} ${o.address?.name || ''} ${o.userId?.phone || ''}`
                    .toLowerCase().includes(s)
            )
        }

        res.json({ success: true, orders })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// User Order Data For Forntend
const userOrders = async (req,res) => {
    try {
        
        const { userId } = req.body

        const orders = await orderModel.find({ userId })
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// update order status from Admin Panel — drives the workflow side effects.
const updateStatus = async (req,res) => {
    try {
        const { orderId, status, note } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) return res.json({ success: false, message: 'Order not found' })

        const admin = req.adminEmail || 'admin'

        // Confirmed → assign the LX order number (if still on a legacy/temp one) and
        // generate the invoice.
        if (status === 'Confirmed') {
            if (!/^LX\d{4}100/.test(order.orderNumber || '')) {
                order.orderNumber = await generateOrderNumber()
            }
        }

        // Packed → decrement inventory exactly once and log the sale.
        if (status === 'Packed' && !order.inventoryReduced) {
            await reduceInventoryForOrder(order, admin)
            order.inventoryReduced = true
        }

        order.status = status
        order.statusHistory = order.statusHistory || []
        order.statusHistory.push({ status, at: new Date(), by: admin, note: note || '' })
        await order.save()

        // Generate/refresh the invoice once confirmed (best-effort).
        if (status === 'Confirmed') {
            try { await generateInvoice(order) } catch (e) { console.log('invoice gen:', e.message) }
        }

        res.json({ success: true, message: `Status updated to ${status}`, orderNumber: order.orderNumber })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Add an order note (admin).
const addOrderNote = async (req, res) => {
    try {
        const { orderId, note } = req.body
        if (!note?.trim()) return res.json({ success: false, message: 'Note is empty' })
        const order = await orderModel.findByIdAndUpdate(
            orderId,
            { $push: { orderNotes: { note: note.trim(), by: req.adminEmail || 'admin', at: new Date() } } },
            { new: true }
        )
        if (!order) return res.json({ success: false, message: 'Order not found' })
        res.json({ success: true, message: 'Note added', orderNotes: order.orderNotes })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Capture pickup / dispatch details (delivery partner, courier, shipment id,
// weight, dimensions) at the Pickuped stage.
const setDelivery = async (req, res) => {
    try {
        const { orderId, partnerName, courierName, shipmentId, weight, dimensions, markPickuped } = req.body
        const update = {
            'delivery.partnerName': partnerName, 'delivery.courierName': courierName,
            'delivery.shipmentId': shipmentId, 'delivery.weight': weight, 'delivery.dimensions': dimensions,
        }
        if (shipmentId) update.trackingNumber = shipmentId
        if (markPickuped) update.status = 'Pickuped'
        const order = await orderModel.findByIdAndUpdate(orderId, update, { new: true })
        if (!order) return res.json({ success: false, message: 'Order not found' })
        if (markPickuped) {
            order.statusHistory.push({ status: 'Pickuped', at: new Date(), by: req.adminEmail || 'admin' })
            await order.save()
        }
        res.json({ success: true, message: 'Dispatch details saved', order })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Manual order creation by admin.
const createManualOrder = async (req, res) => {
    try {
        const { userId, items, address, paymentMethod = 'COD', payment = false, shippingCharge = 0, discount = 0 } = req.body
        if (!Array.isArray(items) || items.length === 0) return res.json({ success: false, message: 'Add at least one item' })
        if (!address?.name || !address?.phone) return res.json({ success: false, message: 'Customer name and phone are required' })

        const subtotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)
        const amount = subtotal + Number(shippingCharge || 0) - Number(discount || 0)

        // Resolve/attach a user if one was supplied, for the customer id.
        let user = null
        if (userId) { try { user = await userModel.findById(userId).lean() } catch { /* ignore */ } }

        const order = new orderModel({
            userId: userId || undefined,
            orderNumber: await generateOrderNumber(),
            items,
            subtotal, discount, shippingCharge, amount,
            address,
            status: 'Confirmed',
            paymentMethod, payment: !!payment,
            isManual: true,
            customerId: user ? customerIdFor(user) : undefined,
            statusHistory: [{ status: 'Confirmed', at: new Date(), by: req.adminEmail || 'admin', note: 'Manual order' }],
            date: Date.now(),
        })
        await order.save()
        try { await generateInvoice(order) } catch (e) { console.log('invoice gen:', e.message) }
        res.json({ success: true, message: 'Manual order created', orderId: order._id, orderNumber: order.orderNumber })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// POST /api/order/pending-reason  body { orderId, pendingReason, pendingNote }
const setPendingReason = async (req, res) => {
    try {
        const { orderId, pendingReason, pendingNote } = req.body
        const order = await orderModel.findByIdAndUpdate(orderId, { pendingReason, pendingNote }, { new: true })
        if (!order) return res.json({ success: false, message: 'Order not found' })
        res.json({ success: true, message: 'Pending reason saved', order })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// POST /api/order/verify-barcode  body { orderId, codeType, code }
// Verifies the product SKU / human-readable code before confirming dispatch.
const verifyBarcode = async (req, res) => {
    try {
        const { orderId, codeType, code } = req.body
        const order = await orderModel.findById(orderId)
        if (!order) return res.json({ success: false, message: 'Order not found' })

        // Match against any line item's product variant (sku / barcode / humanBarcode / productCode).
        let matched = false
        for (const it of (order.items || [])) {
            const p = await productModel.findById(it.productId).lean()
            if (!p) continue
            if (p.productCode && String(p.productCode) === String(code)) { matched = true; break }
            const v = (p.variants || []).find((v) => [v.sku, v.barcode, v.humanBarcode].map(String).includes(String(code)))
            if (v) { matched = true; break }
        }
        order.barcodeVerification = { verified: matched, codeType, code, at: new Date(), by: req.adminEmail || 'admin' }
        await order.save()
        res.json({ success: matched, message: matched ? 'Code verified' : 'Code did not match any item', verification: order.barcodeVerification })
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }) }
}

// Orders report — grouped counts + revenue by day / week / month / year.
const ordersReport = async (req, res) => {
    try {
        const period = (req.query.period || 'daily').toLowerCase()
        const fmt = { daily: '%Y-%m-%d', weekly: '%G-W%V', monthly: '%Y-%m', yearly: '%Y' }[period] || '%Y-%m-%d'
        const rows = await orderModel.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: fmt, date: { $toDate: '$date' } } },
                    orders: { $sum: 1 },
                    revenue: { $sum: '$amount' },
                    delivered: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
                },
            },
            { $sort: { _id: -1 } },
            { $limit: 90 },
        ])
        res.json({ success: true, period, rows })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Excel export — delivered / cancelled orders only: order id, date/time, product, status.
const exportOrdersExcel = async (req, res) => {
    try {
        const { status = 'Delivered', from, to } = req.query
        const q = {}
        if (status && status !== 'All') q.status = status
        else q.status = { $in: ['Delivered', 'Cancelled'] }
        if (from || to) {
            q.date = {}
            if (from) q.date.$gte = new Date(from).getTime()
            if (to) q.date.$lte = new Date(to).getTime() + 86400000
        }
        const orders = await orderModel.find(q).sort({ date: -1 }).lean()

        const data = []
        orders.forEach((o) => {
            const dt = new Date(o.date)
            const products = (o.items || []).map((i) => `${i.name} x${i.quantity}${i.size ? ` (${i.size})` : ''}`).join('; ')
            data.push({
                'Order ID': o.orderNumber,
                'Date': dt.toLocaleDateString('en-IN'),
                'Time': dt.toLocaleTimeString('en-IN'),
                'Product': products,
                'Amount': o.amount,
                'Payment': o.paymentMethod,
                'Status': o.status,
            })
        })

        const XLSX = (await import('xlsx')).default
        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Orders')
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('Content-Disposition', `attachment; filename="orders-${status}-${Date.now()}.xlsx"`)
        res.send(buf)
    } catch (error) {
        console.log(error)
        if (!res.headersSent) res.status(500).json({ success: false, message: error.message })
    }
}

// Download Invoice
const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await orderModel.findById(orderId);

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        const invoicePath = `invoices/invoice-${order.orderNumber}.pdf`;
        
        if (fs.existsSync(invoicePath)) {
            res.download(invoicePath);
        } else {
            // Generate invoice if it doesn't exist
            const newInvoicePath = await generateInvoice(order);
            res.download(newInvoicePath);
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export {verifyRazorpay, verifyStripe ,placeOrder, placeOrderStripe, placeOrderRazorpay, placeOrderCashfree, verifyCashfree, allOrders, userOrders, updateStatus, downloadInvoice, addOrderNote, setDelivery, createManualOrder, ordersReport, exportOrdersExcel, setPendingReason, verifyBarcode}