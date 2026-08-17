import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order' },
    
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String },
    comment: { type: String, required: true },
    
    images: [{ type: String }],
    videos: [{ type: String }],
    language: { type: String, default: 'English' },

    verifiedPurchase: { type: Boolean, default: false },

    helpfulCount: { type: Number, default: 0 },

    reported: { type: Boolean, default: false },
    reportReason: { type: String },
    reportResolved: { type: Boolean, default: false },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    
    adminResponse: {
        comment: { type: String },
        respondedAt: { type: Date }
    }
}, { timestamps: true });

reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

const reviewModel = mongoose.models.review || mongoose.model('review', reviewSchema);

export default reviewModel;
