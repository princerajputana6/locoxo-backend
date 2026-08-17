import mongoose from 'mongoose';

const MODULES = ['Dashboard', 'Orders', 'Products', 'Customers', 'Marketing', 'Reports', 'Settings'];
const defaultPerms = () => MODULES.map((m) => ({
    module: m,
    view: ['Dashboard', 'Orders', 'Products', 'Customers', 'Marketing', 'Reports'].includes(m),
    add: ['Orders', 'Products', 'Marketing'].includes(m),
    edit: ['Orders', 'Products', 'Customers', 'Marketing'].includes(m),
    delete: ['Products', 'Marketing'].includes(m),
}));

// Singleton for Admin Management: staff permission matrix + security settings.
const adminSettingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    staffPermissions: {
        type: [{ module: String, view: Boolean, add: Boolean, edit: Boolean, delete: Boolean }],
        default: defaultPerms,
    },
    otpRequired: { type: Boolean, default: true },
    twoFactor: { type: Boolean, default: false },
    adminMobile: { type: String, default: '+91 98765 43210' },
    mobileVerified: { type: Boolean, default: true },
}, { timestamps: true });

const adminSettingsModel = mongoose.models.adminSettings || mongoose.model('adminSettings', adminSettingsSchema);

export const getAdminSettings = async () => {
    let doc = await adminSettingsModel.findOne({ key: 'global' });
    if (!doc) doc = await adminSettingsModel.create({ key: 'global' });
    return doc;
};

export default adminSettingsModel;
