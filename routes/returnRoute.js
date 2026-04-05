import express from 'express';
import { listReturns, createReturn, updateReturnStatus, getUserReturns } from '../controllers/returnController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';

const returnRouter = express.Router();

returnRouter.get('/list', adminAuth, listReturns);
returnRouter.post('/create', authUser, createReturn);
returnRouter.put('/status/:id', adminAuth, updateReturnStatus);
returnRouter.get('/user/:userId', authUser, getUserReturns);

export default returnRouter;
