import { v2 as cloudinary } from 'cloudinary';
import { ensureCloudinary } from '../config/cloudinary.js';
import categoryModel from '../models/categoryModel.js';
import productModel from '../models/productModel.js';

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const parseMaybe = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return fallback; }
};

const uploadIfPresent = async (files, field, folder) => {
    const f = files?.[field]?.[0];
    if (!f) return null;
    ensureCloudinary();
    const r = await cloudinary.uploader.upload(f.path, { resource_type: 'image', folder });
    return r.secure_url;
};

// Build the field set shared by add + update.
const fieldsFromBody = (body) => {
    const out = {};
    if (body.name !== undefined) out.name = body.name;
    if (body.description !== undefined) out.description = body.description;
    if (body.parentCategory !== undefined) out.parentCategory = body.parentCategory || null;
    if (body.status !== undefined && body.status !== '') out.status = body.status;
    if (body.displayOrder !== undefined) out.displayOrder = Number(body.displayOrder) || 0;
    if (body.metaTitle !== undefined) out.metaTitle = body.metaTitle;
    if (body.metaDescription !== undefined) out.metaDescription = body.metaDescription;
    if (body.featured !== undefined) out.featured = body.featured === true || body.featured === 'true';
    if (body.showInHeader !== undefined) out.showInHeader = body.showInHeader === true || body.showInHeader === 'true';
    if (body.searchKeywords !== undefined) out.searchKeywords = parseMaybe(body.searchKeywords, []);
    if (body.links !== undefined) out.links = parseMaybe(body.links, []);
    if (body.image !== undefined && body.image) out.image = body.image; // URL passthrough
    return out;
};

