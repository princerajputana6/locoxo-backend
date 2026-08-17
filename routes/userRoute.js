import express from 'express'
import { loginUser, registerUser, adminLogin, getAllCustomers, getUserProfile, updateUserProfile, googleAuth, addAddress, deleteAddress, sendLoginOtp, verifyLoginOtp, forgotPassword, resetPassword, getCustomerDetail, setCustomerBlock, setCustomerCod, deleteCustomer } from '../controllers/userController.js'
import adminAuth from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/google-auth', googleAuth)
userRouter.post('/otp/send', sendLoginOtp)
userRouter.post('/otp/verify', verifyLoginOtp)
userRouter.post('/forgot-password', forgotPassword)
userRouter.post('/reset-password', resetPassword)
userRouter.post('/admin', adminLogin)
userRouter.get('/customers', adminAuth, getAllCustomers)
userRouter.get('/customer/:id', adminAuth, getCustomerDetail)
userRouter.put('/customer/:id/block', adminAuth, setCustomerBlock)
userRouter.put('/customer/:id/cod', adminAuth, setCustomerCod)
userRouter.delete('/customer/:id', adminAuth, deleteCustomer)
userRouter.get('/profile', authUser, getUserProfile)
userRouter.put('/profile', authUser, updateUserProfile)
userRouter.post('/address', authUser, addAddress)
userRouter.delete('/address/:id', authUser, deleteAddress)

export default userRouter;
