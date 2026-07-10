import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    phone: { type: String },
    phoneVerified: { type: Boolean, default: false },
    dob: { type: Date },

    // Password reset (email)
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },

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

    // ---- Referral program (customer-to-customer) ----
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    referralCount: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    referralRewarded: { type: Boolean, default: false }, // rewarded for first order yet?

    // ---- Premium membership subscription ----
    subscription: {
        plan: { type: mongoose.Schema.Types.ObjectId, ref: 'membershipPlan' },
        status: { type: String, enum: ['none', 'active', 'expired', 'cancelled'], default: 'none' },
        startDate: { type: Date },
        endDate: { type: Date },
        autoRenew: { type: Boolean, default: false },
        lastPaymentId: { type: String }
    },

    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' }
}, { minimize: false, timestamps: true })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel
