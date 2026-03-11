import categoryModel from '../models/categoryModel.js';

const listCategories = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        
        const categories = await categoryModel.find(filter).sort({ displayOrder: 1 });
        
        res.json({ success: true, categories });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, slug, description, image, parentCategory, status, displayOrder, metaTitle, metaDescription } = req.body;

        const categoryData = {
            name,
            slug,
            description,
            image,
            parentCategory,
            status,
            displayOrder,
            metaTitle,
            metaDescription
        };

        const category = new categoryModel(categoryData);
        await category.save();

        res.json({ success: true, message: 'Category added successfully', category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const category = await categoryModel.findByIdAndUpdate(id, updateData, { new: true });

        if (!category) {
            return res.json({ success: false, message: 'Category not found' });
        }

        res.json({ success: true, message: 'Category updated successfully', category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await categoryModel.findByIdAndDelete(id);

        if (!category) {
            return res.json({ success: false, message: 'Category not found' });
        }

        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await categoryModel.findById(id);

        if (!category) {
            return res.json({ success: false, message: 'Category not found' });
        }

        res.json({ success: true, category });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { listCategories, addCategory, updateCategory, deleteCategory, getCategoryById };
