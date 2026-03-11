import mongoose from 'mongoose'

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    orderNumber: { type: String, required: true, unique: true },
    
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },
        name: { type: String, required: true },
        image: { type: String },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        size: { type: String },
        color: { type: String }
    }],
    
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    shippingCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    
    couponCode: { type: String },
    couponDiscount: { type: Number, default: 0 },
    
    address: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        addressLine1: { type: String, required: true },
        addressLine2: { type: String },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        country: { type: String, default: 'India' }
    },
    
    status: { 
        type: String, 
        enum: ['Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned', 'Refunded'],
        default: 'Order Placed' 
    },
    
    trackingNumber: { type: String },
    
    paymentMethod: { type: String, required: true },
    payment: { type: Boolean, required: true, default: false },
    paymentId: { type: String },
    
    returnRequest: {
        requested: { type: Boolean, default: false },
        reason: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'] },
        requestDate: { type: Date }
    },
    
    date: { type: Number, required: true }
}, { timestamps: true })

const orderModel = mongoose.models.order || mongoose.model('order',orderSchema)
export default orderModel;