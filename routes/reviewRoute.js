import express from 'express';
import { addReview, getProductReviews, updateReview, deleteReview, markReviewHelpful, listAllReviews, updateReviewSettings, toggleKeyword, replyReview, verifyReview, reportReview } from '../controllers/reviewController.js';
import authUser from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const reviewRouter = express.Router();

reviewRouter.post('/add', authUser, addReview);
reviewRouter.get('/product/:productId', getProductReviews);
reviewRouter.post('/helpful/:id', markReviewHelpful);

// Admin
reviewRouter.get('/list', adminAuth, listAllReviews);
reviewRouter.put('/update/:id', adminAuth, updateReview);
reviewRouter.delete('/delete/:id', adminAuth, deleteReview);
reviewRouter.put('/settings', adminAuth, updateReviewSettings);
reviewRouter.post('/keyword', adminAuth, toggleKeyword);
reviewRouter.post('/reply/:id', adminAuth, replyReview);
reviewRouter.post('/verify/:id', adminAuth, verifyReview);
reviewRouter.post('/report/:id', adminAuth, reportReview);

export default reviewRouter;
