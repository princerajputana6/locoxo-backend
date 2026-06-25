import express from 'express';
import { getOverview } from '../controllers/analyticsController.js';
import adminAuth from '../middleware/adminAuth.js';

const analyticsRouter = express.Router();

analyticsRouter.get('/overview', adminAuth, getOverview);

export default analyticsRouter;
