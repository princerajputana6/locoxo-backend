import express from 'express';
import { addReview, getProductReviews, updateReview, deleteReview, markReviewHelpful, listAllReviews } from '../controllers/reviewController.js';
import authUser from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const reviewRouter = express.Router();

reviewRouter.post('/add', authUser, addReview);
reviewRouter.get('/product/:productId', getProductReviews);
reviewRouter.put('/update/:id', adminAuth, updateReview);
reviewRouter.delete('/delete/:id', adminAuth, deleteReview);
reviewRouter.post('/helpful/:id', markReviewHelpful);
reviewRouter.get('/list', adminAuth, listAllReviews);

export default reviewRouter;
