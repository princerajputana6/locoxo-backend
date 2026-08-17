import mongoose from "mongoose";
import { nextSeq } from "./counterModel.js";

const messageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['user', 'admin'], required: true },
    senderName: { type: String },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: true })

const ticketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    ticketNumber: { type: String, index: true },   // TKT-1001
    userName: { type: String },
    userEmail: { type: String },
    subject: { type: String, required: true },
    category: { type: String, default: 'other' },  // Order & Delivery / Returns & Refunds / Product / Payment / Offers & Coupons / other
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'pending', 'resolved', 'closed'], default: 'open' },
    messages: { type: [messageSchema], default: [] },
    lastReplyAt: { type: Date, default: Date.now },
    lastReplyBy: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true })

ticketSchema.pre('save', async function (next) {
    if (!this.ticketNumber) {
        try { this.ticketNumber = `TKT-${1000 + await nextSeq('ticketNumber')}` } catch { /* ignore */ }
    }
    next()
})

const ticketModel = mongoose.models.ticket || mongoose.model('ticket', ticketSchema);

export default ticketModel
