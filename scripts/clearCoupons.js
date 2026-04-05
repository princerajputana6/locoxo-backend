import mongoose from 'mongoose';
import dotenv from 'dotenv';
import couponModel from '../models/couponModel.js';

dotenv.config();

const clearCoupons = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const result = await couponModel.deleteMany({});
        console.log(`Deleted ${result.deletedCount} coupons from the database`);
        
        console.log('Coupons collection cleared successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing coupons:', error);
        process.exit(1);
    }
};

clearCoupons();
