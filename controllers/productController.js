import { v2 as cloudinary } from "cloudinary"
import { ensureCloudinary } from "../config/cloudinary.js"
import productModel from "../models/productModel.js"
import userModel from "../models/userModel.js"
import orderModel from "../models/orderModel.js"

// Parse a JSON-ish form field that may arrive as a string (multipart) or already
// parsed (JSON body). Returns `fallback` on empty / invalid.
const parseMaybe = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback
    if (typeof v !== 'string') return v
    try { return JSON.parse(v) } catch { return fallback }
}

// Collect uploaded image files from either the fixed image1..image7 fields or a
// generic `images` field, in order.
const collectImageFiles = (files) => {
    if (!files) return []
    const named = []
    for (let i = 1; i <= 7; i++) {
        const f = files[`image${i}`]
        if (f && f[0]) named.push(f[0])
    }
    if (files.images) named.push(...files.images)
    return named
}

const uploadImage = async (file, folder, publicId) => {
    const opts = { resource_type: 'image', folder }
    if (publicId) opts.public_id = publicId
    const r = await cloudinary.uploader.upload(file.path, opts)
    return r.secure_url
}

// Build the shared product field set from the request body (used by add + update).
const productFieldsFromBody = (body) => {
    const {
        name, description, shortDescription, price, discountPrice, category, subCategory,
        sizes, variants, bestseller, featured, brand, material, fabric, careInstructions,
        tags, status, productCode, audience, highlights, productType, netQuantity,
        countryOfOrigin, manufactureDate, measurements,
    } = body

    const data = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description
    if (shortDescription !== undefined) data.shortDescription = shortDescription
    if (category !== undefined) data.category = category
    if (subCategory !== undefined) data.subCategory = subCategory
    if (price !== undefined && price !== '') data.price = Number(price)
    if (discountPrice !== undefined) data.discountPrice = discountPrice === '' ? undefined : Number(discountPrice)
    if (brand !== undefined) data.brand = brand
    if (material !== undefined) data.material = material
    if (fabric !== undefined) data.fabric = fabric
    if (careInstructions !== undefined) data.careInstructions = careInstructions
    if (productCode !== undefined && productCode !== '') data.productCode = productCode
    if (audience !== undefined && audience !== '') data.audience = audience
    if (productType !== undefined) data.productType = productType
    if (netQuantity !== undefined) data.netQuantity = netQuantity
    if (countryOfOrigin !== undefined) data.countryOfOrigin = countryOfOrigin
    if (manufactureDate !== undefined) data.manufactureDate = manufactureDate
    if (status !== undefined && status !== '') data.status = status
    if (bestseller !== undefined) data.bestseller = bestseller === true || bestseller === 'true'
    if (featured !== undefined) data.featured = featured === true || featured === 'true'
    if (sizes !== undefined) data.sizes = parseMaybe(sizes, [])
    if (variants !== undefined) data.variants = parseMaybe(variants, [])
    if (tags !== undefined) data.tags = parseMaybe(tags, [])
    if (highlights !== undefined) data.highlights = parseMaybe(highlights, [])
    if (measurements !== undefined) data.measurements = parseMaybe(measurements, undefined)
    return data
}

