import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import influencerModel from "../models/influencerModel.js";
import Stripe from 'stripe'
import razorpay from 'razorpay'
import generateInvoice from '../utils/invoiceGenerator.js';
import fs from 'fs';
import { createOrder as createCashfreeOrder, getOrderStatus as getCashfreeStatus } from '../services/cashfreeService.js';

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

// gateway initialize
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const razorpayInstance = new razorpay({
    key_id : process.env.RAZORPAY_KEY_ID,
    key_secret : process.env.RAZORPAY_KEY_SECRET,
})

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

        const session = await stripe.checkout.sessions.create({
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

        await razorpayInstance.orders.create(options, (error,order)=>{
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

        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)
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
        
        const orders = await orderModel.find({})
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
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

// update order status from Admin Panel
const updateStatus = async (req,res) => {
    try {
        
        const { orderId, status } = req.body

        await orderModel.findByIdAndUpdate(orderId, { status })
        res.json({success:true,message:'Status Updated'})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
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

export {verifyRazorpay, verifyStripe ,placeOrder, placeOrderStripe, placeOrderRazorpay, placeOrderCashfree, verifyCashfree, allOrders, userOrders, updateStatus, downloadInvoice}