import couponModel from '../models/couponModel.js';

const listCoupons = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        
        const coupons = await couponModel.find(filter).sort({ createdAt: -1 });
        
        res.json({ success: true, coupons });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const addCoupon = async (req, res) => {
    try {
        const couponData = req.body;
        
        const existingCoupon = await couponModel.findOne({ code: couponData.code.toUpperCase() });
        if (existingCoupon) {
            return res.json({ success: false, message: 'Coupon code already exists' });
        }

        const coupon = new couponModel(couponData);
        await coupon.save();

        res.json({ success: true, message: 'Coupon created successfully', coupon });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const coupon = await couponModel.findByIdAndUpdate(id, updateData, { new: true });

        if (!coupon) {
            return res.json({ success: false, message: 'Coupon not found' });
        }

        res.json({ success: true, message: 'Coupon updated successfully', coupon });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        const coupon = await couponModel.findByIdAndDelete(id);

        if (!coupon) {
            return res.json({ success: false, message: 'Coupon not found' });
        }

        res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const validateCoupon = async (req, res) => {
    try {
        const { code, userId, cartAmount } = req.body;

        const coupon = await couponModel.findOne({ code: code.toUpperCase() });

        if (!coupon) {
            return res.json({ success: false, message: 'Invalid coupon code' });
        }

        if (coupon.status !== 'active') {
            return res.json({ success: false, message: 'Coupon is not active' });
        }

        const now = new Date();
        if (now < coupon.validFrom || now > coupon.validUntil) {
            return res.json({ success: false, message: 'Coupon has expired or not yet valid' });
        }

        if (cartAmount < coupon.minPurchaseAmount) {
            return res.json({ 
                success: false, 
                message: `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required` 
            });
        }

        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res.json({ success: false, message: 'Coupon usage limit reached' });
        }

        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = (cartAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount) {
                discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
            }
        } else {
            discountAmount = coupon.discountValue;
        }

        res.json({ 
            success: true, 
            message: 'Coupon applied successfully',
            discount: discountAmount,
            coupon: {
                code: coupon.code,
                description: coupon.description,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue
            }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listCoupons, addCoupon, updateCoupon, deleteCoupon, validateCoupon };