// function for add product
const addProduct = async (req, res) => {
    try {
        const data = productFieldsFromBody(req.body)
        if (!data.name || data.price === undefined) {
            return res.json({ success: false, message: 'Name and MRP (price) are required' })
        }
        data.status = data.status || 'active'
        data.image = []
        data.date = Date.now()

        const images = collectImageFiles(req.files)
        const sizeChartFile = req.files?.sizeChart?.[0]
        const videoFiles = req.files?.video || []
        if (images.length || sizeChartFile || videoFiles.length) ensureCloudinary()

        const product = new productModel(data)
        await product.save() // assigns productCode, SKUs, barcodes

        // Upload media into the product's own Cloudinary folder.
        const folder = `locoxo/products/${product._id}`
        if (images.length) {
            product.image = await Promise.all(images.map((f, i) => uploadImage(f, folder, `image_${i + 1}`)))
        }
        if (sizeChartFile) product.sizeChart = await uploadImage(sizeChartFile, folder, 'size_chart')
        if (videoFiles.length) {
            product.video = await Promise.all(videoFiles.map(async (f, i) => {
                const r = await cloudinary.uploader.upload(f.path, { resource_type: 'video', folder, public_id: `video_${i + 1}` })
                return r.secure_url
            }))
        } else {
            const videoUrls = parseMaybe(req.body.videoUrls, [])
            if (Array.isArray(videoUrls) && videoUrls.length) product.video = videoUrls
        }

        // Fall back to a placeholder so the product always has a thumbnail.
        if (!product.image.length) product.image = ['https://placehold.co/600x800/0E4F86/FFFFFF?text=LOCOXO']
        await product.save()

        res.json({ success: true, message: "Product Added", productId: product._id, productCode: product.productCode })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for list product with filters
const listProducts = async (req, res) => {
    try {
        const { category, subCategory, minPrice, maxPrice, search, bestseller, featured, status, page = 1, limit = 20, sortBy = 'date' } = req.query;
        
        const filter = {};
        
        if (category) filter.category = category;
        if (subCategory) filter.subCategory = subCategory;
        if (bestseller) filter.bestseller = bestseller === 'true';
        if (featured) filter.featured = featured === 'true';
        if (status) filter.status = status;
        
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }
        
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }
        
        const sortOptions = {};
        if (sortBy === 'price_asc') sortOptions.price = 1;
        else if (sortBy === 'price_desc') sortOptions.price = -1;
        else if (sortBy === 'rating') sortOptions.rating = -1;
        else if (sortBy === 'popular') sortOptions.viewCount = -1;
        else sortOptions.date = -1;
        
        const skip = (page - 1) * limit;
        
        const products = await productModel.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));
            
        const total = await productModel.countDocuments(filter);
        
        res.json({
            success: true,
            products,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        
        await productModel.findByIdAndDelete(req.body.id)
        res.json({success:true,message:"Product Removed"})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        const { productId } = req.body;
        const { userId } = req.query;
        
        const product = await productModel.findById(productId);
        
        if (!product) {
            return res.json({ success: false, message: 'Product not found' });
        }
        
        await productModel.findByIdAndUpdate(productId, { $inc: { viewCount: 1 } });
        
        if (userId) {
            await userModel.findByIdAndUpdate(
                userId,
                { 
                    $addToSet: { recentlyViewed: productId },
                    $push: { 
                        recentlyViewed: { 
                            $each: [productId], 
                            $slice: -20 
                        } 
                    }
                }
            );
        }
        
        res.json({ success: true, product });

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const getRelatedProducts = async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 8 } = req.query;
        
        const product = await productModel.findById(productId);
        
        if (!product) {
            return res.json({ success: false, message: 'Product not found' });
        }
        
        const relatedProducts = await productModel.find({
            _id: { $ne: productId },
            $or: [
                { category: product.category },
                { subCategory: product.subCategory },
                { tags: { $in: product.tags } }
            ],
            status: 'active'
        })
        .limit(parseInt(limit))
        .select('name price discountPrice image rating reviewCount');
        
        res.json({ success: true, products: relatedProducts });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getRecentlyViewed = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await userModel.findById(userId).populate({
            path: 'recentlyViewed',
            select: 'name price discountPrice image rating reviewCount'
        });
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, products: user.recentlyViewed.reverse() });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params
        const product = await productModel.findById(id)
        if (!product) return res.json({ success: false, message: 'Product not found' })

        // Apply text/structured fields.
        const data = productFieldsFromBody(req.body)
        Object.assign(product, data)

        // Media handling (works for JSON updates and multipart with new files).
        const images = collectImageFiles(req.files)
        const sizeChartFile = req.files?.sizeChart?.[0]
        const videoFiles = req.files?.video || []
        if (images.length || sizeChartFile || videoFiles.length) ensureCloudinary()

        const folder = `locoxo/products/${product._id}`
        // Keep whichever existing images the client says to keep, then append new ones.
        const keep = parseMaybe(req.body.keepImages, null)
        let nextImages = Array.isArray(keep) ? keep : [...(product.image || [])]
        if (images.length) {
            const uploaded = await Promise.all(images.map((f, i) => uploadImage(f, folder, `image_${Date.now()}_${i}`)))
            nextImages = [...nextImages, ...uploaded]
        }
        if (nextImages.length) product.image = nextImages

        if (sizeChartFile) product.sizeChart = await uploadImage(sizeChartFile, folder, 'size_chart')
        if (videoFiles.length) {
            const vids = await Promise.all(videoFiles.map(async (f, i) => {
                const r = await cloudinary.uploader.upload(f.path, { resource_type: 'video', folder, public_id: `video_${Date.now()}_${i}` })
                return r.secure_url
            }))
            product.video = [...(product.video || []), ...vids]
        }
        const videoUrls = parseMaybe(req.body.videoUrls, null)
        if (Array.isArray(videoUrls)) product.video = videoUrls

        await product.save() // recomputes discountPercent, keeps SKUs/barcodes
        res.json({ success: true, message: 'Product updated successfully', product })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Quick status change: Active / Draft / Hidden / Coming soon / Inactive.
