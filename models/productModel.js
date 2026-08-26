import mongoose from "mongoose";
import { nextSeq } from "./counterModel.js";
import { humanBarcode, ean13FromSerial, productCode as buildProductCode } from "../utils/barcode.js";

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },          // MRP
    discountPrice: { type: Number },                  // Selling price
    discountPercent: { type: Number, default: 0 },    // auto-computed from MRP vs selling
    image: { type: Array, required: true },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    sizes: { type: Array },

    // Product highlights / key features (Fabric, Neck type, Sleeve, Pattern, …)
    highlights: [{
        label: { type: String },
        value: { type: String },
    }],
    // Structured highlights (new design).
    neckType: { type: String },
    sleeve: { type: String },
    pattern: { type: String },

    // Colour-wise catalogue: each colour has its own media, sizes and pricing.
    colours: [{
        color: { type: String },
        colorCode: { type: String },
        images: [{ type: String }],
        videos: [{ type: String }],
        sizes: [{ type: String }],
        mrp: { type: Number },
        sellingPrice: { type: Number },
        discount: { type: Number },
        description: { type: String },
    }],

    // Rich media: size-chart image, walk-through / 360 videos.
    sizeChart: { type: String },
    video: { type: [String], default: [] },

    // Inventory identity — LX2026<NO> product code, gender/audience group, and
    // manually-entered fabric + short description (per requirement doc).
    productCode: { type: String, index: true },
    audience: { type: String, enum: ['Male', 'Female', 'Unisex', 'Child'] },
    fabric: { type: String },
    shortDescription: { type: String },

    // Legal apparel price-tag fields (image 3 label).
    netQuantity: { type: String, default: '1 N' },
    countryOfOrigin: { type: String, default: 'India' },
    manufactureDate: { type: String },                 // e.g. "Jun-2026"
    productType: { type: String },                     // e.g. "JACKET", "T-SHIRT"
    measurements: {                                    // physical garment measurements
        chest: { type: String },
        neck: { type: String },
        length: { type: String },
        waist: { type: String },
    },

    variants: [{
        size: { type: String, required: true },
        color: { type: String, required: true },
        colorCode: { type: String },
        stock: { type: Number, required: true, default: 0 },
        sku: { type: String, index: true },
        barcode: { type: String },        // Indian EAN-13 scannable code
        humanBarcode: { type: String }    // readable label string
    }],

    lowStockThreshold: { type: Number, default: 5 },
    onClearance: { type: Boolean, default: false },
    clearanceDiscountPct: { type: Number, default: 0, min: 0, max: 95 },

    bestseller: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    
    brand: { type: String },
    material: { type: String },
    careInstructions: { type: String },
    
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    
    tags: [{ type: String }],
    
    // 'pending' = added but awaiting admin approval; hidden from the storefront
    // until the admin approves it (sets it 'active') from the Products page.
    status: { type: String, enum: ['pending', 'active', 'inactive', 'out_of_stock', 'draft', 'hidden', 'coming_soon', 'not_available', 'notify_me', 'saved', 'archived'], default: 'pending' },
    
    viewCount: { type: Number, default: 0 },
    
    date: { type: Number, required: true }
}, { timestamps: true })

const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'PRD'

productSchema.pre('save', async function (next) {
    try {
        // Auto discount % from MRP (price) vs selling price (discountPrice).
        if (this.discountPrice && this.price && this.discountPrice < this.price) {
            this.discountPercent = Math.round(((this.price - this.discountPrice) / this.price) * 100)
        } else {
            this.discountPercent = 0
        }

        // Safety-net auto code for a product saved without a registry code.
        // Uses its OWN counter (productAutoSeq) + an "A" marker so it never
        // consumes the Create-Product-Code registry sequence — otherwise the
        // registry's "next code" preview would jump every time a product is saved.
        if (!this.productCode) {
            const year = new Date().getFullYear()
            const seq = await nextSeq(`productAutoSeq:${year}`)
            this.productCode = `LX${year}A${String(seq).padStart(2, '0')}`
        }

        if (Array.isArray(this.variants)) {
            const base = slug(this.name) || slug(this._id.toString())
            for (const v of this.variants) {
                if (!v.sku) {
                    v.sku = `${base}-${slug(v.size)}-${slug(v.color)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
                }
                // Indian EAN-13 scannable barcode (890 prefix + unique serial).
                if (!v.barcode) {
                    const serial = await nextSeq('ean')
                    v.barcode = ean13FromSerial(serial)
                }
                // Human-readable label string per the requirement doc's format.
                if (!v.humanBarcode) {
                    v.humanBarcode = humanBarcode({
                        category: this.audience || this.category,
                        name: this.name,
                        size: v.size,
                        color: v.color,
                        stock: v.stock,
                    })
                }
            }
        }
        next()
    } catch (err) {
        next(err)
    }
})

const productModel  = mongoose.models.product || mongoose.model("product",productSchema);

export default productModel