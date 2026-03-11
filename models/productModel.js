import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    discountPrice: { type: Number },
    image: { type: Array, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'category', required: true },
    subCategory: { type: String, required: true },
    
    variants: [{
        size: { type: String, required: true },
        color: { type: String, required: true },
        colorCode: { type: String },
        stock: { type: Number, required: true, default: 0 },
        sku: { type: String }
    }],
    
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

const productModel  = mongoose.models.product || mongoose.model("product",productSchema);

export default productModel