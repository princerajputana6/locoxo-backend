import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import userModel from '../models/userModel.js';
import categoryModel from '../models/categoryModel.js';
import productModel from '../models/productModel.js';
import couponModel from '../models/couponModel.js';
import bannerModel from '../models/bannerModel.js';

dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}locoxo`);
        console.log("✅ Database Connected");
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        process.exit(1);
    }
};

const seedAdmin = async () => {
    try {
        const existingAdmin = await userModel.findOne({ email: 'admin@locoxo.com' });
        
        if (existingAdmin) {
            console.log('⚠️  Admin already exists');
            return;
        }

        const hashedPassword = await bcrypt.hash('Admin@123', 10);
        
        const admin = new userModel({
            name: 'Locoxo Admin',
            email: 'admin@locoxo.com',
            password: hashedPassword,
            phone: '+91-9876543210',
            role: 'admin',
            status: 'active'
        });

        await admin.save();
        console.log('✅ Admin user created successfully');
        console.log('📧 Email: admin@locoxo.com');
        console.log('🔑 Password: Admin@123');
    } catch (error) {
        console.error('❌ Error creating admin:', error);
    }
};

const seedCategories = async () => {
    try {
        const existingCategories = await categoryModel.find();
        
        if (existingCategories.length > 0) {
            console.log('⚠️  Categories already exist');
            return existingCategories;
        }

        const categories = [
            {
                name: 'Men',
                slug: 'men',
                description: 'Fashion for Men',
                status: 'active',
                displayOrder: 1
            },
            {
                name: 'Women',
                slug: 'women',
                description: 'Fashion for Women',
                status: 'active',
                displayOrder: 2
            },
            {
                name: 'Kids',
                slug: 'kids',
                description: 'Fashion for Kids',
                status: 'active',
                displayOrder: 3
            },
            {
                name: 'Accessories',
                slug: 'accessories',
                description: 'Fashion Accessories',
                status: 'active',
                displayOrder: 4
            }
        ];

        const createdCategories = await categoryModel.insertMany(categories);
        console.log('✅ Categories created successfully');
        return createdCategories;
    } catch (error) {
        console.error('❌ Error creating categories:', error);
        return [];
    }
};

const seedProducts = async (categories) => {
    try {
        const existingProducts = await productModel.find();
        
        if (existingProducts.length > 0) {
            console.log('⚠️  Products already exist');
            return;
        }

        const menCategory = categories.find(c => c.slug === 'men');
        const womenCategory = categories.find(c => c.slug === 'women');
        const kidsCategory = categories.find(c => c.slug === 'kids');

        const products = [
            {
                name: 'Classic Cotton T-Shirt',
                description: 'Premium quality cotton t-shirt with comfortable fit. Perfect for casual wear.',
                price: 799,
                discountPrice: 599,
                image: ['https://via.placeholder.com/500x600/4A90E2/FFFFFF?text=Cotton+T-Shirt'],
                category: menCategory._id,
                subCategory: 'Topwear',
                variants: [
                    { size: 'S', color: 'Black', colorCode: '#000000', stock: 50, sku: 'MTS-BLK-S' },
                    { size: 'M', color: 'Black', colorCode: '#000000', stock: 75, sku: 'MTS-BLK-M' },
                    { size: 'L', color: 'Black', colorCode: '#000000', stock: 60, sku: 'MTS-BLK-L' },
                    { size: 'S', color: 'White', colorCode: '#FFFFFF', stock: 45, sku: 'MTS-WHT-S' },
                    { size: 'M', color: 'White', colorCode: '#FFFFFF', stock: 80, sku: 'MTS-WHT-M' },
                    { size: 'L', color: 'White', colorCode: '#FFFFFF', stock: 55, sku: 'MTS-WHT-L' }
                ],
                bestseller: true,
                featured: true,
                brand: 'Locoxo',
                material: '100% Cotton',
                careInstructions: 'Machine wash cold, tumble dry low',
                rating: 4.5,
                reviewCount: 128,
                tags: ['casual', 'cotton', 'comfortable'],
                status: 'active',
                date: Date.now()
            },
            {
                name: 'Slim Fit Denim Jeans',
                description: 'Stylish slim fit denim jeans with stretch fabric for ultimate comfort.',
                price: 1999,
                discountPrice: 1499,
                image: ['https://via.placeholder.com/500x600/2C3E50/FFFFFF?text=Denim+Jeans'],
                category: menCategory._id,
                subCategory: 'Bottomwear',
                variants: [
                    { size: '30', color: 'Blue', colorCode: '#1E3A8A', stock: 40, sku: 'MJN-BLU-30' },
                    { size: '32', color: 'Blue', colorCode: '#1E3A8A', stock: 65, sku: 'MJN-BLU-32' },
                    { size: '34', color: 'Blue', colorCode: '#1E3A8A', stock: 50, sku: 'MJN-BLU-34' },
                    { size: '30', color: 'Black', colorCode: '#000000', stock: 35, sku: 'MJN-BLK-30' },
                    { size: '32', color: 'Black', colorCode: '#000000', stock: 60, sku: 'MJN-BLK-32' },
                    { size: '34', color: 'Black', colorCode: '#000000', stock: 45, sku: 'MJN-BLK-34' }
                ],
                bestseller: true,
                brand: 'Locoxo',
                material: '98% Cotton, 2% Elastane',
                careInstructions: 'Machine wash cold, do not bleach',
                rating: 4.3,
                reviewCount: 95,
                tags: ['denim', 'jeans', 'slim-fit'],
                status: 'active',
                date: Date.now()
            },
            {
                name: 'Floral Print Summer Dress',
                description: 'Beautiful floral print dress perfect for summer occasions. Lightweight and breathable.',
                price: 2499,
                discountPrice: 1899,
                image: ['https://via.placeholder.com/500x600/E91E63/FFFFFF?text=Summer+Dress'],
                category: womenCategory._id,
                subCategory: 'Dresses',
                variants: [
                    { size: 'XS', color: 'Pink', colorCode: '#EC4899', stock: 30, sku: 'WDR-PNK-XS' },
                    { size: 'S', color: 'Pink', colorCode: '#EC4899', stock: 55, sku: 'WDR-PNK-S' },
                    { size: 'M', color: 'Pink', colorCode: '#EC4899', stock: 60, sku: 'WDR-PNK-M' },
                    { size: 'L', color: 'Pink', colorCode: '#EC4899', stock: 40, sku: 'WDR-PNK-L' },
                    { size: 'S', color: 'Blue', colorCode: '#3B82F6', stock: 45, sku: 'WDR-BLU-S' },
                    { size: 'M', color: 'Blue', colorCode: '#3B82F6', stock: 50, sku: 'WDR-BLU-M' }
                ],
                bestseller: true,
                featured: true,
                brand: 'Locoxo',
                material: 'Polyester Blend',
                careInstructions: 'Hand wash recommended',
                rating: 4.7,
                reviewCount: 156,
                tags: ['dress', 'floral', 'summer'],
                status: 'active',
                date: Date.now()
            },
            {
                name: 'Casual Kurti',
                description: 'Elegant casual kurti with modern design. Perfect for everyday wear.',
                price: 1299,
                discountPrice: 999,
                image: ['https://via.placeholder.com/500x600/9C27B0/FFFFFF?text=Kurti'],
                category: womenCategory._id,
                subCategory: 'Ethnic',
                variants: [
                    { size: 'S', color: 'Purple', colorCode: '#9333EA', stock: 40, sku: 'WKT-PUR-S' },
                    { size: 'M', color: 'Purple', colorCode: '#9333EA', stock: 65, sku: 'WKT-PUR-M' },
                    { size: 'L', color: 'Purple', colorCode: '#9333EA', stock: 50, sku: 'WKT-PUR-L' },
                    { size: 'XL', color: 'Purple', colorCode: '#9333EA', stock: 35, sku: 'WKT-PUR-XL' }
                ],
                brand: 'Locoxo',
                material: 'Cotton',
                careInstructions: 'Machine wash cold',
                rating: 4.4,
                reviewCount: 87,
                tags: ['kurti', 'ethnic', 'casual'],
                status: 'active',
                date: Date.now()
            },
            {
                name: 'Kids Cartoon T-Shirt',
                description: 'Fun cartoon printed t-shirt for kids. Soft and comfortable fabric.',
                price: 599,
                discountPrice: 449,
                image: ['https://via.placeholder.com/500x600/FF9800/FFFFFF?text=Kids+T-Shirt'],
                category: kidsCategory._id,
                subCategory: 'Topwear',
                variants: [
                    { size: '2-3Y', color: 'Red', colorCode: '#EF4444', stock: 50, sku: 'KTS-RED-2-3' },
                    { size: '4-5Y', color: 'Red', colorCode: '#EF4444', stock: 60, sku: 'KTS-RED-4-5' },
                    { size: '6-7Y', color: 'Red', colorCode: '#EF4444', stock: 45, sku: 'KTS-RED-6-7' },
                    { size: '2-3Y', color: 'Yellow', colorCode: '#FBBF24', stock: 40, sku: 'KTS-YEL-2-3' },
                    { size: '4-5Y', color: 'Yellow', colorCode: '#FBBF24', stock: 55, sku: 'KTS-YEL-4-5' }
                ],
                featured: true,
                brand: 'Locoxo Kids',
                material: '100% Cotton',
                careInstructions: 'Machine wash cold',
                rating: 4.6,
                reviewCount: 72,
                tags: ['kids', 'cartoon', 't-shirt'],
                status: 'active',
                date: Date.now()
            },
            {
                name: 'Formal Shirt',
                description: 'Premium formal shirt for professional look. Wrinkle-free fabric.',
                price: 1499,
                discountPrice: 1199,
                image: ['https://via.placeholder.com/500x600/607D8B/FFFFFF?text=Formal+Shirt'],
                category: menCategory._id,
                subCategory: 'Topwear',
                variants: [
                    { size: 'M', color: 'White', colorCode: '#FFFFFF', stock: 70, sku: 'MFS-WHT-M' },
                    { size: 'L', color: 'White', colorCode: '#FFFFFF', stock: 65, sku: 'MFS-WHT-L' },
                    { size: 'XL', color: 'White', colorCode: '#FFFFFF', stock: 50, sku: 'MFS-WHT-XL' },
                    { size: 'M', color: 'Blue', colorCode: '#3B82F6', stock: 60, sku: 'MFS-BLU-M' },
                    { size: 'L', color: 'Blue', colorCode: '#3B82F6', stock: 55, sku: 'MFS-BLU-L' }
                ],
                bestseller: true,
                brand: 'Locoxo',
                material: 'Cotton Blend',
                careInstructions: 'Machine wash, iron on medium heat',
                rating: 4.5,
                reviewCount: 103,
                tags: ['formal', 'shirt', 'office-wear'],
                status: 'active',
                date: Date.now()
            }
        ];

        await productModel.insertMany(products);
        console.log('✅ Sample products created successfully');
    } catch (error) {
        console.error('❌ Error creating products:', error);
    }
};

const seedCoupons = async () => {
    try {
        const existingCoupons = await couponModel.find();
        
        if (existingCoupons.length > 0) {
            console.log('⚠️  Coupons already exist');
            return;
        }

        const coupons = [
            {
                code: 'WELCOME10',
                description: 'Welcome offer - 10% off on first order',
                discountType: 'percentage',
                discountValue: 10,
                minPurchaseAmount: 999,
                maxDiscountAmount: 500,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                usageLimit: 1000,
                perUserLimit: 1,
                status: 'active',
                isFirstOrderOnly: true
            },
            {
                code: 'FLAT200',
                description: 'Flat ₹200 off on orders above ₹1999',
                discountType: 'fixed',
                discountValue: 200,
                minPurchaseAmount: 1999,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                usageLimit: 500,
                perUserLimit: 3,
                status: 'active'
            },
            {
                code: 'FASHION25',
                description: '25% off on fashion items',
                discountType: 'percentage',
                discountValue: 25,
                minPurchaseAmount: 1499,
                maxDiscountAmount: 1000,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                usageLimit: 200,
                perUserLimit: 2,
                status: 'active'
            }
        ];

        await couponModel.insertMany(coupons);
        console.log('✅ Coupons created successfully');
    } catch (error) {
        console.error('❌ Error creating coupons:', error);
    }
};

const seedBanners = async () => {
    try {
        const existingBanners = await bannerModel.find();
        
        if (existingBanners.length > 0) {
            console.log('⚠️  Banners already exist');
            return;
        }

        const banners = [
            {
                title: 'New Collection 2026',
                subtitle: 'Discover the latest fashion trends',
                image: 'https://via.placeholder.com/1920x600/E91E63/FFFFFF?text=New+Collection+2026',
                mobileImage: 'https://via.placeholder.com/768x400/E91E63/FFFFFF?text=New+Collection',
                linkType: 'none',
                position: 'hero',
                displayOrder: 1,
                status: 'active'
            },
            {
                title: 'Summer Sale',
                subtitle: 'Up to 50% off on selected items',
                image: 'https://via.placeholder.com/1920x600/FF9800/FFFFFF?text=Summer+Sale',
                mobileImage: 'https://via.placeholder.com/768x400/FF9800/FFFFFF?text=Summer+Sale',
                linkType: 'none',
                position: 'hero',
                displayOrder: 2,
                status: 'active'
            }
        ];

        await bannerModel.insertMany(banners);
        console.log('✅ Banners created successfully');
    } catch (error) {
        console.error('❌ Error creating banners:', error);
    }
};

const seedDatabase = async () => {
    console.log('🚀 Starting database seeding...\n');
    
    await connectDB();
    
    await seedAdmin();
    const categories = await seedCategories();
    await seedProducts(categories);
    await seedCoupons();
    await seedBanners();
    
    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - Admin user created (admin@locoxo.com / Admin@123)');
    console.log('   - Categories created');
    console.log('   - Sample products added');
    console.log('   - Coupons created');
    console.log('   - Banners created');
    
    process.exit(0);
};

seedDatabase();
