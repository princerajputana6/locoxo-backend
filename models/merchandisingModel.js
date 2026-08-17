import mongoose from 'mongoose';

// A merchandising "section" controls where/what products are displayed on the
// storefront — homepage sections and collections (Summer/Winter/Festive), with
// banners, a category link, scheduling and drag-&-drop ranking.
const merchandisingSchema = new mongoose.Schema({
    name: { type: String, required: true },              // section name
    type: { type: String, enum: ['homepage_section', 'collection'], default: 'homepage_section' },
    collectionTag: { type: String },                     // Summer / Winter / Festive / custom

    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],

    // Media — high-quality banners (1–2), a mobile/tablet variant, video + thumbnail.
    bannerImages: [{ type: String }],
    bannerMobile: { type: String },
    video: { type: String },
    thumbnail: { type: String },

    link: { type: String },                              // where the section/CTA points

    status: { type: String, enum: ['active', 'inactive', 'scheduled', 'coming_soon'], default: 'active' },
    scheduleStart: { type: Date },
    scheduleEnd: { type: Date },

    rank: { type: Number, default: 0 },                  // display order (drag & drop)
}, { timestamps: true });                                // updatedAt = last modification date

const merchandisingModel = mongoose.models.merchandising || mongoose.model('merchandising', merchandisingSchema);

export default merchandisingModel;
