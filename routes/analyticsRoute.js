import express from 'express';
import { getOverview, getDashboard } from '../controllers/analyticsController.js';
import adminAuth from '../middleware/adminAuth.js';

const analyticsRouter = express.Router();

analyticsRouter.get('/overview', adminAuth, getOverview);
analyticsRouter.get('/dashboard', adminAuth, getDashboard);

export default analyticsRouter;
