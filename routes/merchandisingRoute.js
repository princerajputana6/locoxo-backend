import express from 'express';
import { listSections, publicSections, addSection, updateSection, deleteSection, duplicateSection, setStatus, reorder } from '../controllers/merchandisingController.js';
import adminAuth from '../middleware/adminAuth.js';
import { uploadMedia } from '../middleware/multer.js';

const merchandisingRouter = express.Router();

const media = uploadMedia.fields([
    { name: 'bannerImages', maxCount: 2 },
    { name: 'bannerMobile', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'video', maxCount: 1 },
]);

merchandisingRouter.get('/public', publicSections);
merchandisingRouter.get('/list', adminAuth, listSections);
merchandisingRouter.post('/add', adminAuth, media, addSection);
merchandisingRouter.put('/update/:id', adminAuth, media, updateSection);
merchandisingRouter.put('/status/:id', adminAuth, setStatus);
merchandisingRouter.post('/duplicate/:id', adminAuth, duplicateSection);
merchandisingRouter.post('/reorder', adminAuth, reorder);
merchandisingRouter.delete('/remove/:id', adminAuth, deleteSection);

export default merchandisingRouter;
