import bannerModel from '../models/bannerModel.js';

const listBanners = async (req, res) => {
    try {
        const { position, status } = req.query;
        const filter = {};
        
        if (position) filter.position = position;
        if (status) filter.status = status;

        const now = new Date();
        if (status === 'active') {
            filter.$or = [
                { validFrom: { $exists: false } },
                { validFrom: { $lte: now } }
            ];
            filter.$and = [
                {
                    $or: [
                        { validUntil: { $exists: false } },
                        { validUntil: { $gte: now } }
                    ]
                }
            ];
        }
        
        const banners = await bannerModel.find(filter).sort({ displayOrder: 1 });
        
        res.json({ success: true, banners });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const addBanner = async (req, res) => {
    try {
        const bannerData = req.body;

        const banner = new bannerModel(bannerData);
        await banner.save();

        res.json({ success: true, message: 'Banner created successfully', banner });
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
