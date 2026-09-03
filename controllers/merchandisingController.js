import { v2 as cloudinary } from 'cloudinary';
import { ensureCloudinary } from '../config/cloudinary.js';
import merchandisingModel from '../models/merchandisingModel.js';
import categoryModel from '../models/categoryModel.js';

const parseMaybe = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return fallback; }
};

const uploadMany = async (files, field, folder) => {
    const list = files?.[field];
    if (!list?.length) return null;
    ensureCloudinary();
    return Promise.all(list.map(async (f) => (await cloudinary.uploader.upload(f.path, { resource_type: 'image', folder })).secure_url));
};
const uploadOne = async (files, field, folder, resource = 'image') => {
    const f = files?.[field]?.[0];
    if (!f) return null;
    ensureCloudinary();
    return (await cloudinary.uploader.upload(f.path, { resource_type: resource, folder })).secure_url;
};

const fieldsFromBody = (body) => {
    const out = {};
    if (body.name !== undefined) out.name = body.name;
    if (body.type !== undefined) out.type = body.type;
    if (body.collectionTag !== undefined) out.collectionTag = body.collectionTag;
    if (body.link !== undefined) out.link = body.link;
    if (body.status !== undefined && body.status !== '') out.status = body.status;
    if (body.scheduleStart !== undefined) out.scheduleStart = body.scheduleStart || null;
    if (body.scheduleEnd !== undefined) out.scheduleEnd = body.scheduleEnd || null;
    if (body.rank !== undefined) out.rank = Number(body.rank) || 0;
    if (body.products !== undefined) out.products = parseMaybe(body.products, []);
    // Section content type + layout + card placement.
    if (body.contentType !== undefined) out.contentType = body.contentType;
    if (body.categories !== undefined) out.categories = parseMaybe(body.categories, []);
    if (body.combos !== undefined) out.combos = parseMaybe(body.combos, []);
    if (body.layout !== undefined) out.layout = body.layout;
    if (body.cardsDesktop !== undefined) out.cardsDesktop = Number(body.cardsDesktop) || 4;
    if (body.cardsTablet !== undefined) out.cardsTablet = Number(body.cardsTablet) || 3;
    if (body.cardsMobile !== undefined) out.cardsMobile = Number(body.cardsMobile) || 2;
    if (body.heroSlides !== undefined) out.heroSlides = parseMaybe(body.heroSlides, []).map(Number).filter((n) => n > 0);
    return out;
};

// GET /api/merchandising/list  (admin — all sections, ranked)
const listSections = async (req, res) => {
    try {
        const sections = await merchandisingModel.find({}).populate('products', 'name image price').sort({ rank: 1, createdAt: 1 }).lean();
        res.json({ success: true, sections });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// GET /api/merchandising/public  (storefront — only sections that are live now)
const publicSections = async (req, res) => {
    try {
        const now = new Date();
        const all = await merchandisingModel.find({ status: { $in: ['active', 'scheduled'] } })
            .populate('products', 'name image price discountPrice rating status')
            .populate('combos.products', 'name image price discountPrice status')
            .sort({ rank: 1 }).lean();
        const live = all.filter((s) => {
            if (s.status === 'active') return true;
            const startOk = !s.scheduleStart || new Date(s.scheduleStart) <= now;
            const endOk = !s.scheduleEnd || new Date(s.scheduleEnd) >= now;
            return startOk && endOk;
        // Only approved (active) products surface on the storefront, even if a
        // section still references pending/draft ones.
        }).map((s) => ({ ...s, products: (s.products || []).filter((p) => p && p.status === 'active') }));

        // Sync category-card images/links with the LIVE category record (by name),
        // so a category's image set in the admin flows to every storefront card.
        const needsCats = live.some((s) => (s.categories || []).length);
        if (needsCats) {
            const cats = await categoryModel.find({ status: 'active' }, 'name image banner').lean();
            const imgByName = {};
            cats.forEach((c) => { imgByName[(c.name || '').toLowerCase()] = c.image || c.banner || '' });
            live.forEach((s) => {
                if ((s.categories || []).length) {
                    s.categories = s.categories.map((cc) => {
                        const live = imgByName[(cc.name || '').toLowerCase()]
                        return { ...cc, image: live || cc.image }  // live category image wins, card image is fallback
                    })
                }
            })
        }
        res.json({ success: true, sections: live });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

const addSection = async (req, res) => {
    try {
        const data = fieldsFromBody(req.body);
        if (!data.name) return res.json({ success: false, message: 'Section name is required' });
        if (data.rank === undefined) data.rank = await merchandisingModel.countDocuments();

        const folder = 'locoxo/merchandising';
        const banners = await uploadMany(req.files, 'bannerImages', folder);
        const mobile = await uploadOne(req.files, 'bannerMobile', folder);
        const thumb = await uploadOne(req.files, 'thumbnail', folder);
        const video = await uploadOne(req.files, 'video', folder, 'video');
        if (banners) data.bannerImages = banners;
        if (mobile) data.bannerMobile = mobile;
        if (thumb) data.thumbnail = thumb;
        if (video) data.video = video;

        const section = new merchandisingModel(data);
        await section.save();
        res.json({ success: true, message: 'Section created', section });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

const updateSection = async (req, res) => {
    try {
        const section = await merchandisingModel.findById(req.params.id);
        if (!section) return res.json({ success: false, message: 'Section not found' });
        Object.assign(section, fieldsFromBody(req.body));

        const folder = 'locoxo/merchandising';
        const banners = await uploadMany(req.files, 'bannerImages', folder);
        const mobile = await uploadOne(req.files, 'bannerMobile', folder);
        const thumb = await uploadOne(req.files, 'thumbnail', folder);
        const video = await uploadOne(req.files, 'video', folder, 'video');
        if (banners) section.bannerImages = banners;
        if (mobile) section.bannerMobile = mobile;
        if (thumb) section.thumbnail = thumb;
        if (video) section.video = video;

        await section.save();
        res.json({ success: true, message: 'Section updated', section });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

const deleteSection = async (req, res) => {
    try {
        const section = await merchandisingModel.findByIdAndDelete(req.params.id);
        if (!section) return res.json({ success: false, message: 'Section not found' });
        res.json({ success: true, message: 'Section deleted' });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

const duplicateSection = async (req, res) => {
    try {
        const src = await merchandisingModel.findById(req.params.id).lean();
        if (!src) return res.json({ success: false, message: 'Section not found' });
        delete src._id; delete src.createdAt; delete src.updatedAt;
        src.name = `${src.name} (Copy)`;
        src.status = 'inactive';
        src.rank = await merchandisingModel.countDocuments();
        const doc = new merchandisingModel(src);
        await doc.save();
        res.json({ success: true, message: 'Section duplicated', section: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// PUT /api/merchandising/status/:id   body { status }
const setStatus = async (req, res) => {
    try {
        const section = await merchandisingModel.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        if (!section) return res.json({ success: false, message: 'Section not found' });
        res.json({ success: true, message: `Status set to ${section.status}`, section });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// POST /api/merchandising/reorder   body { order: [id, id, …] }  — drag & drop ranking
const reorder = async (req, res) => {
    try {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.json({ success: false, message: 'order must be an array of ids' });
        await Promise.all(order.map((id, i) => merchandisingModel.findByIdAndUpdate(id, { rank: i })));
        res.json({ success: true, message: 'Order saved' });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

export { listSections, publicSections, addSection, updateSection, deleteSection, duplicateSection, setStatus, reorder };
