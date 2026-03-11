import express from 'express'
import { loginUser, registerUser, adminLogin, getAllCustomers } from '../controllers/userController.js'
import adminAuth from '../middleware/adminAuth.js'

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)
userRouter.get('/customers', adminAuth, getAllCustomers)

export default userRouter;