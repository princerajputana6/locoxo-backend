import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String, required: true },
    link: { type: String },
    isActive: { type: Boolean, default: true },
    
    // Placement on home page - after which section should this banner appear
    placement: { 
        type: String, 
        enum: [
            'after-hero',
            'after-instagram', 
            'after-match-mood',
            'after-price-combo',
            'after-best-seller',
            'after-new-arrivals',
            'after-video-intro',
            'after-favorites',
            'after-stats'
        ], 
        default: 'after-hero' 
    },
    displayOrder: { type: Number, default: 0 }
}, { timestamps: true });

const bannerModel = mongoose.models.banner || mongoose.model('banner', bannerSchema);

export default bannerModel;
