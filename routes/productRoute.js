import express from 'express'
import { listProducts, addProduct, removeProduct, singleProduct, getRelatedProducts, getRecentlyViewed, updateProduct, updateStock, setProductStatus, duplicateProduct, productDashboard, productsAddedReport, importExcel, addProductColourwise } from '../controllers/productController.js'
import { uploadMedia, uploadImport } from '../middleware/multer.js';
import adminAuth from '../middleware/adminAuth.js';

const productRouter = express.Router();

// Media fields: up to 7 images, a size-chart image, and up to 2 videos.
const productMedia = uploadMedia.fields([
    { name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }, { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }, { name: 'image5', maxCount: 1 }, { name: 'image6', maxCount: 1 },
    { name: 'image7', maxCount: 1 }, { name: 'images', maxCount: 7 },
    { name: 'sizeChart', maxCount: 1 }, { name: 'video', maxCount: 2 },
])

productRouter.post('/add', adminAuth, productMedia, addProduct);
productRouter.post('/add-colourwise', adminAuth, uploadMedia.any(), addProductColourwise);
productRouter.post('/remove', adminAuth, removeProduct);
productRouter.put('/update/:id', adminAuth, productMedia, updateProduct);
productRouter.put('/status/:id', adminAuth, setProductStatus);
productRouter.post('/duplicate/:id', adminAuth, duplicateProduct);
productRouter.put('/stock/:id', adminAuth, updateStock);
productRouter.post('/import-excel', adminAuth, uploadImport.fields([{ name: 'file', maxCount: 1 }]), importExcel);
productRouter.get('/dashboard', adminAuth, productDashboard);
productRouter.get('/report/daily', adminAuth, productsAddedReport);
productRouter.post('/single', singleProduct);
productRouter.get('/list', listProducts);
productRouter.get('/related/:productId', getRelatedProducts);
productRouter.get('/recently-viewed/:userId', getRecentlyViewed)

export default productRouter