const listCategories = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        const categories = await categoryModel.find(filter).sort({ displayOrder: 1, createdAt: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const addCategory = async (req, res) => {
    try {
        const data = fieldsFromBody(req.body);
        if (!data.name) return res.json({ success: false, message: 'Category name is required' });
        data.slug = slugify(req.body.slug || data.name);

        const folder = 'locoxo/categories';
        const image = await uploadIfPresent(req.files, 'image', folder);
        const icon = await uploadIfPresent(req.files, 'icon', folder);
        const banner = await uploadIfPresent(req.files, 'banner', folder);
        if (image) data.image = image;
        if (icon) data.icon = icon;
        if (banner) data.banner = banner;

        const category = new categoryModel(data);
        await category.save();
        res.json({ success: true, message: 'Category added', category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.code === 11000 ? 'A category with this name/slug already exists' : error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const category = await categoryModel.findById(req.params.id);
        if (!category) return res.json({ success: false, message: 'Category not found' });

        Object.assign(category, fieldsFromBody(req.body));
        if (req.body.slug) category.slug = slugify(req.body.slug);

        const folder = 'locoxo/categories';
        const image = await uploadIfPresent(req.files, 'image', folder);
        const icon = await uploadIfPresent(req.files, 'icon', folder);
        const banner = await uploadIfPresent(req.files, 'banner', folder);
        if (image) category.image = image;
        if (icon) category.icon = icon;
        if (banner) category.banner = banner;

        await category.save();
        res.json({ success: true, message: 'Category updated', category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Quick toggles (active / featured / header) without a full form submit.
const toggleCategoryFlag = async (req, res) => {
    try {
        const { field, value } = req.body; // field: status|featured|showInHeader
        const allowed = ['status', 'featured', 'showInHeader'];
        if (!allowed.includes(field)) return res.json({ success: false, message: 'Invalid field' });
        const category = await categoryModel.findByIdAndUpdate(req.params.id, { [field]: value }, { new: true });
        if (!category) return res.json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Updated', category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const category = await categoryModel.findByIdAndDelete(req.params.id);
        if (!category) return res.json({ success: false, message: 'Category not found' });
        // Detach children and pull from parent's list.
        await categoryModel.updateMany({ parentCategory: category._id }, { parentCategory: null, level: 0 });
        if (category.parentCategory) await categoryModel.findByIdAndUpdate(category.parentCategory, { $pull: { children: category._id } });
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getCategoryById = async (req, res) => {
    try {
        const category = await categoryModel.findById(req.params.id);
        if (!category) return res.json({ success: false, message: 'Category not found' });
        res.json({ success: true, category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/category/dashboard — categories with product counts + status/flags.
const categoryDashboard = async (req, res) => {
    try {
        const categories = await categoryModel.find({}).sort({ displayOrder: 1 }).lean();
        // Product counts by category name (products store category as a string name).
        const counts = await productModel.aggregate([{ $group: { _id: '$category', c: { $sum: 1 } } }]);
        const countMap = Object.fromEntries(counts.map((x) => [x._id, x.c]));
        const rows = categories.map((c) => ({ ...c, productCount: countMap[c.name] || 0 }));
        res.json({
            success: true, rows,
            summary: {
                total: rows.length,
                active: rows.filter((r) => r.status === 'active').length,
                featured: rows.filter((r) => r.featured).length,
                inHeader: rows.filter((r) => r.showInHeader).length,
            },
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Upload a specific file from a fields map by fieldname.
const uploadNamed = async (files, name, folder) => {
    const f = files?.[name]?.[0];
    if (!f) return null;
    ensureCloudinary();
    return (await cloudinary.uploader.upload(f.path, { resource_type: 'image', folder })).secure_url;
};

// POST /api/category/tree — create a main category plus its sub-categories and
// child-categories in one submit (Add Category page). Files: image, banner, and
// per-row subImage_<i> / childImage_<i>.
const createCategoryTree = async (req, res) => {
    try {
        const folder = 'locoxo/categories';
        const main = fieldsFromBody(req.body);
        if (!main.name) return res.json({ success: false, message: 'Category name is required' });
        main.slug = slugify(req.body.slug || main.name);
        if (req.body.displayInMenu !== undefined) main.displayInMenu = req.body.displayInMenu === 'true' || req.body.displayInMenu === true || req.body.displayInMenu === 'Yes';
        if (req.body.startDate) main.startDate = req.body.startDate;
        if (req.body.endDate) main.endDate = req.body.endDate;
        main.image = (await uploadNamed(req.files, 'image', folder)) || main.image;
        main.banner = (await uploadNamed(req.files, 'banner', folder)) || undefined;

        const mainDoc = new categoryModel(main);
        await mainDoc.save();

        const subs = parseMaybe(req.body.subCategories, []);
        const children = parseMaybe(req.body.childCategories, []);
        const subDocs = [];
        for (let i = 0; i < subs.length; i++) {
            const s = subs[i];
            if (!s.name) continue;
            const doc = new categoryModel({
                name: s.name, slug: slugify(s.slug || s.name), parentCategory: mainDoc._id,
                displayOrder: Number(s.displayOrder) || 0, status: s.status || 'active',
                image: await uploadNamed(req.files, `subImage_${i}`, folder),
            });
            await doc.save();
            subDocs.push(doc);
        }
        for (let i = 0; i < children.length; i++) {
            const c = children[i];
            if (!c.name) continue;
            const parent = subDocs[c.subIndex] || subDocs[0];
            if (!parent) continue;
            const doc = new categoryModel({
                name: c.name, slug: slugify(c.slug || c.name), parentCategory: parent._id,
                displayOrder: Number(c.displayOrder) || 0, status: c.status || 'active',
                image: await uploadNamed(req.files, `childImage_${i}`, folder),
            });
            await doc.save();
        }
        res.json({ success: true, message: 'Category created', category: mainDoc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.code === 11000 ? 'Duplicate name/slug' : error.message });
    }
};

// GET /api/category/tree — nested main → sub → child, with codes, for the list.
const listCategoryTree = async (req, res) => {
    try {
        const all = await categoryModel.find({}).sort({ level: 1, displayOrder: 1, createdAt: 1 }).lean();
        const byId = Object.fromEntries(all.map((c) => [String(c._id), { ...c, kids: [] }]));
        const roots = [];
        all.forEach((c) => {
            const node = byId[String(c._id)];
            // Nest under the parent when it exists; otherwise treat as a root
            // (covers orphans whose parent was deleted).
            if (c.parentCategory && byId[String(c.parentCategory)]) byId[String(c.parentCategory)].kids.push(node);
            else roots.push(node);
        });
        res.json({ success: true, tree: roots, total: all.length });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listCategories, addCategory, updateCategory, deleteCategory, getCategoryById, toggleCategoryFlag, categoryDashboard, createCategoryTree, listCategoryTree };
