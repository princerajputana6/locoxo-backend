import express from 'express';
import { listCategories, addCategory, updateCategory, deleteCategory, getCategoryById, toggleCategoryFlag, categoryDashboard, createCategoryTree, listCategoryTree } from '../controllers/categoryController.js';
import adminAuth from '../middleware/adminAuth.js';
import upload from '../middleware/multer.js';

const categoryRouter = express.Router();

// Image + icon + banner uploads.
const categoryMedia = upload.fields([
    { name: 'image', maxCount: 1 }, { name: 'icon', maxCount: 1 }, { name: 'banner', maxCount: 1 },
]);

categoryRouter.get('/list', listCategories);
categoryRouter.get('/tree', adminAuth, listCategoryTree);
categoryRouter.post('/tree', adminAuth, upload.any(), createCategoryTree);
categoryRouter.get('/dashboard', adminAuth, categoryDashboard);
categoryRouter.get('/:id', getCategoryById);
categoryRouter.post('/add', adminAuth, categoryMedia, addCategory);
categoryRouter.put('/update/:id', adminAuth, categoryMedia, updateCategory);
categoryRouter.put('/flag/:id', adminAuth, toggleCategoryFlag);
categoryRouter.delete('/remove/:id', adminAuth, deleteCategory);

export default categoryRouter;
