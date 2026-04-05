import mongoose from 'mongoose';

const returnSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },
    reason: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    refundAmount: { type: Number },
    images: [{ type: String }],
    adminNotes: { type: String }
}, { timestamps: true });

const returnModel = mongoose.models.return || mongoose.model('return', returnSchema);

export default returnModel;
