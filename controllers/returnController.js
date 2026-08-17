import returnModel from '../models/returnModel.js';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import stockAdjustmentModel from '../models/stockAdjustmentModel.js';
import { customerIdFor } from '../utils/orderNumber.js';

const pushHistory = (doc, status, by, note) => {
    doc.statusHistory = doc.statusHistory || [];
    doc.statusHistory.push({ status, at: new Date(), by: by || 'admin', note: note || '' });
};

// GET /api/return/list?search=&status=&type=&from=&to=
const listReturns = async (req, res) => {
    try {
        const { search, status, type, from, to } = req.query;
        const q = {};
        if (status && status !== 'All') q.status = status;
        if (type && type !== 'All') q.type = type;
        if (from || to) {
            q.createdAt = {};
            if (from) q.createdAt.$gte = new Date(from);
            if (to) q.createdAt.$lte = new Date(new Date(to).getTime() + 86400000);
        }

        let returns = await returnModel.find(q)
            .populate('userId', 'name email phone')
            .populate('productId', 'name image price productCode')
            .populate('orderId', 'orderNumber address amount paymentMethod')
            .sort({ createdAt: -1 })
            .lean();

        returns = returns.map((r) => ({ ...r, customerId: r.customerId || customerIdFor(r.userId), returnNumber: r.returnNumber || `RET-${String(r._id).slice(-4).toUpperCase()}` }));

        const s = (search || '').trim().toLowerCase();
        if (s) {
            returns = returns.filter((r) =>
                `${r.orderId?.orderNumber || ''} ${r.customerId || ''} ${r.userId?.name || ''} ${r.productId?.name || ''}`
                    .toLowerCase().includes(s)
            );
        }
        res.json({ success: true, returns });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/return/create — customer raises a return/exchange (charges optional).
const createReturn = async (req, res) => {
    try {
        const { orderId, productId, reason, description, images, type, size, color, quantity } = req.body;
        const userId = req.body.userId;
        const doc = new returnModel({
            orderId, userId, productId, reason, description,
            type: type || 'return', size, color, quantity: quantity || 1,
            images: images || [], status: 'requested',
        });
        pushHistory(doc, 'requested', userId ? 'customer' : 'admin', reason);

        // Reflect on the order so it appears in the return portal.
        try { await orderModel.findByIdAndUpdate(orderId, { 'returnRequest.requested': true, 'returnRequest.reason': reason, 'returnRequest.status': 'pending', 'returnRequest.requestDate': new Date() }); } catch { /* ignore */ }

        await doc.save();
        res.json({ success: true, message: 'Return request submitted', return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/return/pickup/:id — create a pickup request.
const createPickupRequest = async (req, res) => {
    try {
        const doc = await returnModel.findById(req.params.id);
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        doc.status = 'pickup_requested';
        doc.pickupRequestedAt = new Date();
        pushHistory(doc, 'pickup_requested', req.adminEmail);
        await doc.save();
        res.json({ success: true, message: 'Pickup requested', return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/return/picked/:id  body { sku?, condition, conditionNote, restock }
// Scan the barcode → confirm the item, optionally restock inventory, record condition.
const markPicked = async (req, res) => {
    try {
        const { sku, condition, conditionNote, restock = true } = req.body;
        const doc = await returnModel.findById(req.params.id);
        if (!doc) return res.json({ success: false, message: 'Return not found' });

        doc.status = 'approved';
        doc.condition = condition || doc.condition;
        doc.conditionNote = conditionNote || doc.conditionNote;
        if (sku) doc.sku = sku;

        // Restock only if the item is in good condition and not already restocked.
        let restockMsg = '';
        if (restock && condition === 'good' && !doc.inventoryRestocked) {
            const product = await productModel.findById(doc.productId);
            if (product) {
                const variant = (product.variants || []).find((v) =>
                    (doc.sku && v.sku === doc.sku) || (v.size === doc.size && v.color === doc.color)
                ) || (product.variants || [])[0];
                if (variant) {
                    const before = variant.stock || 0;
                    variant.stock = before + (doc.quantity || 1);
                    await product.save();
                    await stockAdjustmentModel.create({
                        productId: product._id, productCode: product.productCode, productName: product.name,
                        sku: variant.sku, size: variant.size, color: variant.color,
                        type: 'return', qtyChange: variant.stock - before, stockBefore: before, stockAfter: variant.stock,
                        reason: `Return picked (order ${doc.orderId})`, admin: req.adminEmail || 'admin',
                    });
                    doc.inventoryRestocked = true;
                    restockMsg = ` · restocked ${doc.quantity || 1} to ${variant.sku}`;
                }
            }
        }
        pushHistory(doc, 'approved', req.adminEmail, `Picked (${condition || 'n/a'})${restockMsg}`);
        await doc.save();
        res.json({ success: true, message: `Picked & approved${restockMsg}`, return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/return/reject/:id  body { reason }
const rejectReturn = async (req, res) => {
    try {
        const { reason } = req.body;
        const doc = await returnModel.findById(req.params.id);
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        doc.status = 'rejected';
        doc.notes.push({ note: `Rejected: ${reason || 'no reason given'}`, by: req.adminEmail || 'admin', at: new Date() });
        pushHistory(doc, 'rejected', req.adminEmail, reason);
        await doc.save();
        res.json({ success: true, message: 'Return rejected', return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/return/refund/:id  body { charges, refundAmount, refundMethod }
const setRefund = async (req, res) => {
    try {
        const { charges = 0, refundAmount, refundMethod } = req.body;
        const doc = await returnModel.findById(req.params.id);
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        doc.charges = Number(charges) || 0;
        doc.refundAmount = refundAmount !== undefined ? Number(refundAmount) : doc.refundAmount;
        doc.refundMethod = refundMethod || doc.refundMethod;
        doc.status = 'refund_pending';
        pushHistory(doc, 'refund_pending', req.adminEmail, `Charges ${doc.charges}, refund ${doc.refundAmount}`);
        await doc.save();
        res.json({ success: true, message: 'Refund detail saved', return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/return/refund-transfer/:id  body { refundRef }
const markRefundTransferred = async (req, res) => {
    try {
        const { refundRef } = req.body;
        const doc = await returnModel.findById(req.params.id);
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        doc.status = 'refund_transferred';
        doc.refundRef = refundRef || doc.refundRef;
        doc.refundTransferredAt = new Date();
        pushHistory(doc, 'refund_transferred', req.adminEmail, refundRef);
        // Reflect refunded state on the order.
        try { await orderModel.findByIdAndUpdate(doc.orderId, { status: 'Returned' }); } catch { /* ignore */ }
        await doc.save();
        res.json({ success: true, message: 'Refund transferred', return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Notes CRUD (editable/deletable) — POST add, PUT edit, DELETE remove.
const addNote = async (req, res) => {
    try {
        const doc = await returnModel.findByIdAndUpdate(req.params.id,
            { $push: { notes: { note: req.body.note, by: req.adminEmail || 'admin', at: new Date() } } }, { new: true });
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        res.json({ success: true, notes: doc.notes });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};
const editNote = async (req, res) => {
    try {
        const { noteId, note } = req.body;
        const doc = await returnModel.findById(req.params.id);
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        const n = doc.notes.id(noteId);
        if (!n) return res.json({ success: false, message: 'Note not found' });
        n.note = note; await doc.save();
        res.json({ success: true, notes: doc.notes });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};
const deleteNote = async (req, res) => {
    try {
        const doc = await returnModel.findByIdAndUpdate(req.params.id,
            { $pull: { notes: { _id: req.body.noteId } } }, { new: true });
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        res.json({ success: true, notes: doc.notes });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

// Generic status update (kept for compatibility with existing admin calls).
const updateReturnStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes, refundAmount } = req.body;
        const doc = await returnModel.findById(id);
        if (!doc) return res.json({ success: false, message: 'Return request not found' });
        if (status) { doc.status = status; pushHistory(doc, status, req.adminEmail); }
        if (adminNotes) doc.adminNotes = adminNotes;
        if (refundAmount !== undefined) doc.refundAmount = refundAmount;
        await doc.save();
        res.json({ success: true, message: 'Return status updated', return: doc });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getUserReturns = async (req, res) => {
    try {
        const returns = await returnModel.find({ userId: req.params.userId })
            .populate('productId', 'name image price')
            .populate('orderId', 'orderNumber')
            .sort({ createdAt: -1 });
        res.json({ success: true, returns });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/return/report?period=daily|weekly|monthly|yearly
const returnsReport = async (req, res) => {
    try {
        const period = (req.query.period || 'daily').toLowerCase();
        const fmt = { daily: '%Y-%m-%d', weekly: '%G-W%V', monthly: '%Y-%m', yearly: '%Y' }[period] || '%Y-%m-%d';
        const rows = await returnModel.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: fmt, date: '$createdAt' } },
                    total: { $sum: 1 },
                    refunded: { $sum: { $cond: [{ $eq: ['$status', 'refund_transferred'] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
                    refundAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
                },
            },
            { $sort: { _id: -1 } }, { $limit: 90 },
        ]);
        res.json({ success: true, period, rows });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/return/export — Excel: order id, date/time, product, status.
const exportReturnsExcel = async (req, res) => {
    try {
        const { status, from, to } = req.query;
        const q = {};
        if (status && status !== 'All') q.status = status;
        if (from || to) {
            q.createdAt = {};
            if (from) q.createdAt.$gte = new Date(from);
            if (to) q.createdAt.$lte = new Date(new Date(to).getTime() + 86400000);
        }
        const returns = await returnModel.find(q)
            .populate('productId', 'name').populate('orderId', 'orderNumber').sort({ createdAt: -1 }).lean();

        const data = returns.map((r) => {
            const dt = new Date(r.createdAt);
            return {
                'Order ID': r.orderId?.orderNumber || '',
                'Type': r.type,
                'Date': dt.toLocaleDateString('en-IN'),
                'Time': dt.toLocaleTimeString('en-IN'),
                'Product': r.productId?.name || '',
                'Reason': r.reason,
                'Charges': r.charges || 0,
                'Refund': r.refundAmount || 0,
                'Status': r.status,
            };
        });
        const XLSX = (await import('xlsx')).default;
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Returns');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="returns-${Date.now()}.xlsx"`);
        res.send(buf);
    } catch (error) {
        console.log(error);
        if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/return/fields/:id — save table/detail fields (manual barcode, pickup, courier…).
const updateReturnFields = async (req, res) => {
    try {
        const allowed = ['manualBarcode', 'pickupType', 'pickupTrackingId', 'returnCourier', 'paymentMode', 'exchangeProduct'];
        const update = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
        const doc = await returnModel.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!doc) return res.json({ success: false, message: 'Return not found' });
        res.json({ success: true, message: 'Saved', return: doc });
    } catch (error) { console.log(error); res.json({ success: false, message: error.message }); }
};

export {
    updateReturnFields,
    listReturns, createReturn, updateReturnStatus, getUserReturns,
    createPickupRequest, markPicked, rejectReturn, setRefund, markRefundTransferred,
    addNote, editNote, deleteNote, returnsReport, exportReturnsExcel,
};
