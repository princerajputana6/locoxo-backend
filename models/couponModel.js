import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    minPurchaseAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number },
    
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    
    usageLimit: { type: Number },
    usedCount: { type: Number, default: 0 },
    
    perUserLimit: { type: Number, default: 1 },
    
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'category' }],
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],
    
    status: { type: String, enum: ['active', 'inactive', 'expired'], default: 'active' },
    
    isFirstOrderOnly: { type: Boolean, default: false }
}, { timestamps: true });

const couponModel = mongoose.models.coupon || mongoose.model('coupon', couponSchema);

export default couponModel;
