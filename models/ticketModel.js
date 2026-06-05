import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['user', 'admin'], required: true },
    senderName: { type: String },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: true })

const ticketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    userName: { type: String },
    userEmail: { type: String },
    subject: { type: String, required: true },
    category: { type: String, enum: ['order', 'payment', 'product', 'account', 'other'], default: 'other' },
    status: { type: String, enum: ['open', 'pending', 'resolved', 'closed'], default: 'open' },
    messages: { type: [messageSchema], default: [] },
    lastReplyAt: { type: Date, default: Date.now },
    lastReplyBy: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true })

const ticketModel = mongoose.models.ticket || mongoose.model('ticket', ticketSchema);

export default ticketModel
