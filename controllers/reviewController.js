import reviewModel from '../models/reviewModel.js';
import productModel from '../models/productModel.js';
import { getReviewSettings as getReviewSettingsDoc } from '../models/reviewSettingsModel.js';

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
        const { status, rating, language, search, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status && status !== 'All') filter.status = status;
        if (rating && rating !== 'All') filter.rating = Number(rating);
        if (language && language !== 'All') filter.language = language;
        const skip = (page - 1) * limit;

        let query = reviewModel.find(filter).populate('productId', 'name image').populate('userId', 'name email').sort({ createdAt: -1 });
        let reviews = await query.lean();
        const s = (search || '').trim().toLowerCase();
        if (s) reviews = reviews.filter((r) => `${r.userId?.name || ''} ${r.productId?.name || ''} ${r.title || ''}`.toLowerCase().includes(s));
        const total = reviews.length;
        const paged = reviews.slice(skip, skip + Number(limit));

        // Rating summary across ALL reviews.
        const all = await reviewModel.find({}, 'rating reported reportResolved').lean();
        const totalAll = all.length;
        const breakdown = [5, 4, 3, 2, 1].map((star) => {
            const c = all.filter((r) => r.rating === star).length;
            return { star, count: c, pct: totalAll ? Math.round((c / totalAll) * 100) : 0 };
        });
        const avg = totalAll ? (all.reduce((a, r) => a + r.rating, 0) / totalAll).toFixed(1) : '0.0';
        const reportSummary = {
            total: all.filter((r) => r.reported).length,
            resolved: all.filter((r) => r.reported && r.reportResolved).length,
        };
        reportSummary.remaining = reportSummary.total - reportSummary.resolved;

        const settings = await getReviewSettingsDoc();

        res.json({
            success: true, reviews: paged,
            summary: { avg, total: totalAll, breakdown },
            reportSummary, settings,
            pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// ── Review settings + keywords ──────────────────────────────────────────────
const updateReviewSettings = async (req, res) => {
    try {
        const doc = await getReviewSettingsDoc();
        const allowed = ['autoApprove', 'requireVerifiedPurchase', 'allowMediaReviews', 'showOnProductPage'];
        allowed.forEach((k) => { if (req.body[k] !== undefined) doc[k] = !!req.body[k]; });
        await doc.save();
        res.json({ success: true, message: 'Settings updated', settings: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};
const toggleKeyword = async (req, res) => {
    try {
        const { keyword, action } = req.body; // action: add | remove
        const doc = await getReviewSettingsDoc();
        const kw = String(keyword || '').trim().toLowerCase();
        if (!kw) return res.json({ success: false, message: 'Keyword required' });
        if (action === 'remove') doc.blockedKeywords = doc.blockedKeywords.filter((k) => k !== kw);
        else if (!doc.blockedKeywords.includes(kw)) doc.blockedKeywords.push(kw);
        await doc.save();
        res.json({ success: true, blockedKeywords: doc.blockedKeywords });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// Reply / verify / report actions.
const replyReview = async (req, res) => {
    try {
        const doc = await reviewModel.findByIdAndUpdate(req.params.id, { adminResponse: { comment: req.body.comment, respondedAt: new Date() } }, { new: true });
        if (!doc) return res.json({ success: false, message: 'Review not found' });
        res.json({ success: true, message: 'Reply saved', review: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};
const verifyReview = async (req, res) => {
    try {
        const doc = await reviewModel.findByIdAndUpdate(req.params.id, { verifiedPurchase: req.body.verified !== false }, { new: true });
        if (!doc) return res.json({ success: false, message: 'Review not found' });
        res.json({ success: true, message: 'Updated', review: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};
const reportReview = async (req, res) => {
    try {
        const doc = await reviewModel.findByIdAndUpdate(req.params.id, { reported: true, reportReason: req.body.reason }, { new: true });
        if (!doc) return res.json({ success: false, message: 'Review not found' });
        res.json({ success: true, message: 'Reported', review: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

export { addReview, getProductReviews, updateReview, deleteReview, markReviewHelpful, listAllReviews, updateReviewSettings, toggleKeyword, replyReview, verifyReview, reportReview };
