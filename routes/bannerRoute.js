import express from 'express';
import { listBanners, addBanner, updateBanner, deleteBanner } from '../controllers/bannerController.js';
import adminAuth from '../middleware/adminAuth.js';

const bannerRouter = express.Router();

bannerRouter.get('/list', listBanners);
bannerRouter.post('/add', adminAuth, addBanner);
bannerRouter.put('/update/:id', adminAuth, updateBanner);
bannerRouter.delete('/delete/:id', adminAuth, deleteBanner);

export default bannerRouter;
