import mongoose from 'mongoose';
import dotenv from 'dotenv';
import productModel from '../models/productModel.js';

dotenv.config();

const clearProducts = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const result = await productModel.deleteMany({});
        console.log(`Deleted ${result.deletedCount} products from the database`);
        
        console.log('Products collection cleared successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing products:', error);
        process.exit(1);
    }
};

clearProducts();
