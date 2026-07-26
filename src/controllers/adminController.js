import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';

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
