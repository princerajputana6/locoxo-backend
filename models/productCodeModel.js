import mongoose from 'mongoose';

// Registry of product codes (LX2026NN) created up-front with their category,
// fabric and short description — products then reference these codes.
const productCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, index: true },
    category: { type: String },        // main category name
    subCategory: { type: String },     // sub category name (if any)
    childCategory: { type: String },   // child category name (if any)
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'category' },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'category' },
    childCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'category' },
    fabric: { type: String },
    shortDescription: { type: String },
    used: { type: Boolean, default: false },   // whether a product uses this code yet
}, { timestamps: true });

const productCodeModel = mongoose.models.productCode || mongoose.model('productCode', productCodeSchema);

export default productCodeModel;
