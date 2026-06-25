import membershipPlanModel from "../models/membershipPlanModel.js";
import userModel from "../models/userModel.js";
import { createOrder as createCashfreeOrder, getOrderStatus as getCashfreeStatus } from "../services/cashfreeService.js";

// ---------- Public ----------

// List active membership plans (customer-facing)
const listPlans = async (req, res) => {
    try {
        const plans = await membershipPlanModel.find({ active: true }).sort({ price: 1 });
        res.json({ success: true, plans });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// ---------- Customer ----------

// Get the logged-in user's subscription (populated plan)
const getMySubscription = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await userModel.findById(userId).populate('subscription.plan');
        if (!user) return res.json({ success: false, message: 'User not found' });

        const sub = user.subscription || { status: 'none' };
        const isActive = sub.status === 'active' && sub.endDate && new Date(sub.endDate) > new Date();

        res.json({ success: true, subscription: sub, isActive });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Start a membership purchase via Cashfree
const subscribe = async (req, res) => {
    try {
        const { userId, planId, email } = req.body;
        const plan = await membershipPlanModel.findById(planId);
        if (!plan || !plan.active) return res.json({ success: false, message: 'Plan not available' });

        const user = await userModel.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const cfOrderId = `SUB${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Stash the pending purchase on the user record
        user.subscription = {
            ...(user.subscription?.toObject ? user.subscription.toObject() : user.subscription),
            plan: plan._id,
            status: user.subscription?.status === 'active' ? 'active' : 'none',
            lastPaymentId: cfOrderId
        };
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';

        const cfOrder = await createCashfreeOrder({
            orderId: cfOrderId,
            amount: plan.price,
            customer: {
                id: userId.toString(),
                name: user.name,
                email: email || user.email,
                phone: user.phone
            },
            returnUrl: `${frontendUrl}/verify-subscription?orderId=${cfOrderId}`
        });

        res.json({
            success: true,
            paymentSessionId: cfOrder.payment_session_id,
            orderId: cfOrderId,
            mode: (process.env.CASHFREE_ENV || 'TEST').toUpperCase() === 'PROD' ? 'production' : 'sandbox'
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Verify a membership payment and activate the subscription
const verifySubscription = async (req, res) => {
    try {
        const { userId, orderId } = req.body;
        const user = await userModel.findById(userId).populate('subscription.plan');
        if (!user) return res.json({ success: false, message: 'User not found' });

        if (user.subscription?.lastPaymentId !== orderId) {
            return res.json({ success: false, message: 'Payment reference mismatch' });
        }

        const status = await getCashfreeStatus(orderId);
        if (status !== 'PAID') {
            return res.json({ success: false, message: `Payment not completed (status: ${status})` });
        }

        const plan = user.subscription.plan;
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + (plan?.durationDays || 365));

        user.subscription.status = 'active';
        user.subscription.startDate = start;
        user.subscription.endDate = end;
        await user.save();

        res.json({ success: true, message: 'Membership activated', endDate: end });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Cancel auto-renew / membership
const cancelSubscription = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await userModel.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        if (user.subscription?.status === 'active') {
            user.subscription.status = 'cancelled';
            user.subscription.autoRenew = false;
            await user.save();
        }
        res.json({ success: true, message: 'Membership cancelled' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// ---------- Admin (plan management) ----------

const adminListPlans = async (req, res) => {
    try {
        const plans = await membershipPlanModel.find({}).sort({ createdAt: -1 });
        res.json({ success: true, plans });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const createPlan = async (req, res) => {
    try {
        const plan = await membershipPlanModel.create(req.body);
        res.json({ success: true, message: 'Plan created', plan });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await membershipPlanModel.findByIdAndUpdate(id, req.body, { new: true });
        res.json({ success: true, message: 'Plan updated', plan });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await membershipPlanModel.findByIdAndDelete(id);
        res.json({ success: true, message: 'Plan deleted' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Subscriber stats for admin
const subscriberStats = async (req, res) => {
    try {
        const now = new Date();
        const active = await userModel.countDocuments({ 'subscription.status': 'active', 'subscription.endDate': { $gt: now } });
        const cancelled = await userModel.countDocuments({ 'subscription.status': 'cancelled' });
        const subscribers = await userModel.find({ 'subscription.status': 'active' })
            .select('name email subscription createdAt')
            .populate('subscription.plan')
            .sort({ 'subscription.startDate': -1 })
            .limit(100);
        res.json({ success: true, active, cancelled, subscribers });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export {
    listPlans, getMySubscription, subscribe, verifySubscription, cancelSubscription,
    adminListPlans, createPlan, updatePlan, deletePlan, subscriberStats
};
