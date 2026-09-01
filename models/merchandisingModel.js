import mongoose from 'mongoose';

// A merchandising "section" controls where/what products are displayed on the
// storefront — homepage sections and collections (Summer/Winter/Festive), with
// banners, a category link, scheduling and drag-&-drop ranking.
const merchandisingSchema = new mongoose.Schema({
    name: { type: String, required: true },              // section name
    type: { type: String, enum: ['homepage_section', 'collection'], default: 'homepage_section' },
    collectionTag: { type: String },                     // Summer / Winter / Festive / custom

    // What this section shows on the storefront:
    //  products   → a grid/slider of chosen products
    //  categories → category cards (each with its own image + link/URL)
    //  combo      → combo bundles (a set of products sold/shown together)
    contentType: { type: String, enum: ['products', 'categories', 'combo'], default: 'products' },

    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],

    // Category cards (contentType 'categories').
    categories: [{
        name: { type: String },
        image: { type: String },
        url: { type: String },                           // where the card points (any URL/route)
    }],

    // Combo bundles (contentType 'combo').
    combos: [{
        name: { type: String },
        image: { type: String },
        price: { type: Number },
        mrp: { type: Number },
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],
    }],

    // Card layout / placement controls.
    layout: { type: String, enum: ['grid', 'slider'], default: 'grid' },
    cardsDesktop: { type: Number, default: 4 },           // cards per row on desktop
    cardsTablet: { type: Number, default: 3 },
    cardsMobile: { type: Number, default: 2 },

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
