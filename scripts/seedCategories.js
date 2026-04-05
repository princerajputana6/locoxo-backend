import mongoose from 'mongoose';
import dotenv from 'dotenv';
import categoryModel from '../models/categoryModel.js';

dotenv.config();

const categories = [
    {
        name: 'Men',
        slug: 'men',
        description: 'Men\'s clothing and accessories',
        status: 'active',
        displayOrder: 1
    },
    {
        name: 'Women',
        slug: 'women',
        description: 'Women\'s clothing and accessories',
        status: 'active',
        displayOrder: 2
    },
    {
        name: 'Kids',
        slug: 'kids',
        description: 'Kids clothing and accessories',
        status: 'active',
        displayOrder: 3
    },
    {
        name: 'Anime',
        slug: 'anime',
        description: 'Anime themed merchandise',
        status: 'active',
        displayOrder: 4
    },
    {
        name: 'Super Hero',
        slug: 'super-hero',
        description: 'Super Hero themed merchandise',
        status: 'active',
        displayOrder: 5
    }
];

const seedCategories = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        await categoryModel.deleteMany({});
        console.log('Cleared existing categories');
        
        await categoryModel.insertMany(categories);
        console.log('Categories seeded successfully!');
        console.log(`Added ${categories.length} categories`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error seeding categories:', error);
        process.exit(1);
    }
};

seedCategories();
