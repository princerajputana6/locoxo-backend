import express from 'express';
import { getMyReferral, validateReferral, referralLeaderboard } from '../controllers/referralController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';

const referralRouter = express.Router();

referralRouter.get('/me', authUser, getMyReferral);
referralRouter.get('/validate', validateReferral);
referralRouter.get('/admin/leaderboard', adminAuth, referralLeaderboard);

export default referralRouter;
