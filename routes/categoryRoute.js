import express from 'express';
import { listCategories, addCategory, updateCategory, deleteCategory, getCategoryById } from '../controllers/categoryController.js';
import adminAuth from '../middleware/adminAuth.js';

const categoryRouter = express.Router();

categoryRouter.get('/list', listCategories);
categoryRouter.get('/:id', getCategoryById);
categoryRouter.post('/add', adminAuth, addCategory);
categoryRouter.put('/update/:id', adminAuth, updateCategory);
categoryRouter.delete('/delete/:id', adminAuth, deleteCategory);

export default categoryRouter;
