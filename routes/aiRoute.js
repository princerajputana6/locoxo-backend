import express from 'express';
import { recommendations, suggestions, stockPrediction } from '../controllers/aiController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';

const aiRouter = express.Router();

// Customer-facing
aiRouter.post('/recommendations', authUser, recommendations);
aiRouter.post('/suggestions', suggestions); // public (product page cross-sell)

// Admin-facing
aiRouter.get('/stock-prediction', adminAuth, stockPrediction);

export default aiRouter;
