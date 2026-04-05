import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import categoryRouter from './routes/categoryRoute.js'
import couponRouter from './routes/couponRoute.js'
import reviewRouter from './routes/reviewRoute.js'
import wishlistRouter from './routes/wishlistRoute.js'
import bannerRouter from './routes/bannerRoute.js'
import returnRouter from './routes/returnRoute.js'

// App Config
const app = express()
const port = process.env.PORT || 4000
connectDB()
connectCloudinary()

// CORS configuration - MUST be first
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:3000',
            'https://locoxo-admin.vercel.app',
            'https://locoxo-customer.vercel.app',
            process.env.FRONTEND_URL,
            process.env.ADMIN_URL
        ].filter(Boolean); // Remove undefined values
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app') || origin.includes('netlify.app') || origin.includes('render.com')) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all origins in development
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions))

// middlewares - MUST be after CORS
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Request logging middleware - BEFORE routes
app.use((req, res, next) => {
    if (req.path.includes('/api/order') && req.method === 'POST') {
        console.log('\n========== INCOMING ORDER REQUEST ==========')
        console.log('Path:', req.path)
        console.log('Method:', req.method)
        console.log('Content-Type:', req.headers['content-type'])
        console.log('Body BEFORE auth middleware:', JSON.stringify(req.body, null, 2))
        console.log('Body keys:', Object.keys(req.body || {}))
        console.log('==========================================\n')
    }
    next()
})

// Request logging middleware
app.use((req, res, next) => {
    if (req.path.includes('/api/order')) {
        console.log('\n=== ORDER REQUEST ===' )
        console.log('Path:', req.path)
        console.log('Method:', req.method)
        console.log('Headers:', req.headers)
        console.log('Body:', JSON.stringify(req.body, null, 2))
        console.log('===================\n')
    }
    next()
})

// api endpoints
app.use('/api/user',userRouter)
app.use('/api/product',productRouter)
app.use('/api/cart',cartRouter)
app.use('/api/order',orderRouter)
app.use('/api/category',categoryRouter)
app.use('/api/coupon',couponRouter)
app.use('/api/review',reviewRouter)
app.use('/api/wishlist',wishlistRouter)
app.use('/api/banner',bannerRouter)
app.use('/api/return',returnRouter)

app.get('/',(req,res)=>{
    res.send("API Working")
})

app.listen(port, ()=> console.log('Server started on PORT : '+ port))