import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    image: { type: String },
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'category', default: null },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'category' }],
    level: { type: Number, default: 0 },
    path: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    displayOrder: { type: Number, default: 0 },
    metaTitle: { type: String },
    metaDescription: { type: String }
}, { timestamps: true });

categorySchema.pre('save', async function(next) {
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
    next();
});

const categoryModel = mongoose.models.category || mongoose.model('category', categorySchema);

export default categoryModel;
