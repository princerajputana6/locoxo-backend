import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";

const monthKey = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

// Comprehensive marketing/analytics overview for the admin panel.
const getOverview = async (req, res) => {
    try {
        const [orders, users, productCount] = await Promise.all([
            orderModel.find({}).lean(),
            userModel.find({}).select('createdAt subscription referredBy status').lean(),
            productModel.countDocuments({})
        ]);

        const validOrders = orders.filter(o => o.status !== 'Cancelled');
        const totalRevenue = validOrders.reduce((s, o) => s + (o.amount || 0), 0);
        const totalOrders = validOrders.length;
        const aov = totalOrders ? totalRevenue / totalOrders : 0;

        // Revenue & orders by month (last 12 months)
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(monthKey(d));
        }
        const revByMonth = Object.fromEntries(months.map(m => [m, 0]));
        const ordByMonth = Object.fromEntries(months.map(m => [m, 0]));
        validOrders.forEach(o => {
            const key = monthKey(o.date || o.createdAt);
            if (key in revByMonth) { revByMonth[key] += o.amount || 0; ordByMonth[key] += 1; }
        });
        const monthlySeries = months.map(m => ({ month: m, revenue: revByMonth[m], orders: ordByMonth[m] }));

        // New customers by month
        const newCustByMonth = Object.fromEntries(months.map(m => [m, 0]));
        users.forEach(u => {
            const key = monthKey(u.createdAt);
            if (key in newCustByMonth) newCustByMonth[key] += 1;
        });
        const customerGrowth = months.map(m => ({ month: m, customers: newCustByMonth[m] }));

        // Payment method split
        const paymentSplit = {};
        validOrders.forEach(o => {
            const m = o.paymentMethod || 'Unknown';
            paymentSplit[m] = (paymentSplit[m] || 0) + 1;
        });

        // Order status funnel
        const statusBreakdown = {};
        orders.forEach(o => { statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1; });

        // Top products by revenue
        const productAgg = {};
        validOrders.forEach(o => {
            (o.items || []).forEach(it => {
                const id = it.productId?.toString() || it.name;
                if (!productAgg[id]) productAgg[id] = { productId: id, name: it.name, units: 0, revenue: 0 };
                productAgg[id].units += it.quantity || 0;
                productAgg[id].revenue += (it.price || 0) * (it.quantity || 0);
            });
        });
        const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

        // Customer segmentation
        const ordersByUser = {};
        validOrders.forEach(o => {
            const id = o.userId?.toString();
            if (!id) return;
            if (!ordersByUser[id]) ordersByUser[id] = { count: 0, spend: 0 };
            ordersByUser[id].count += 1;
            ordersByUser[id].spend += o.amount || 0;
        });
        const buyers = Object.values(ordersByUser);
        const repeatCustomers = buyers.filter(b => b.count > 1).length;
        const repeatRate = buyers.length ? (repeatCustomers / buyers.length) * 100 : 0;
        const conversionRate = users.length ? (buyers.length / users.length) * 100 : 0;

        // Membership + referral
        const activeSubscribers = users.filter(u => u.subscription?.status === 'active').length;
        const referredCount = users.filter(u => u.referredBy).length;

        res.json({
            success: true,
            analytics: {
                kpis: {
                    totalRevenue: Math.round(totalRevenue),
                    totalOrders,
                    aov: Math.round(aov),
                    totalCustomers: users.length,
                    products: productCount,
                    repeatRate: Math.round(repeatRate * 10) / 10,
                    conversionRate: Math.round(conversionRate * 10) / 10,
                    activeSubscribers,
                    referredCount
                },
                monthlySeries,
                customerGrowth,
                paymentSplit,
                statusBreakdown,
                topProducts,
                segments: {
                    oneTime: buyers.filter(b => b.count === 1).length,
                    repeat: repeatCustomers,
                    highValue: buyers.filter(b => b.spend >= 5000).length,
                    neverPurchased: users.length - buyers.length
                }
            }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { getOverview };
