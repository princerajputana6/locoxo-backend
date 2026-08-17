import bannerModel from '../models/bannerModel.js';
import { v2 as cloudinary } from 'cloudinary';
import { ensureCloudinary } from '../config/cloudinary.js';

const listBanners = async (req, res) => {
    try {
        const { bannerType, status } = req.query;
        const filter = {};
        if (bannerType && bannerType !== 'All') filter.bannerType = bannerType;
        if (status === 'active') filter.isActive = true;
        const banners = await bannerModel.find(filter).sort({ displayOrder: 1, createdAt: -1 });
        res.json({ success: true, banners });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const parseMaybe = (v, f) => { if (v === undefined || v === null || v === '') return f; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return f; } };

const addBanner = async (req, res) => {
    try {
        const b = req.body;
        const image = req.files?.image?.[0] || req.file;
        const video = req.files?.video?.[0];
        if (!image && !video) return res.json({ success: false, message: 'Banner image or video is required' });

        ensureCloudinary();
        let imageUrl = '', videoUrl = '';
        if (image) imageUrl = (await cloudinary.uploader.upload(image.path, { resource_type: 'image' })).secure_url;
        if (video) videoUrl = (await cloudinary.uploader.upload(video.path, { resource_type: 'video' })).secure_url;

        const banner = new bannerModel({
            title: b.title, subtitle: b.subtitle,
            image: imageUrl || 'https://placehold.co/1920x1080/EEF3F9/94A3B8?text=Banner',
            video: videoUrl || undefined,
            bannerType: b.bannerType || 'homepage_slider',
            sizeRatio: b.sizeRatio || '16:9 (1920x1080)',
            buttonText: b.buttonText || 'Shop Now',
            buttonLink: b.buttonLink,
            links: parseMaybe(b.links, []),
            position: b.position || 'Homepage Slider',
            displayOrder: Number(b.displayOrder) || 0,
            startDate: b.startDate || undefined,
            endDate: b.endDate || undefined,
            isActive: b.isActive === 'true' || b.isActive === true || b.status === 'active',
        });
        await banner.save();
        res.json({ success: true, message: 'Banner created', banner });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const banner = await bannerModel.findByIdAndUpdate(id, updateData, { new: true });

        if (!banner) {
            return res.json({ success: false, message: 'Banner not found' });
        }

        res.json({ success: true, message: 'Banner updated successfully', banner });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;

        const banner = await bannerModel.findByIdAndDelete(id);

        if (!banner) {
            return res.json({ success: false, message: 'Banner not found' });
        }

        res.json({ success: true, message: 'Banner deleted successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listBanners, addBanner, updateBanner, deleteBanner };
