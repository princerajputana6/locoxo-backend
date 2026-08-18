import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    name: { type: String },                        // internal reference name
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    discountAmount: { type: Number },              // flat ₹ (when percentage not used)
    minPurchaseAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number },

    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    showTimer: { type: Boolean, default: false },  // show countdown on coupon banner

    usageLimit: { type: Number },
    usedCount: { type: Number, default: 0 },

    perUserLimit: { type: Number, default: 1 },

    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'category' }],
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],

    status: { type: String, enum: ['active', 'inactive', 'expired'], default: 'active' },
    visible: { type: Boolean, default: true },     // visible to customers
    exchangeNotAvailable: { type: Boolean, default: false },
    returnNotAvailable: { type: Boolean, default: false },

    // Influencer promo code linkage.
    influencerId: { type: mongoose.Schema.Types.ObjectId, ref: 'influencer' },

    isFirstOrderOnly: { type: Boolean, default: false }
}, { timestamps: true });

const couponModel = mongoose.models.coupon || mongoose.model('coupon', couponSchema);

export default couponModel;
