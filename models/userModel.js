import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    phone: { type: String },
    dob: { type: Date },

    googleId: { type: String },
    photoURL: { type: String },

    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },

    cartData: { type: Object, default: {} },

    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],

    addresses: [{
        type: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
        name: { type: String },
        phone: { type: String },
        street: { type: String },
        addressLine2: { type: String },
        landmark: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String, default: 'India' },
        lat: { type: Number },
        lng: { type: Number },
        isDefault: { type: Boolean, default: false }
    }],

    wallet: {
        balance: { type: Number, default: 0 },
        transactions: [{
            description: { type: String },
            amount: { type: Number },
            type: { type: String, enum: ['credit', 'debit'] },
            date: { type: Date, default: Date.now }
        }]
    },

    payments: [{
        method: { type: String },
        details: { type: String }
    }],

    recentlyViewed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],

    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' }
}, { minimize: false, timestamps: true })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel
