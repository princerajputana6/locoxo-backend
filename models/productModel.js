import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    discountPrice: { type: Number },
    image: { type: Array, required: true },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    sizes: { type: Array },
    
    variants: [{
        size: { type: String, required: true },
        color: { type: String, required: true },
        colorCode: { type: String },
        stock: { type: Number, required: true, default: 0 },
        sku: { type: String, index: true },
        barcode: { type: String }
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
    
    status: { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
    
    viewCount: { type: Number, default: 0 },
    
    date: { type: Number, required: true }
}, { timestamps: true })

const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'PRD'

productSchema.pre('save', function (next) {
    if (Array.isArray(this.variants)) {
        const base = slug(this.name) || slug(this._id.toString())
        this.variants.forEach((v) => {
            if (!v.sku) {
                v.sku = `${base}-${slug(v.size)}-${slug(v.color)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
            }
            if (!v.barcode) v.barcode = v.sku
        })
    }
    next()
})

const productModel  = mongoose.models.product || mongoose.model("product",productSchema);

export default productModel