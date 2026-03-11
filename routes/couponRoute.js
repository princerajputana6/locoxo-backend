import express from 'express';
import { listCoupons, addCoupon, updateCoupon, deleteCoupon, validateCoupon } from '../controllers/couponController.js';
import adminAuth from '../middleware/adminAuth.js';

const couponRouter = express.Router();

couponRouter.get('/list', adminAuth, listCoupons);
couponRouter.post('/add', adminAuth, addCoupon);
couponRouter.put('/update/:id', adminAuth, updateCoupon);
couponRouter.delete('/delete/:id', adminAuth, deleteCoupon);
couponRouter.post('/validate', validateCoupon);

export default couponRouter;
