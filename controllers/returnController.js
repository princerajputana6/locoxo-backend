import returnModel from '../models/returnModel.js';
import orderModel from '../models/orderModel.js';

const listReturns = async (req, res) => {
    try {
        const returns = await returnModel.find()
            .populate('userId', 'name email')
            .populate('productId', 'name image price')
            .populate('orderId', 'orderNumber')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, returns });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const createReturn = async (req, res) => {
    try {
        const { orderId, productId, reason, description, images } = req.body;
        const userId = req.body.userId;

        const returnData = {
            orderId,
            userId,
            productId,
            reason,
            description,
            images: images || [],
            status: 'pending'
        };

        const returnRequest = new returnModel(returnData);
        await returnRequest.save();

        res.json({ success: true, message: 'Return request submitted successfully', return: returnRequest });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateReturnStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes, refundAmount } = req.body;

        const updateData = { status };
        if (adminNotes) updateData.adminNotes = adminNotes;
        if (refundAmount) updateData.refundAmount = refundAmount;

        const returnRequest = await returnModel.findByIdAndUpdate(id, updateData, { new: true });

        if (!returnRequest) {
            return res.json({ success: false, message: 'Return request not found' });
        }

        res.json({ success: true, message: 'Return status updated successfully', return: returnRequest });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getUserReturns = async (req, res) => {
    try {
        const { userId } = req.params;

        const returns = await returnModel.find({ userId })
            .populate('productId', 'name image price')
            .populate('orderId', 'orderNumber')
            .sort({ createdAt: -1 });

        res.json({ success: true, returns });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listReturns, createReturn, updateReturnStatus, getUserReturns };
