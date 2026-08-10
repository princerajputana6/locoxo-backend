import mongoose from 'mongoose'

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' }, // optional — manual admin orders may have no account
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
    
    // Superset of the admin workflow (Pending→Confirmed→Packed→Pickuped→Delivered,
    // plus Cancelled/Returned) AND the legacy statuses the storefront still reads.
    status: {
        type: String,
        enum: [
            'Pending', 'Confirmed', 'Packed', 'Pickuped', 'Delivered', 'Cancelled', 'Returned', 'Refunded',
            'Order Placed', 'Processing', 'Packing', 'Shipped', 'Out for delivery', 'Out for Delivery',
        ],
        default: 'Pending'
    },
    statusHistory: [{
        status: { type: String },
        at: { type: Date, default: Date.now },
        by: { type: String },
        note: { type: String },
    }],

    // Free-form order notes (admin).
    orderNotes: [{
        note: { type: String },
        by: { type: String },
        at: { type: Date, default: Date.now },
    }],

    // Pickup / dispatch details captured at the Pickuped stage.
    delivery: {
        partnerName: { type: String },      // delivery partner / person
        courierName: { type: String },      // courier company
        shipmentId: { type: String },       // AWB / shipment id
        weight: { type: String },
        dimensions: { type: String },
    },

    // Set once the Packed stage has decremented variant stock, to prevent double
    // deduction if the status is toggled.
    inventoryReduced: { type: Boolean, default: false },
    isManual: { type: Boolean, default: false },   // created by admin
    customerId: { type: String },                  // denormalised display id

    trackingNumber: { type: String },

    paymentMethod: { type: String, required: true },
    payment: { type: Boolean, required: true, default: false },
    paymentId: { type: String },
    
    // Influencer tracking
    influencerId: { type: mongoose.Schema.Types.ObjectId, ref: 'influencer' },
    referralCode: { type: String },
    
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