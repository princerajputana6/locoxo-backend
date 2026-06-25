import mongoose from "mongoose";

// Marketing automation campaigns (audience segment + message).
const campaignSchema = new mongoose.Schema({
    name: { type: String, required: true },
    channel: { type: String, enum: ['email', 'sms', 'push'], default: 'email' },

    // Audience targeting rules
    segment: {
        type: { type: String, enum: ['all', 'subscribers', 'non_subscribers', 'high_value', 'inactive', 'new'], default: 'all' },
        minOrders: { type: Number },
        minSpend: { type: Number }
    },

    subject: { type: String },
    message: { type: String },

    status: { type: String, enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'], default: 'draft' },
    scheduledAt: { type: Date },
    sentAt: { type: Date },

    // Performance metrics
    metrics: {
        audienceSize: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
        converted: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 }
    }
}, { timestamps: true });

const campaignModel = mongoose.models.campaign || mongoose.model('campaign', campaignSchema);

export default campaignModel;
