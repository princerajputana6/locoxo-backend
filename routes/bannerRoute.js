import express from 'express';
import { listBanners, addBanner, updateBanner, deleteBanner } from '../controllers/bannerController.js';
import adminAuth from '../middleware/adminAuth.js';
import upload from '../middleware/multer.js';

const bannerRouter = express.Router();

bannerRouter.get('/list', listBanners);
bannerRouter.post('/add', adminAuth, upload.single('image'), addBanner);
bannerRouter.put('/update/:id', adminAuth, updateBanner);
bannerRouter.put('/toggle/:id', adminAuth, updateBanner);
bannerRouter.delete('/remove/:id', adminAuth, deleteBanner);

export default bannerRouter;
