import mongoose from 'mongoose'

// Simple atomic sequence generator. One document per named counter.
// Used for sequential product codes (LX2026NN) and EAN-13 serials.
const counterSchema = new mongoose.Schema({
    _id: { type: String },        // counter name, e.g. "productCode:2026" or "ean"
    seq: { type: Number, default: 0 },
})

const counterModel = mongoose.models.counter || mongoose.model('counter', counterSchema)

// Atomically increment and return the new value. Creates the counter on first use.
export const nextSeq = async (name) => {
    const doc = await counterModel.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    )
    return doc.seq
}

// Read the current value WITHOUT consuming it (for "next code" previews).
export const peekSeq = async (name) => {
    const doc = await counterModel.findById(name)
    return (doc?.seq || 0) + 1
}

export default counterModel
