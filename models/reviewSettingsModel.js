import mongoose from 'mongoose';

// Singleton settings document for the Rating & Review module.
const reviewSettingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    autoApprove: { type: Boolean, default: true },
    requireVerifiedPurchase: { type: Boolean, default: true },
    allowMediaReviews: { type: Boolean, default: true },
    showOnProductPage: { type: Boolean, default: true },
    blockedKeywords: { type: [String], default: ['bad quality', 'worst', 'fake', 'cheap', 'waste of money', 'stupid', 'useless'] },
}, { timestamps: true });

const reviewSettingsModel = mongoose.models.reviewSettings || mongoose.model('reviewSettings', reviewSettingsSchema);

// Get-or-create the singleton.
export const getReviewSettings = async () => {
    let doc = await reviewSettingsModel.findOne({ key: 'global' });
    if (!doc) doc = await reviewSettingsModel.create({ key: 'global' });
    return doc;
};

export default reviewSettingsModel;
