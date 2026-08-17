import mongoose from 'mongoose';
import { nextSeq } from './counterModel.js';

const returnSchema = new mongoose.Schema({
    returnNumber: { type: String, index: true },   // RET-0001
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },

    // Return / refund / exchange.
    type: { type: String, enum: ['return', 'refund', 'exchange'], default: 'return' },

    // Logistics + manual entry (Return, Refund & Exchange Management table).
    manualBarcode: { type: String },
    pickupType: { type: String },          // Self Ship / Courier Pickup
    pickupTrackingId: { type: String },
    returnCourier: { type: String },
    paymentMode: { type: String },
    rejectedReason: { type: String },
    exchangeProduct: { type: String },     // new product for an exchange
    exchangeDate: { type: Date },

    // Which variant (for restocking on pickup approval).
    size: { type: String },
    color: { type: String },
    sku: { type: String },
    quantity: { type: Number, default: 1 },

    reason: { type: String, required: true },
    description: { type: String },
    images: [{ type: String }],

    // Workflow — superset that keeps the legacy values working.
    status: {
        type: String,
        enum: [
            'requested', 'pickup_requested', 'picked', 'approved', 'rejected',
            'refund_pending', 'refund_transferred', 'completed',
            'pending', // legacy
        ],
        default: 'requested',
    },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, by: String, note: String }],

    // Condition assessed when the item is picked/scanned.
    condition: { type: String, enum: ['good', 'damaged', 'different_product', 'other', ''], default: '' },
    conditionNote: { type: String },
    inventoryRestocked: { type: Boolean, default: false },

    // Charges & refund.
    charges: { type: Number, default: 0 },           // deducted charges (restocking/shipping)
    refundAmount: { type: Number },                  // net refund after charges
    refundMethod: { type: String },                  // UPI / bank / wallet / original
    refundRef: { type: String },                     // transaction reference
    refundTransferredAt: { type: Date },

    pickupRequestedAt: { type: Date },
    customerId: { type: String },

    // Editable admin notes (reject reason, etc.).
    notes: [{ note: String, by: String, at: { type: Date, default: Date.now } }],
    adminNotes: { type: String }, // legacy single note
}, { timestamps: true });

returnSchema.pre('save', async function (next) {
    if (!this.returnNumber) {
        try { this.returnNumber = `RET-${String(await nextSeq('returnNumber')).padStart(4, '0')}` } catch { /* ignore */ }
    }
    next();
});

const returnModel = mongoose.models.return || mongoose.model('return', returnSchema);

export default returnModel;
