import userModel from "../models/userModel.js";
import { ensureReferralCode } from "../utils/referral.js";

// Logged-in user's referral dashboard
const getMyReferral = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await userModel.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const code = await ensureReferralCode(user);
        const referredUsers = await userModel.find({ referredBy: user._id })
            .select('name createdAt referralRewarded')
            .sort({ createdAt: -1 });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        res.json({
            success: true,
            referral: {
                code,
                link: `${frontendUrl}/login?ref=${code}`,
                referralCount: user.referralCount || 0,
                referralEarnings: user.referralEarnings || 0,
                walletBalance: user.wallet?.balance || 0,
                rewardPerReferral: Number(process.env.REFERRAL_REWARD_AMOUNT || 200),
                referredUsers
            }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Public: validate a referral code (shown on signup)
const validateReferral = async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.json({ success: false, message: 'Code required' });
        const referrer = await userModel.findOne({ referralCode: code }).select('name');
        if (!referrer) return res.json({ success: false, message: 'Invalid referral code' });
        res.json({
            success: true,
            valid: true,
            referrerName: referrer.name,
            rewardForYou: Number(process.env.REFERRAL_REWARDEE_AMOUNT || 100)
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Admin: referral leaderboard
const referralLeaderboard = async (req, res) => {
    try {
        const top = await userModel.find({ referralCount: { $gt: 0 } })
            .select('name email referralCount referralEarnings')
            .sort({ referralCount: -1 })
            .limit(50);
        const totalReferred = await userModel.countDocuments({ referredBy: { $ne: null } });
        const totalPaidOut = top.reduce((s, u) => s + (u.referralEarnings || 0), 0);
        res.json({ success: true, leaderboard: top, totalReferred, totalPaidOut });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { getMyReferral, validateReferral, referralLeaderboard };
