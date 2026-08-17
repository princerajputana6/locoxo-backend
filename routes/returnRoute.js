import express from 'express';
import {
    listReturns, createReturn, updateReturnStatus, getUserReturns,
    createPickupRequest, markPicked, rejectReturn, setRefund, markRefundTransferred,
    addNote, editNote, deleteNote, returnsReport, exportReturnsExcel, updateReturnFields,
} from '../controllers/returnController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';

const returnRouter = express.Router();

// Customer
returnRouter.post('/create', authUser, createReturn);
returnRouter.get('/user/:userId', authUser, getUserReturns);

// Admin — list, reports, export
returnRouter.get('/list', adminAuth, listReturns);
returnRouter.get('/report', adminAuth, returnsReport);
returnRouter.get('/export', adminAuth, exportReturnsExcel);

// Admin — workflow
returnRouter.post('/pickup/:id', adminAuth, createPickupRequest);
returnRouter.post('/picked/:id', adminAuth, markPicked);
returnRouter.post('/reject/:id', adminAuth, rejectReturn);
returnRouter.post('/refund/:id', adminAuth, setRefund);
returnRouter.post('/refund-transfer/:id', adminAuth, markRefundTransferred);
returnRouter.post('/fields/:id', adminAuth, updateReturnFields);
returnRouter.put('/status/:id', adminAuth, updateReturnStatus);

// Admin — notes CRUD
returnRouter.post('/note/:id', adminAuth, addNote);
returnRouter.put('/note/:id', adminAuth, editNote);
returnRouter.delete('/note/:id', adminAuth, deleteNote);

export default returnRouter;
