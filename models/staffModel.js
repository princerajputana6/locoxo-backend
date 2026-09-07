import mongoose from 'mongoose';

// Admin / staff users managed from Admin Management. (The primary super-admin
// still authenticates via env credentials; these are additional users.)
const staffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String },
    password: { type: String },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    accessType: { type: String, enum: ['all', 'limited'], default: 'limited' },
    // Modules a "limited" staff may access (keys match the admin sidebar sections).
    permissions: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    lastLogin: { type: Date },
}, { timestamps: true });

const staffModel = mongoose.models.staff || mongoose.model('staff', staffSchema);

export default staffModel;
