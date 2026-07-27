import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Setting } from '../models/Setting.js';

export const getDashboardStats = async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        
        // Calculate total sales from all completed or successful orders
        const salesAgg = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalSales = salesAgg.length > 0 ? salesAgg[0].total : 0;
        
        const totalProducts = await Product.countDocuments();
        
        // Fetch sales data for the chart (grouped by date)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const salesData = await Order.aggregate([
            { 
                $match: { 
                    status: { $ne: 'Cancelled' },
                    createdAt: { $gte: thirtyDaysAgo }
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    sales: { $sum: '$totalAmount' },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    date: "$_id",
                    sales: 1,
                    orders: 1,
                    _id: 0
                }
            }
        ]);
        
        res.json({ success: true, stats: { totalOrders, totalSales, totalProducts, salesData } });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
};

export const getInsightsData = async (req, res) => {
    try {
        // Sales by payment method
        const paymentMethodSales = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            {
                $group: {
                    _id: '$paymentMethod',
                    totalSales: { $sum: '$totalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $project: {
                    name: '$_id',
                    value: '$totalSales',
                    _id: 0
                }
            }
        ]);

        // Top 5 selling products by revenue
        const topProducts = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.name',
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 5 },
            {
                $project: {
                    name: '$_id',
                    revenue: '$totalRevenue',
                    quantity: '$totalQuantity',
                    _id: 0
                }
            }
        ]);

        // Global profit and GST metrics
        const metricsAgg = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            {
                $group: {
                    _id: null,
                    // If subtotal exists, use it, else fallback to totalAmount
                    netProfit: { $sum: { $ifNull: ['$subtotal', '$totalAmount'] } },
                    // If gstAmount exists, use it, else 0
                    totalGst: { $sum: { $ifNull: ['$gstAmount', 0] } }
                }
            }
        ]);

        const netProfit = metricsAgg.length > 0 ? metricsAgg[0].netProfit : 0;
        const totalGst = metricsAgg.length > 0 ? metricsAgg[0].totalGst : 0;
        const profitWithGst = netProfit + totalGst;

        res.json({
            success: true,
            insights: {
                paymentMethodSales,
                topProducts,
                netProfit,
                totalGst,
                profitWithGst
            }
        });
    } catch (error) {
        console.error('Error fetching insights data:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch insights data' });
    }
};

export const getSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) {
            settings = await Setting.create({ gstRate: 18, shippingCost: 50 });
        }
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
};

export const updateSettings = async (req, res) => {
    try {
        const { gstRate, shippingCost } = req.body;
        
        let settings = await Setting.findOne();
        if (!settings) {
            settings = new Setting();
        }
        
        if (gstRate !== undefined) settings.gstRate = Number(gstRate);
        if (shippingCost !== undefined) settings.shippingCost = Number(shippingCost);
        
        await settings.save();
        
        res.json({ success: true, settings, message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
};
