import mongoose from 'mongoose';
import productModel from '../models/productModel.js';
import 'dotenv/config';

const addSizesToExistingProducts = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all products without sizes
        const products = await productModel.find({ 
            $or: [
                { sizes: { $exists: false } },
                { sizes: { $size: 0 } },
                { sizes: null }
            ]
        });

        console.log(`Found ${products.length} products without sizes`);

        // Default sizes based on category/subcategory
        const defaultSizes = {
            'Topwear': ['S', 'M', 'L', 'XL', 'XXL'],
            'Bottomwear': ['S', 'M', 'L', 'XL', 'XXL'],
            'Winterwear': ['S', 'M', 'L', 'XL', 'XXL'],
            'default': ['S', 'M', 'L', 'XL']
        };

        let updated = 0;
        for (const product of products) {
            const sizes = defaultSizes[product.subCategory] || defaultSizes['default'];
            
            await productModel.findByIdAndUpdate(product._id, {
                $set: { sizes: sizes }
            });
            
            updated++;
            console.log(`Updated product: ${product.name} with sizes: ${sizes.join(', ')}`);
        }

        console.log(`\n✅ Successfully updated ${updated} products with sizes`);
        console.log('All products now have sizes available!');
        
        await mongoose.connection.close();
        console.log('Database connection closed');
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

addSizesToExistingProducts();
