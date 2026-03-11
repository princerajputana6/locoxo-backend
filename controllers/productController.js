import { v2 as cloudinary } from "cloudinary"
import productModel from "../models/productModel.js"
import userModel from "../models/userModel.js"

// function for add product
const addProduct = async (req, res) => {
    try {

        const { name, description, price, discountPrice, category, subCategory, sizes, variants, bestseller, featured, brand, material, careInstructions, tags, status } = req.body

        const image1 = req.files.image1 && req.files.image1[0]
        const image2 = req.files.image2 && req.files.image2[0]
        const image3 = req.files.image3 && req.files.image3[0]
        const image4 = req.files.image4 && req.files.image4[0]

        const images = [image1, image2, image3, image4].filter((item) => item !== undefined)

        let imagesUrl = await Promise.all(
            images.map(async (item) => {
                let result = await cloudinary.uploader.upload(item.path, { resource_type: 'image' });
                return result.secure_url
            })
        )

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            discountPrice: discountPrice ? Number(discountPrice) : undefined,
            subCategory,
            sizes: sizes ? JSON.parse(sizes) : [],
            bestseller: bestseller === "true" ? true : false,
            featured: featured === "true" ? true : false,
            variants: variants ? JSON.parse(variants) : [],
            brand,
            material,
            careInstructions,
            tags: tags ? JSON.parse(tags) : [],
            status: status || 'active',
            image: imagesUrl,
            date: Date.now()
        }

        console.log(productData);

        const product = new productModel(productData);
        await product.save()

        res.json({ success: true, message: "Product Added" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for list product with filters
const listProducts = async (req, res) => {
    try {
        const { category, subCategory, minPrice, maxPrice, search, bestseller, featured, status, page = 1, limit = 20, sortBy = 'date' } = req.query;
        
        const filter = {};
        
        if (category) filter.category = category;
        if (subCategory) filter.subCategory = subCategory;
        if (bestseller) filter.bestseller = bestseller === 'true';
        if (featured) filter.featured = featured === 'true';
        if (status) filter.status = status;
        
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }
        
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }
        
        const sortOptions = {};
        if (sortBy === 'price_asc') sortOptions.price = 1;
        else if (sortBy === 'price_desc') sortOptions.price = -1;
        else if (sortBy === 'rating') sortOptions.rating = -1;
        else if (sortBy === 'popular') sortOptions.viewCount = -1;
        else sortOptions.date = -1;
        
        const skip = (page - 1) * limit;
        
        const products = await productModel.find(filter)
            .populate('category', 'name slug')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));
            
        const total = await productModel.countDocuments(filter);
        
        res.json({
            success: true,
            products,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        
        await productModel.findByIdAndDelete(req.body.id)
        res.json({success:true,message:"Product Removed"})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        const { productId } = req.body;
        const { userId } = req.query;
        
        const product = await productModel.findById(productId).populate('category', 'name slug');
        
        if (!product) {
            return res.json({ success: false, message: 'Product not found' });
        }
        
        await productModel.findByIdAndUpdate(productId, { $inc: { viewCount: 1 } });
        
        if (userId) {
            await userModel.findByIdAndUpdate(
                userId,
                { 
                    $addToSet: { recentlyViewed: productId },
                    $push: { 
                        recentlyViewed: { 
                            $each: [productId], 
                            $slice: -20 
                        } 
                    }
                }
            );
        }
        
        res.json({ success: true, product });

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const getRelatedProducts = async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 8 } = req.query;
        
        const product = await productModel.findById(productId);
        
        if (!product) {
            return res.json({ success: false, message: 'Product not found' });
        }
        
        const relatedProducts = await productModel.find({
            _id: { $ne: productId },
            $or: [
                { category: product.category },
                { subCategory: product.subCategory },
                { tags: { $in: product.tags } }
            ],
            status: 'active'
        })
        .limit(parseInt(limit))
        .select('name price discountPrice image rating reviewCount');
        
        res.json({ success: true, products: relatedProducts });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getRecentlyViewed = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await userModel.findById(userId).populate({
            path: 'recentlyViewed',
            select: 'name price discountPrice image rating reviewCount'
        });
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, products: user.recentlyViewed.reverse() });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        const product = await productModel.findByIdAndUpdate(id, updateData, { new: true });
        
        if (!product) {
            return res.json({ success: false, message: 'Product not found' });
        }
        
        res.json({ success: true, message: 'Product updated successfully', product });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listProducts, addProduct, removeProduct, singleProduct, getRelatedProducts, getRecentlyViewed, updateProduct }