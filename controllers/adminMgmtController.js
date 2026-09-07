import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import staffModel from '../models/staffModel.js';
import influencerModel from '../models/influencerModel.js';
import { getAdminSettings } from '../models/adminSettingsModel.js';

// GET /api/admin-mgmt/overview — stats + staff + influencers + settings + logins.
export const getOverview = async (req, res) => {
    try {
        const staff = await staffModel.find({}, '-password').sort({ createdAt: -1 }).lean();
        const influencers = await influencerModel.find({}, 'name email phone status lastLogin createdAt').lean();
        const settings = await getAdminSettings();

        const admins = staff.filter((s) => s.role === 'admin');
        const onlyStaff = staff.filter((s) => s.role === 'staff');

        // Combined "All Users" list (super-admin from env + staff + influencers).
        const allUsers = [
            { name: 'Admin', email: process.env.ADMIN_EMAIL || 'admin@locoxo.com', mobile: settings.adminMobile, role: 'Admin', accessType: 'All Access', status: 'active', lastLogin: new Date() },
            ...staff.map((s) => ({ _id: s._id, name: s.name, email: s.email, mobile: s.mobile, role: s.role === 'admin' ? 'Admin' : 'Staff', roleRaw: s.role, accessType: s.accessType === 'all' ? 'All Access' : 'Limited Access', accessTypeRaw: s.accessType, permissions: s.permissions || [], status: s.status, lastLogin: s.lastLogin })),
            ...influencers.map((i) => ({ name: i.name, email: i.email, mobile: i.phone, role: 'Influencer', accessType: 'Limited Access', status: i.status === 'active' ? 'active' : 'inactive', lastLogin: i.lastLogin })),
        ];

        const lastLogins = allUsers.filter((u) => u.lastLogin).sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin)).slice(0, 5)
            .map((u) => ({ name: u.role === 'Admin' ? u.name : `${u.role} - ${u.name}`, email: u.email, at: u.lastLogin, status: u.status }));

        res.json({
            success: true,
            stats: {
                admins: admins.length + 1, // + env super-admin
                staff: onlyStaff.length,
                influencers: influencers.length,
                activeUsers: allUsers.filter((u) => u.status === 'active').length,
            },
            staff, influencers, settings, allUsers, lastLogins,
        });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

export const addStaff = async (req, res) => {
    try {
        const { name, email, mobile, password, role, accessType, status, permissions } = req.body;
        if (!name || !email) return res.json({ success: false, message: 'Name and email are required' });
        if (!password) return res.json({ success: false, message: 'A password is required so the staff can log in' });
        if (await staffModel.findOne({ email: email.toLowerCase() })) return res.json({ success: false, message: 'A user with this email exists' });
        const hashed = await bcrypt.hash(password, 10);
        const doc = await staffModel.create({
            name, email: email.toLowerCase(), mobile, password: hashed,
            role: role || 'staff',
            accessType: accessType || 'limited',
            permissions: Array.isArray(permissions) ? permissions : [],
            status: status || 'active',
        });
        res.json({ success: true, message: 'User added', staff: { _id: doc._id, name: doc.name, email: doc.email } });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

export const updateStaff = async (req, res) => {
    try {
        const update = { ...req.body };
        if (update.email) update.email = update.email.toLowerCase();
        if (update.password) update.password = await bcrypt.hash(update.password, 10); else delete update.password;
        if (update.permissions !== undefined && !Array.isArray(update.permissions)) delete update.permissions;
        const doc = await staffModel.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
        if (!doc) return res.json({ success: false, message: 'User not found' });
        res.json({ success: true, message: 'Updated', staff: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// POST /api/admin-mgmt/staff-login — staff/sub-admin sign in with their own credentials.
export const staffLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.json({ success: false, message: 'Email and password are required' });
        const staff = await staffModel.findOne({ email: String(email).toLowerCase() });
        if (!staff) return res.json({ success: false, message: 'No staff account found for this email' });
        if (staff.status !== 'active') return res.json({ success: false, message: 'This staff account is inactive' });
        if (!staff.password) return res.json({ success: false, message: 'No password set — ask the admin to set one' });
        const ok = await bcrypt.compare(password, staff.password);
        if (!ok) return res.json({ success: false, message: 'Invalid credentials' });
        staff.lastLogin = new Date();
        await staff.save();
        // Token identifies this staff; the admin JWT secret is shared so adminAuth accepts it.
        const token = jwt.sign({ id: staff._id, role: staff.role, kind: 'staff' }, process.env.JWT_SECRET);
        res.json({
            success: true,
            token,
            staff: {
                _id: staff._id, name: staff.name, email: staff.email, role: staff.role,
                accessType: staff.accessType, permissions: staff.permissions || [],
            },
        });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

export const deleteStaff = async (req, res) => {
    try {
        const doc = await staffModel.findByIdAndDelete(req.params.id);
        if (!doc) return res.json({ success: false, message: 'User not found' });
        res.json({ success: true, message: 'User removed' });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// PUT /api/admin-mgmt/permissions  body { permissions: [...] }
export const savePermissions = async (req, res) => {
    try {
        const doc = await getAdminSettings();
        if (Array.isArray(req.body.permissions)) doc.staffPermissions = req.body.permissions;
        await doc.save();
        res.json({ success: true, message: 'Permissions saved', staffPermissions: doc.staffPermissions });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// PUT /api/admin-mgmt/security  body { otpRequired, twoFactor, adminMobile }
export const updateSecurity = async (req, res) => {
    try {
        const doc = await getAdminSettings();
        ['otpRequired', 'twoFactor', 'mobileVerified'].forEach((k) => { if (req.body[k] !== undefined) doc[k] = !!req.body[k]; });
        if (req.body.adminMobile !== undefined) { doc.adminMobile = req.body.adminMobile; doc.mobileVerified = false; }
        await doc.save();
        res.json({ success: true, message: 'Security settings updated', settings: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};
