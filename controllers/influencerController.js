import influencerModel from "../models/influencerModel.js";
import { v2 as cloudinary } from 'cloudinary'

// Add new influencer
const addInfluencer = async (req, res) => {
    try {
        const { name, email, phone, instagramHandle, productId, commissionRate } = req.body;
        const image = req.file;

        if (!image) {
            return res.json({ success: false, message: "Image is required" });
        }

        // Upload image to cloudinary
        const imageUpload = await cloudinary.uploader.upload(image.path, { resource_type: 'image' });
        const imageUrl = imageUpload.secure_url;

        // Generate unique referral code
        const referralCode = 'INF' + Date.now() + Math.floor(Math.random() * 1000);

        const influencerData = {
            name,
            email,
            phone,
            instagramHandle,
            productId,
            image: imageUrl,
            commissionRate: commissionRate || 10,
            referralCode
        };

        const influencer = new influencerModel(influencerData);
        await influencer.save();

        res.json({ success: true, message: "Influencer added successfully", influencer });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// List all influencers
const listInfluencers = async (req, res) => {
    try {
        const influencers = await influencerModel.find({}).populate('productId', 'name price image');
        res.json({ success: true, influencers });
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

export { 
    addInfluencer, 
    listInfluencers, 
    getActiveInfluencers,
    getInfluencer, 
    updateInfluencer, 
    deleteInfluencer, 
    trackClick,
    getInfluencerStats
};
