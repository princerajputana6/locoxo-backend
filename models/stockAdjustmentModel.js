import mongoose from 'mongoose'

// Immutable log of every stock change for a product variant. Powers the
// "Stock adjustment history" and restock audit trail in inventory management.
const stockAdjustmentSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true, index: true },
    productCode: { type: String },
    productName: { type: String },
    sku: { type: String, index: true },
    size: { type: String },
    color: { type: String },

    // What kind of change this was.
    type: {
        type: String,
        enum: ['initial', 'restock', 'manual', 'correction', 'sale', 'return'],
        default: 'manual',
    },

    qtyChange: { type: Number, required: true },   // signed delta (+restock / -sale)
    stockBefore: { type: Number },
    stockAfter: { type: Number },

    reason: { type: String },
    admin: { type: String },                       // who made the change
}, { timestamps: true })

const stockAdjustmentModel = mongoose.models.stockAdjustment
    || mongoose.model('stockAdjustment', stockAdjustmentSchema)

export default stockAdjustmentModel
