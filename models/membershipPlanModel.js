import mongoose from "mongoose";

// Admin-defined premium membership tiers (e.g. LOCOXO Premium).
const membershipPlanSchema = new mongoose.Schema({
    name: { type: String, required: true },              // e.g. "LOCOXO Premium"
    description: { type: String },
    price: { type: Number, required: true },             // e.g. 499
    durationDays: { type: Number, required: true, default: 365 },

    // Perks applied at checkout / across the store
    perks: {
        freeShipping: { type: Boolean, default: true },
        discountPercent: { type: Number, default: 10 },  // extra discount on every order
        earlyAccess: { type: Boolean, default: true },
        prioritySupport: { type: Boolean, default: false }
    },

    benefits: [{ type: String }],                        // marketing bullet points
    badge: { type: String },                             // optional label e.g. "Best Value"
    active: { type: Boolean, default: true }
}, { timestamps: true });

const membershipPlanModel =
    mongoose.models.membershipPlan || mongoose.model('membershipPlan', membershipPlanSchema);

export default membershipPlanModel;
