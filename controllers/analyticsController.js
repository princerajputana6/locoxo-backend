import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";
import ticketModel from "../models/ticketModel.js";
import returnModel from "../models/returnModel.js";

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

// GET /api/analytics/dashboard — everything for the admin Dashboard (image 15).
const getDashboard = async (req, res) => {
    try {
        const orders = await orderModel.find({}, 'status paymentMethod amount date items userId').lean();
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const isCOD = (o) => (o.paymentMethod || '').toUpperCase() === 'COD';
        const dispatched = ['Pickuped', 'Shipped', 'Out for delivery', 'Out for Delivery', 'Delivered'];

        const totalSales = orders.filter((o) => o.status !== 'Cancelled').reduce((a, o) => a + (o.amount || 0), 0);
        const todayRevenue = orders.filter((o) => o.date >= startOfToday.getTime() && o.status !== 'Cancelled').reduce((a, o) => a + (o.amount || 0), 0);

        const [products, users, tickets, returns] = await Promise.all([
            productModel.find({}, 'name viewCount variants lowStockThreshold').lean(),
            userModel.find({ role: { $ne: 'admin' } }, 'name email createdAt').sort({ createdAt: -1 }).lean(),
            ticketModel.find({}, 'createdAt').lean(),
            returnModel.find({}, 'type status').lean(),
        ]);

        const stockAlerts = products.filter((p) => {
            const t = p.lowStockThreshold ?? 5; const stock = (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
            return stock <= t;
        }).length;

        // Which product viewed / best selling.
        const productViews = [...products].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 5).map((p) => ({ name: p.name, views: p.viewCount || 0 }));
        const soldAgg = await orderModel.aggregate([
            { $match: { status: { $nin: ['Cancelled'] } } }, { $unwind: '$items' },
            { $group: { _id: '$items.name', sold: { $sum: '$items.quantity' } } }, { $sort: { sold: -1 } }, { $limit: 5 },
        ]);
        const bestSellers = soldAgg.map((s) => ({ name: s._id, sold: s.sold }));

        // Tickets today + complaint breakdown.
        const dailyTickets = tickets.filter((t) => new Date(t.createdAt) >= startOfToday).length;
        const complaints = {
            resolved: returns.filter((r) => r.status === 'refund_transferred' || r.status === 'completed').length,
            inProgress: returns.filter((r) => ['pickup_requested', 'approved', 'refund_pending'].includes(r.status)).length,
            pending: returns.filter((r) => ['requested', 'pending'].includes(r.status)).length,
        };
        complaints.total = complaints.resolved + complaints.inProgress + complaints.pending;

        res.json({
            success: true,
            cards: {
                recentOrders: orders.length,
                codOrders: orders.filter(isCOD).length,
                pickupOrders: orders.filter((o) => o.status === 'Pickuped').length,
                pendingOrders: orders.filter((o) => o.status === 'Pending').length,
                dispatchedOrders: orders.filter((o) => dispatched.includes(o.status)).length,
                rtoExchangeReturn: returns.length,
                stockAlerts,
                ordersToday: orders.filter((o) => o.date >= startOfToday.getTime()).length,
                totalSales, todayRevenue,
            },
            recentCustomers: users.slice(0, 5).map((u) => ({ name: u.name, email: u.email, at: u.createdAt })),
            totalCustomers: users.length,
            totalProducts: products.length,
            cancelledRequests: orders.filter((o) => o.status === 'Cancelled').length,
            productViews, bestSellers, dailyTickets, complaints,
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { getOverview, getDashboard };