const setProductStatus = async (req, res) => {
    try {
        const { id } = req.params
        const { status } = req.body
        const allowed = ['active', 'inactive', 'out_of_stock', 'draft', 'hidden', 'coming_soon']
        if (!allowed.includes(status)) return res.json({ success: false, message: 'Invalid status' })
        const product = await productModel.findByIdAndUpdate(id, { status }, { new: true })
        if (!product) return res.json({ success: false, message: 'Product not found' })
        res.json({ success: true, message: `Status set to ${status}`, product })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Duplicate an existing product (fresh code + SKUs + barcodes, starts as Draft).
const duplicateProduct = async (req, res) => {
    try {
        const src = await productModel.findById(req.params.id).lean()
        if (!src) return res.json({ success: false, message: 'Product not found' })

        const clone = { ...src }
        delete clone._id; delete clone.createdAt; delete clone.updatedAt
        delete clone.productCode                    // regenerated on save
        clone.name = `${src.name} (Copy)`
        clone.status = 'draft'
        clone.viewCount = 0
        clone.rating = 0; clone.reviewCount = 0
        clone.variants = (src.variants || []).map((v) => ({
            size: v.size, color: v.color, colorCode: v.colorCode, stock: v.stock,
            // sku/barcode/humanBarcode intentionally omitted → regenerated
        }))
        clone.date = Date.now()

        const doc = new productModel(clone)
        await doc.save()
        res.json({ success: true, message: 'Product duplicated', productId: doc._id, productCode: doc.productCode })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const updateStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock } = req.body;
        
        const product = await productModel.findByIdAndUpdate(
            id, 
            { stock: Number(stock) }, 
            { new: true }
        );
        
        if (!product) {
            return res.json({ success: false, message: 'Product not found' });
        }
        
        res.json({ success: true, message: 'Stock updated successfully', product });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/product/dashboard — every product with live view / wishlist / purchase
// counts + status + pricing, for the Product Management dashboard.
const productDashboard = async (req, res) => {
    try {
        const products = await productModel.find({}).sort({ date: -1 }).lean()

        // Wishlist counts: how many users have each product wishlisted.
        const wishAgg = await userModel.aggregate([
            { $unwind: '$wishlist' },
            { $group: { _id: '$wishlist', c: { $sum: 1 } } },
        ])
        const wishMap = Object.fromEntries(wishAgg.map((w) => [String(w._id), w.c]))

        // Purchase counts (units sold) from non-cancelled orders.
        const buyAgg = await orderModel.aggregate([
            { $match: { status: { $nin: ['Cancelled'] } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', units: { $sum: '$items.quantity' } } },
        ])
        const buyMap = Object.fromEntries(buyAgg.map((b) => [String(b._id), b.units]))

        const rows = products.map((p) => {
            const totalStock = (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0)
            return {
                _id: p._id,
                productCode: p.productCode,
                name: p.name,
                image: Array.isArray(p.image) ? p.image[0] : p.image,
                category: p.category,
                audience: p.audience,
                status: p.status,
                price: p.price,
                discountPrice: p.discountPrice,
                discountPercent: p.discountPercent,
                totalStock,
                variants: (p.variants || []).length,
                viewCount: p.viewCount || 0,
                wishlistCount: wishMap[String(p._id)] || 0,
                purchaseCount: buyMap[String(p._id)] || 0,
                date: p.date,
            }
        })

        // Status tallies for the dashboard tiles.
        const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {})
        res.json({ success: true, rows, counts, total: rows.length })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// GET /api/product/report/daily — products added per day (date-wise report).
const productsAddedReport = async (req, res) => {
    try {
        const rows = await productModel.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$date' } } },
                    count: { $sum: 1 },
                    products: { $push: { name: '$name', productCode: '$productCode' } },
                },
            },
            { $sort: { _id: -1 } },
            { $limit: 60 },
        ])
        res.json({ success: true, rows })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// POST /api/product/import-excel — bulk-create products from an .xlsx/.csv upload.
// Recognised columns (case-insensitive): name, mrp/price, sellingPrice, category,
// audience, size, color, stock, fabric, description, status.
const importExcel = async (req, res) => {
    try {
        const file = req.files?.file?.[0] || req.file
        if (!file) return res.json({ success: false, message: 'No file uploaded' })

        const XLSX = (await import('xlsx')).default
        const wb = XLSX.readFile(file.path)
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        if (!raw.length) return res.json({ success: false, message: 'Sheet is empty' })

        const pick = (row, ...keys) => {
            const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]))
            for (const k of keys) { const val = lower[k.toLowerCase()]; if (val !== undefined && val !== '') return val }
            return undefined
        }

        const created = [], errors = []
        for (let i = 0; i < raw.length; i++) {
            const row = raw[i]
            try {
                const name = pick(row, 'name', 'product name', 'productname')
                const mrp = pick(row, 'mrp', 'price')
                if (!name || mrp === undefined) throw new Error('Missing name or MRP')
                const selling = pick(row, 'sellingprice', 'selling price', 'selling')
                const doc = new productModel({
                    name: String(name),
                    description: String(pick(row, 'description', 'desc') || name),
                    price: Number(mrp),
                    discountPrice: selling !== undefined ? Number(selling) : undefined,
                    category: String(pick(row, 'category') || 'Uncategorized'),
                    subCategory: String(pick(row, 'subcategory', 'sub category') || 'General'),
                    audience: pick(row, 'audience', 'gender') || undefined,
                    fabric: pick(row, 'fabric', 'material') || undefined,
                    brand: pick(row, 'brand') || 'LOCOXO',
                    status: pick(row, 'status') || 'active',
                    image: ['https://placehold.co/600x800/0E4F86/FFFFFF?text=LOCOXO'],
                    variants: [{
                        size: String(pick(row, 'size') || 'Free'),
                        color: String(pick(row, 'color', 'colour') || 'Default'),
                        stock: Number(pick(row, 'stock') || 0),
                    }],
                    date: Date.now(),
                })
                await doc.save()
                created.push({ name: doc.name, productCode: doc.productCode })
            } catch (err) {
                errors.push({ row: i + 2, name: row.name || row.Name, error: err.message })
            }
        }
        res.json({ success: true, message: `Imported ${created.length} product(s)${errors.length ? `, ${errors.length} failed` : ''}`, created, errors })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// POST /api/product/add-colourwise — create a product from the colour-wise
// Add Product form. Body: basic fields + `colours` JSON (metadata). Files:
// c<ci>_img<ii> and c<ci>_vid<vi> per colour.
const addProductColourwise = async (req, res) => {
    try {
        const b = req.body
        if (!b.name) return res.json({ success: false, message: 'Product name is required' })
        const coloursMeta = parseMaybe(b.colours, [])
        if (!Array.isArray(coloursMeta) || coloursMeta.length === 0) {
            return res.json({ success: false, message: 'Add at least one colour' })
        }

        // Index uploaded files by fieldname.
        const filesByName = {}
        for (const f of (req.files || [])) filesByName[f.fieldname] = f
        if (req.files?.length) ensureCloudinary()

        // Create the product shell first (so we have an id for the folder).
        const product = new productModel({
            name: b.name,
            description: b.description || b.name,
            productCode: b.productCode || undefined,
            category: b.category || 'Uncategorized',
            subCategory: b.subCategory || 'General',
            audience: b.audience || undefined,
            fabric: b.fabric || undefined,
            neckType: b.neckType || undefined,
            sleeve: b.sleeve || undefined,
            pattern: b.pattern || undefined,
            status: b.status || 'active',
            price: Number(coloursMeta[0].mrp) || 0,
            discountPrice: coloursMeta[0].sellingPrice ? Number(coloursMeta[0].sellingPrice) : undefined,
            image: [],
            colours: [],
            variants: [],
            sizes: [],
            date: Date.now(),
        })
        await product.save()

        const folder = `locoxo/products/${product._id}`
        const upload = async (file, kind) => (await cloudinary.uploader.upload(file.path, { resource_type: kind, folder })).secure_url

        const colours = []
        const variants = []
        const allSizes = new Set()
        for (let ci = 0; ci < coloursMeta.length; ci++) {
            const c = coloursMeta[ci]
            const images = []
            for (let ii = 0; ii < 10; ii++) { const f = filesByName[`c${ci}_img${ii}`]; if (f) images.push(await upload(f, 'image')) }
            if (Array.isArray(c.imageUrls)) images.push(...c.imageUrls)
            const videos = []
            for (let vi = 0; vi < 3; vi++) { const f = filesByName[`c${ci}_vid${vi}`]; if (f) videos.push(await upload(f, 'video')) }
            const sizes = Array.isArray(c.sizes) ? c.sizes : []
            sizes.forEach((s) => allSizes.add(s))
            colours.push({
                color: c.color, colorCode: c.colorCode, images, videos, sizes,
                mrp: Number(c.mrp) || 0, sellingPrice: c.sellingPrice ? Number(c.sellingPrice) : undefined,
                discount: Number(c.discount) || 0, description: c.description,
            })
            // Build inventory variants (size × colour).
            sizes.forEach((s) => variants.push({ size: s, color: c.color, colorCode: c.colorCode, stock: Number(c.stock) || 0 }))
        }

        product.colours = colours
        product.variants = variants
        product.sizes = [...allSizes]
        product.image = colours[0]?.images?.length ? colours[0].images : ['https://placehold.co/600x800/EEF3F9/94A3B8?text=LOCOXO']
        await product.save()

        // Mark the product-code registry entry as used.
        if (b.productCode) { try { (await import('../models/productCodeModel.js')).default.updateOne({ code: b.productCode }, { used: true }).catch(() => {}) } catch { /* ignore */ } }

        res.json({ success: true, message: 'Product Added', productId: product._id, productCode: product.productCode })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { listProducts, addProduct, removeProduct, singleProduct, getRelatedProducts, getRecentlyViewed, updateProduct, updateStock, setProductStatus, duplicateProduct, productDashboard, productsAddedReport, importExcel, addProductColourwise }