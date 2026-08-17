import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String, required: true },
    video: { type: String },
    link: { type: String },
    isActive: { type: Boolean, default: true },

    // Banner Management (image 18).
    bannerType: { type: String, enum: ['homepage_slider', 'promotional', 'collection', 'seasonal'], default: 'homepage_slider' },
    sizeRatio: { type: String, default: '16:9 (1920x1080)' },
    buttonText: { type: String, default: 'Shop Now' },
    buttonLink: { type: String },
    links: [{ label: String, url: String }],
    position: { type: String, default: 'Homepage Slider' },
    startDate: { type: Date },
    endDate: { type: Date },
    
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
