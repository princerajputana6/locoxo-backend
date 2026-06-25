import express from 'express';
import {
    listPlans, getMySubscription, subscribe, verifySubscription, cancelSubscription,
    adminListPlans, createPlan, updatePlan, deletePlan, subscriberStats
} from '../controllers/subscriptionController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';

const subscriptionRouter = express.Router();

// Public
subscriptionRouter.get('/plans', listPlans);

// Customer
subscriptionRouter.get('/me', authUser, getMySubscription);
subscriptionRouter.post('/subscribe', authUser, subscribe);
subscriptionRouter.post('/verify', authUser, verifySubscription);
subscriptionRouter.post('/cancel', authUser, cancelSubscription);

// Admin
subscriptionRouter.get('/admin/plans', adminAuth, adminListPlans);
subscriptionRouter.post('/admin/plans', adminAuth, createPlan);
subscriptionRouter.put('/admin/plans/:id', adminAuth, updatePlan);
subscriptionRouter.delete('/admin/plans/:id', adminAuth, deletePlan);
subscriptionRouter.get('/admin/subscribers', adminAuth, subscriberStats);

export default subscriptionRouter;
