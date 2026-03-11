import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    
    cartData: { type: Object, default: {} },
    
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],
    
    addresses: [{
        name: { type: String },
        phone: { type: String },
        addressLine1: { type: String },
        addressLine2: { type: String },
        city: { type: String },
        state: { type: String },
        pincode: { type: String },
        country: { type: String, default: 'India' },
        isDefault: { type: Boolean, default: false }
    }],
    
    recentlyViewed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],
    
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' }
}, { minimize: false, timestamps: true })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel