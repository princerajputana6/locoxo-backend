import express from 'express';
import { listBanners, addBanner, updateBanner, deleteBanner } from '../controllers/bannerController.js';
import adminAuth from '../middleware/adminAuth.js';
import { uploadMedia } from '../middleware/multer.js';

const bannerRouter = express.Router();

const bannerMedia = uploadMedia.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]);

bannerRouter.get('/list', listBanners);
bannerRouter.post('/add', adminAuth, bannerMedia, addBanner);
bannerRouter.put('/update/:id', adminAuth, updateBanner);
bannerRouter.put('/toggle/:id', adminAuth, updateBanner);
bannerRouter.delete('/remove/:id', adminAuth, deleteBanner);

export default bannerRouter;
