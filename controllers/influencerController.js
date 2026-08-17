import influencerModel from "../models/influencerModel.js";
import { v2 as cloudinary } from 'cloudinary'
import { ensureCloudinary } from '../config/cloudinary.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

// Add new influencer
const addInfluencer = async (req, res) => {
    try {
        const { name, email, password, phone, dob, instagramHandle, productId, commissionRate,
            code, type, category, address, notes, commissionType, commissionAmount, sameCommissionForAll, status } = req.body;
        const image = req.file;

        const exists = await influencerModel.findOne({ email });
        if (exists) return res.json({ success: false, message: "Influencer with this email already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password || Math.random().toString(36).slice(2), salt);

        let imageUrl = '';
        if (image) {
            ensureCloudinary()
            const imageUpload = await cloudinary.uploader.upload(image.path, { resource_type: 'image' });
            imageUrl = imageUpload.secure_url;
        }

        // Custom code (upper-cased, unique) or auto-generated.
        let referralCode = (code || '').trim().toUpperCase();
        if (!referralCode || await influencerModel.findOne({ referralCode })) {
            referralCode = (name || 'INF').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5) + Math.floor(10 + Math.random() * 90);
        }

        const influencerData = {
            name, email, password: hashedPassword, phone, instagramHandle, productId, image: imageUrl,
            dob: dob || undefined, type: type || 'other', category, address, notes,
            commissionType: commissionType || 'percentage',
            commissionRate: commissionRate ? Number(commissionRate) : 10,
            commissionAmount: commissionAmount ? Number(commissionAmount) : 0,
            sameCommissionForAll: sameCommissionForAll !== 'false' && sameCommissionForAll !== false,
            status: status || 'active',
            referralCode,
        };

        const influencer = new influencerModel(influencerData);
        await influencer.save();

        res.json({ success: true, message: "Influencer added successfully", influencer: {
            _id: influencer._id,
            name: influencer.name,
            email: influencer.email,
            referralCode: influencer.referralCode
        } });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// List all influencers
const listInfluencers = async (req, res) => {
    try {
        const { status, type, search } = req.query;
        const filter = {};
        if (status && status !== 'All') filter.status = status;
        if (type && type !== 'All') filter.type = type;
        let influencers = await influencerModel.find(filter, '-password').populate('productId', 'name price image').sort({ createdAt: -1 }).lean();
        const s = (search || '').trim().toLowerCase();
        if (s) influencers = influencers.filter((i) => `${i.name} ${i.email} ${i.referralCode}`.toLowerCase().includes(s));

        const all = await influencerModel.find({}, 'status totalEarnings conversions').lean();
        const summary = {
            total: all.length,
            active: all.filter((i) => i.status === 'active').length,
            deactivated: all.filter((i) => ['deactivated', 'inactive', 'suspended'].includes(i.status)).length,
            totalRevenue: all.reduce((a, i) => a + (i.totalEarnings || 0), 0),
            totalSales: all.reduce((a, i) => a + (i.conversions || 0), 0),
        };
        res.json({ success: true, influencers, summary });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get active influencers for frontend display
const getActiveInfluencers = async (req, res) => {
    try {
        const influencers = await influencerModel.find({ status: 'active' }).populate('productId', 'name price image');
        res.json({ success: true, influencers });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get single influencer
const getInfluencer = async (req, res) => {
    try {
        const { id } = req.params;
        const influencer = await influencerModel.findById(id).populate('productId');
        
        if (!influencer) {
            return res.json({ success: false, message: "Influencer not found" });
        }
        
        res.json({ success: true, influencer });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Update influencer
const updateInfluencer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, instagramHandle, productId, commissionRate, status } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phone) updateData.phone = phone;
        if (instagramHandle) updateData.instagramHandle = instagramHandle;
        if (productId) updateData.productId = productId;
        if (commissionRate) updateData.commissionRate = commissionRate;
        if (status) updateData.status = status;

        const influencer = await influencerModel.findByIdAndUpdate(id, updateData, { new: true });

        if (!influencer) {
            return res.json({ success: false, message: "Influencer not found" });
        }

        res.json({ success: true, message: "Influencer updated successfully", influencer });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Delete influencer
const deleteInfluencer = async (req, res) => {
    try {
        const { id } = req.params;
        await influencerModel.findByIdAndDelete(id);
        res.json({ success: true, message: "Influencer deleted successfully" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Track influencer click
const trackClick = async (req, res) => {
    try {
        const { referralCode } = req.body;
        
        const influencer = await influencerModel.findOne({ referralCode });
        
        if (!influencer) {
            return res.json({ success: false, message: "Invalid referral code" });
        }

        influencer.clicks += 1;
        await influencer.save();

        res.json({ success: true, productId: influencer.productId });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get influencer stats
const getInfluencerStats = async (req, res) => {
    try {
        const { id } = req.params;
        const influencer = await influencerModel.findById(id).populate('productId', 'name price image');
        
        if (!influencer) {
            return res.json({ success: false, message: "Influencer not found" });
        }

        const stats = {
            name: influencer.name,
            totalClicks: influencer.clicks,
            totalConversions: influencer.conversions,
            totalSales: influencer.totalSales,
            totalEarnings: influencer.totalEarnings,
            conversionRate: influencer.clicks > 0 ? ((influencer.conversions / influencer.clicks) * 100).toFixed(2) : 0,
            product: influencer.productId
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Influencer login
const influencerLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const influencer = await influencerModel.findOne({ email });

        if (!influencer) {
            return res.json({ success: false, message: "Influencer doesn't exist" });
        }

        if (influencer.status !== 'active') {
            return res.json({ success: false, message: "Your account is inactive. Please contact admin." });
        }

        const isMatch = await bcrypt.compare(password, influencer.password);

        if (isMatch) {
            const token = jwt.sign({ id: influencer._id }, process.env.JWT_SECRET);
            res.json({ success: true, token, influencer: {
                _id: influencer._id,
                name: influencer.name,
                email: influencer.email,
                referralCode: influencer.referralCode
            } });
        } else {
            res.json({ success: false, message: 'Invalid credentials' });
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get influencer dashboard data
const getInfluencerDashboard = async (req, res) => {
    try {
        const influencerId = req.body.influencerId; // From auth middleware
        
        const influencer = await influencerModel.findById(influencerId).populate('productId', 'name price image');
        
        if (!influencer) {
            return res.json({ success: false, message: "Influencer not found" });
        }

        const dashboardData = {
            profile: {
                name: influencer.name,
                email: influencer.email,
                phone: influencer.phone,
                instagramHandle: influencer.instagramHandle,
                referralCode: influencer.referralCode,
                commissionRate: influencer.commissionRate,
                status: influencer.status
            },
            stats: {
                totalClicks: influencer.clicks,
                totalConversions: influencer.conversions,
                totalSales: influencer.totalSales,
                totalEarnings: influencer.totalEarnings,
                conversionRate: influencer.clicks > 0 ? ((influencer.conversions / influencer.clicks) * 100).toFixed(2) : 0
            },
            product: influencer.productId
        };

        res.json({ success: true, data: dashboardData });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { 
    addInfluencer, 
    listInfluencers, 
    getActiveInfluencers,
    getInfluencer, 
    updateInfluencer, 
    deleteInfluencer, 
    trackClick,
    getInfluencerStats,
    influencerLogin,
    getInfluencerDashboard
};
