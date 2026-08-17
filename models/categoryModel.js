import mongoose from 'mongoose';
import { nextSeq } from './counterModel.js';

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    code: { type: String, index: true },    // CAT001 / SUB001 / CHI001 (by level)
    description: { type: String },
    image: { type: String },
    icon: { type: String },                 // small icon image / url
    banner: { type: String },               // category banner image
    displayInMenu: { type: Boolean, default: true },
    startDate: { type: Date },              // display from
    endDate: { type: Date },                // display to
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'category', default: null },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'category' }],
    level: { type: Number, default: 0 },
    path: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    featured: { type: Boolean, default: false },     // featured category
    showInHeader: { type: Boolean, default: false }, // header menu control
    searchKeywords: [{ type: String }],              // extra search terms
    links: [{ label: { type: String }, url: { type: String } }], // what to show in this category
    displayOrder: { type: Number, default: 0 },
    metaTitle: { type: String },
    metaDescription: { type: String }
}, { timestamps: true });

categorySchema.pre('save', async function(next) {
    try {
        if (this.parentCategory) {
            const parent = await mongoose.model('category').findById(this.parentCategory);
            if (parent) {
                this.level = parent.level + 1;
                this.path = parent.path ? `${parent.path}/${this.slug}` : this.slug;
                if (!parent.children.includes(this._id)) {
                    parent.children.push(this._id);
                    await parent.save();
                }
            }
        } else {
            this.level = 0;
            this.path = this.slug;
        }

        // Generate a level-based code once: CAT### (main) / SUB### (sub) / CHI### (child).
        if (!this.code) {
            const prefix = this.level >= 2 ? 'CHI' : this.level === 1 ? 'SUB' : 'CAT';
            const seq = await nextSeq(`categoryCode:${prefix}`);
            this.code = `${prefix}${String(seq).padStart(3, '0')}`;
        }
        next();
    } catch (err) { next(err); }
});

const categoryModel = mongoose.models.category || mongoose.model('category', categorySchema);

export default categoryModel;
