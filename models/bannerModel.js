import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String, required: true },
    mobileImage: { type: String },
    
    linkType: { type: String, enum: ['product', 'category', 'url', 'none'], default: 'none' },
    linkUrl: { type: String },
    linkProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'product' },
    linkCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'category' },
    
    position: { type: String, enum: ['hero', 'middle', 'footer'], default: 'hero' },
    displayOrder: { type: Number, default: 0 },
    
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    
    validFrom: { type: Date },
    validUntil: { type: Date }
}, { timestamps: true });

const bannerModel = mongoose.models.banner || mongoose.model('banner', bannerSchema);

export default bannerModel;
