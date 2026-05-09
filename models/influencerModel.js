import mongoose from "mongoose";

const influencerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    instagramHandle: { type: String },
    image: { type: String },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product' },
    
    // Commission and earnings
    commissionRate: { type: Number, default: 10 }, // percentage
    totalSales: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    
    // Stats
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    
    // Unique referral code
    referralCode: { type: String, unique: true, required: true }
}, { timestamps: true })

const influencerModel = mongoose.models.influencer || mongoose.model('influencer', influencerSchema);

export default influencerModel
