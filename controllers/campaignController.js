import campaignModel from "../models/campaignModel.js";
import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";

// Resolve the audience (user docs) for a segment definition.
const resolveAudience = async (segment = {}) => {
    const type = segment.type || 'all';

    if (type === 'subscribers') {
        return userModel.find({ 'subscription.status': 'active' }).select('name email phone');
    }
    if (type === 'non_subscribers') {
        return userModel.find({ 'subscription.status': { $ne: 'active' } }).select('name email phone');
    }
    if (type === 'new') {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        return userModel.find({ createdAt: { $gte: since } }).select('name email phone');
    }
    if (type === 'high_value' || type === 'inactive') {
        const orders = await orderModel.find({ status: { $ne: 'Cancelled' } }).select('userId amount date').lean();
        const byUser = {};
        orders.forEach(o => {
            const id = o.userId?.toString();
            if (!id) return;
            if (!byUser[id]) byUser[id] = { spend: 0, last: 0 };
            byUser[id].spend += o.amount || 0;
            byUser[id].last = Math.max(byUser[id].last, o.date || 0);
        });
        if (type === 'high_value') {
            const min = segment.minSpend || 5000;
            const ids = Object.entries(byUser).filter(([, v]) => v.spend >= min).map(([id]) => id);
            return userModel.find({ _id: { $in: ids } }).select('name email phone');
        }
        // inactive: registered but no order in last 60 days
        const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
        const activeIds = Object.entries(byUser).filter(([, v]) => v.last >= cutoff).map(([id]) => id);
        return userModel.find({ _id: { $nin: activeIds } }).select('name email phone');
    }
    return userModel.find({}).select('name email phone');
};

const listCampaigns = async (req, res) => {
    try {
        const campaigns = await campaignModel.find({}).sort({ createdAt: -1 });
        res.json({ success: true, campaigns });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const createCampaign = async (req, res) => {
    try {
        const audience = await resolveAudience(req.body.segment);
        const campaign = await campaignModel.create({
            ...req.body,
            metrics: { ...(req.body.metrics || {}), audienceSize: audience.length }
        });
        res.json({ success: true, message: 'Campaign created', campaign });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await campaignModel.findByIdAndUpdate(id, req.body, { new: true });
        res.json({ success: true, message: 'Campaign updated', campaign });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deleteCampaign = async (req, res) => {
    try {
        await campaignModel.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Campaign deleted' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Preview the audience size for a segment without saving.
const previewAudience = async (req, res) => {
    try {
        const audience = await resolveAudience(req.body.segment);
        res.json({ success: true, audienceSize: audience.length });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// "Send" a campaign. NOTE: this records the send and audience; wire an email/SMS
// provider (e.g. SendGrid/Twilio) here to dispatch real messages.
const sendCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await campaignModel.findById(id);
        if (!campaign) return res.json({ success: false, message: 'Campaign not found' });

        const audience = await resolveAudience(campaign.segment);

        // TODO: integrate real delivery here (email/SMS/push provider).
        campaign.status = 'sent';
        campaign.sentAt = new Date();
        campaign.metrics.audienceSize = audience.length;
        campaign.metrics.sent = audience.length;
        await campaign.save();

        res.json({ success: true, message: `Campaign queued to ${audience.length} recipients`, campaign });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listCampaigns, createCampaign, updateCampaign, deleteCampaign, previewAudience, sendCampaign };
