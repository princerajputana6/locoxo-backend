import userModel from "../models/userModel.js";

// Generate a unique, human-friendly referral code (e.g. LOCO-7F3K2A).
const generateReferralCode = async (name = '') => {
    const prefix = (name || 'LOCO').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'LOCO';
    for (let attempt = 0; attempt < 6; attempt++) {
        const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
        const code = `${prefix}-${rand}`;
        const exists = await userModel.findOne({ referralCode: code });
        if (!exists) return code;
    }
    // Extremely unlikely fallback
    return `LOCO-${Date.now().toString(36).toUpperCase()}`;
};

// Ensure a user has a referral code; generate and persist if missing.
const ensureReferralCode = async (user) => {
    if (user.referralCode) return user.referralCode;
    user.referralCode = await generateReferralCode(user.name);
    await user.save();
    return user.referralCode;
};

export { generateReferralCode, ensureReferralCode };
