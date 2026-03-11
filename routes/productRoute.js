import express from 'express'
import { listProducts, addProduct, removeProduct, singleProduct, getRelatedProducts, getRecentlyViewed, updateProduct } from '../controllers/productController.js'
import upload from '../middleware/multer.js';
import adminAuth from '../middleware/adminAuth.js';

const productRouter = express.Router();

productRouter.post('/add',adminAuth,upload.fields([{name:'image1',maxCount:1},{name:'image2',maxCount:1},{name:'image3',maxCount:1},{name:'image4',maxCount:1}]),addProduct);
productRouter.post('/remove',adminAuth,removeProduct);
productRouter.put('/update/:id',adminAuth,updateProduct);
productRouter.post('/single',singleProduct);
productRouter.get('/list',listProducts);
productRouter.get('/related/:productId',getRelatedProducts);
productRouter.get('/recently-viewed/:userId',getRecentlyViewed)

export default productRouter