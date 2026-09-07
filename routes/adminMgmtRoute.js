import express from 'express';
import { getOverview, addStaff, updateStaff, deleteStaff, savePermissions, updateSecurity, staffLogin } from '../controllers/adminMgmtController.js';
import adminAuth from '../middleware/adminAuth.js';

const adminMgmtRouter = express.Router();

adminMgmtRouter.post('/staff-login', staffLogin);   // public — staff sign in
adminMgmtRouter.get('/overview', adminAuth, getOverview);
adminMgmtRouter.post('/staff', adminAuth, addStaff);
adminMgmtRouter.put('/staff/:id', adminAuth, updateStaff);
adminMgmtRouter.delete('/staff/:id', adminAuth, deleteStaff);
adminMgmtRouter.put('/permissions', adminAuth, savePermissions);
adminMgmtRouter.put('/security', adminAuth, updateSecurity);

export default adminMgmtRouter;
