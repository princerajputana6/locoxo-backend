import express from 'express'
import { loginUser, registerUser, adminLogin, getAllCustomers, getUserProfile, updateUserProfile, googleAuth, addAddress, deleteAddress, sendLoginOtp, verifyLoginOtp, forgotPassword, resetPassword } from '../controllers/userController.js'
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
userRouter.get('/profile', authUser, getUserProfile)
userRouter.put('/profile', authUser, updateUserProfile)
userRouter.post('/address', authUser, addAddress)
userRouter.delete('/address/:id', authUser, deleteAddress)

export default userRouter;
