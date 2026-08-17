import mongoose from "mongoose";

const influencerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    dob: { type: Date },
    instagramHandle: { type: String },
    image: { type: String },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product' },

    // Classification
    type: { type: String, enum: ['barter', 'unpaid', 'paid', 'collab', 'other'], default: 'other' },
    category: { type: String },
    address: { type: String },
    notes: { type: String },

    // Commission and earnings
    commissionType: { type: String, enum: ['percentage', 'amount'], default: 'percentage' },
    commissionRate: { type: Number, default: 10 }, // percentage
    commissionAmount: { type: Number, default: 0 }, // flat per-order amount
    sameCommissionForAll: { type: Boolean, default: true },
    totalSales: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },

    // Stats
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },

    status: { type: String, enum: ['active', 'inactive', 'suspended', 'deactivated'], default: 'active' },
    
    // Unique referral code
    referralCode: { type: String, unique: true, required: true }
}, { timestamps: true })

const influencerModel = mongoose.models.influencer || mongoose.model('influencer', influencerSchema);

export default influencerModel
