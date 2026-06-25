import productModel from "../models/productModel.js";
import userModel from "../models/userModel.js";
import orderModel from "../models/orderModel.js";
import * as ai from "../services/aiService.js";

// Build a compact catalog representation for the model.
const buildCatalog = (products) =>
    products.map(p => ({
        id: p._id.toString(),
        name: p.name,
        category: p.category,
        price: p.price,
        bestseller: !!p.bestseller
    }));

const stockOf = (p) =>
    Array.isArray(p.variants) ? p.variants.reduce((s, v) => s + (v.stock || 0), 0) : 0;

// ---- Personalised recommendations (customer) ----
const recommendations = async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await userModel.findById(userId)
            .populate('recentlyViewed', 'name category')
            .populate('wishlist', 'name category')
            .lean();

        const orders = await orderModel.find({ userId }).select('items').lean();
        const purchasedCategories = [...new Set(orders.flatMap(o => (o.items || []).map(i => i.name)))].slice(0, 20);

        const products = await productModel.find({ status: 'active' }).select('name category price bestseller variants').lean();
        const catalog = buildCatalog(products);

        const profile = {
            recentlyViewed: (user?.recentlyViewed || []).map(p => p.name),
            wishlist: (user?.wishlist || []).map(p => p.name),
            purchased: purchasedCategories
        };

        let recIds = [];
        let source = 'ai';
        try {
            const result = await ai.getProductRecommendations({ profile, catalog });
            recIds = (result.recommendations || []).map(r => r.productId);
        } catch (err) {
            console.warn('[ai recommendations] falling back to heuristic:', err.message);
            source = 'heuristic';
            recIds = products.filter(p => p.bestseller).slice(0, 8).map(p => p._id.toString());
            if (recIds.length < 8) recIds = products.slice(0, 8).map(p => p._id.toString());
        }

        const full = await productModel.find({ _id: { $in: recIds } });
        // preserve order
        const ordered = recIds.map(id => full.find(p => p._id.toString() === id)).filter(Boolean);

        res.json({ success: true, source, products: ordered });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// ---- "You may also like" suggestions (public) ----
const suggestions = async (req, res) => {
    try {
        const { productId } = req.body;
        const product = await productModel.findById(productId).lean();
        if (!product) return res.json({ success: false, message: 'Product not found' });

        const products = await productModel.find({ status: 'active', _id: { $ne: productId } })
            .select('name category price bestseller variants').lean();
        const catalog = buildCatalog(products);

        let ids = [];
        let source = 'ai';
        try {
            const result = await ai.getProductSuggestions({
                product: { id: product._id.toString(), name: product.name, category: product.category, price: product.price },
                catalog
            });
            ids = (result.suggestions || []).map(s => s.productId);
        } catch (err) {
            console.warn('[ai suggestions] falling back to heuristic:', err.message);
            source = 'heuristic';
            ids = products.filter(p => p.category === product.category).slice(0, 6).map(p => p._id.toString());
        }

        const full = await productModel.find({ _id: { $in: ids } });
        const ordered = ids.map(id => full.find(p => p._id.toString() === id)).filter(Boolean);

        res.json({ success: true, source, products: ordered.slice(0, 6) });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// ---- Stock / demand prediction (admin) ----
const stockPrediction = async (req, res) => {
    try {
        const products = await productModel.find({ status: { $ne: 'inactive' } })
            .select('name variants lowStockThreshold').lean();

        // Sales velocity from orders
        const now = Date.now();
        const d30 = now - 30 * 24 * 60 * 60 * 1000;
        const d7 = now - 7 * 24 * 60 * 60 * 1000;
        const orders = await orderModel.find({ status: { $ne: 'Cancelled' }, date: { $gte: d30 } })
            .select('items date').lean();

        const sold30 = {}, sold7 = {};
        orders.forEach(o => {
            (o.items || []).forEach(it => {
                const id = it.productId?.toString();
                if (!id) return;
                sold30[id] = (sold30[id] || 0) + (it.quantity || 0);
                if ((o.date || 0) >= d7) sold7[id] = (sold7[id] || 0) + (it.quantity || 0);
            });
        });

        const metrics = products.map(p => {
            const id = p._id.toString();
            return {
                productId: id,
                name: p.name,
                currentStock: stockOf(p),
                unitsSoldLast30d: sold30[id] || 0,
                unitsSoldLast7d: sold7[id] || 0
            };
        });

        let predictions = [];
        let source = 'ai';
        try {
            const result = await ai.predictStockNeeds({ products: metrics });
            predictions = result.predictions || [];
        } catch (err) {
            console.warn('[ai stockPrediction] falling back to heuristic:', err.message);
            source = 'heuristic';
            predictions = metrics.map(m => {
                const dailyRate = m.unitsSoldLast30d / 30 || m.unitsSoldLast7d / 7 || 0;
                const days = dailyRate > 0 ? Math.round(m.currentStock / dailyRate) : 999;
                const riskLevel = days <= 7 ? 'high' : days <= 21 ? 'medium' : 'low';
                return {
                    productId: m.productId,
                    name: m.name,
                    riskLevel,
                    daysUntilStockout: days === 999 ? null : days,
                    recommendedReorderQty: Math.max(0, Math.ceil(dailyRate * 30) - m.currentStock),
                    insight: dailyRate > 0
                        ? `Selling ~${dailyRate.toFixed(1)}/day`
                        : 'No recent sales'
                };
            }).sort((a, b) => (a.daysUntilStockout ?? 9999) - (b.daysUntilStockout ?? 9999));
        }

        res.json({ success: true, source, predictions });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { recommendations, suggestions, stockPrediction };
