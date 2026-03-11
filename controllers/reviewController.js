import reviewModel from '../models/reviewModel.js';
import productModel from '../models/productModel.js';

const addReview = async (req, res) => {
    try {
        const { productId, rating, title, comment, images, orderId } = req.body;
        const userId = req.body.userId;

        const existingReview = await reviewModel.findOne({ productId, userId });
        if (existingReview) {
            return res.json({ success: false, message: 'You have already reviewed this product' });
        }

        const reviewData = {
            productId,
            userId,
            rating,
            title,
            comment,
            images: images || [],
            orderId,
            verifiedPurchase: orderId ? true : false,
            status: 'approved'
        };

        const review = new reviewModel(reviewData);
        await review.save();

        const reviews = await reviewModel.find({ productId, status: 'approved' });
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        
        await productModel.findByIdAndUpdate(productId, {
            rating: avgRating.toFixed(1),
            reviewCount: reviews.length
        });

        res.json({ success: true, message: 'Review added successfully', review });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { status = 'approved', page = 1, limit = 10 } = req.query;

        const skip = (page - 1) * limit;

        const reviews = await reviewModel
            .find({ productId, status })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await reviewModel.countDocuments({ productId, status });

        res.json({ 
            success: true, 
            reviews,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const review = await reviewModel.findByIdAndUpdate(id, updateData, { new: true });

        if (!review) {
            return res.json({ success: false, message: 'Review not found' });
        }

        if (updateData.status === 'approved' || updateData.rating) {
            const reviews = await reviewModel.find({ productId: review.productId, status: 'approved' });
            const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            
            await productModel.findByIdAndUpdate(review.productId, {
                rating: avgRating.toFixed(1),
                reviewCount: reviews.length
            });
        }

        res.json({ success: true, message: 'Review updated successfully', review });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deleteReview = async (req, res) => {
    try {
        const { id } = req.params;

        const review = await reviewModel.findByIdAndDelete(id);

        if (!review) {
            return res.json({ success: false, message: 'Review not found' });
        }

        const reviews = await reviewModel.find({ productId: review.productId, status: 'approved' });
        const avgRating = reviews.length > 0 
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
            : 0;
        
        await productModel.findByIdAndUpdate(review.productId, {
            rating: avgRating.toFixed(1),
            reviewCount: reviews.length
        });

        res.json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const markReviewHelpful = async (req, res) => {
    try {
        const { id } = req.params;

        const review = await reviewModel.findByIdAndUpdate(
            id,
            { $inc: { helpfulCount: 1 } },
            { new: true }
        );

        if (!review) {
            return res.json({ success: false, message: 'Review not found' });
        }

        res.json({ success: true, message: 'Marked as helpful', review });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const listAllReviews = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const filter = status ? { status } : {};
        const skip = (page - 1) * limit;

        const reviews = await reviewModel
            .find(filter)
            .populate('productId', 'name image')
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await reviewModel.countDocuments(filter);

        res.json({ 
            success: true, 
            reviews,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { addReview, getProductReviews, updateReview, deleteReview, markReviewHelpful, listAllReviews };
