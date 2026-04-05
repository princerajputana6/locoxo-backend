import express from 'express'
import { loginUser, registerUser, adminLogin, getAllCustomers, getUserProfile, updateUserProfile } from '../controllers/userController.js'
import adminAuth from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)
userRouter.get('/customers', adminAuth, getAllCustomers)
userRouter.get('/profile', authUser, getUserProfile)
userRouter.put('/profile', authUser, updateUserProfile)

export default userRouter;