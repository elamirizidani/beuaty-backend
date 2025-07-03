const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const getSalesAnalytics = async () => {
  try {
    // 1. Total Revenue
    const revenueData = await User.aggregate([
      { $unwind: "$purchaseHistory" },
      {
        $lookup: {
          from: "products",
          localField: "purchaseHistory.productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $multiply: ["$purchaseHistory.quantity", "$product.price"] } },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    // 2. Sales Trend (Last 30 Days)
    const salesTrend = await User.aggregate([
      { $unwind: "$purchaseHistory" },
      {
        $match: {
          "purchaseHistory.date": { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$purchaseHistory.date" } },
          dailySales: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 3. Top Selling Products
    const topProducts = await User.aggregate([
      { $unwind: "$purchaseHistory" },
      {
        $lookup: {
          from: "products",
          localField: "purchaseHistory.productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.name",
          totalSold: { $sum: "$purchaseHistory.quantity" },
          revenue: { $sum: { $multiply: ["$purchaseHistory.quantity", "$product.price"] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 }
    ]);

    return {
      totalRevenue: revenueData[0]?.totalRevenue || 0,
      totalOrders: revenueData[0]?.totalOrders || 0,
      salesTrend,
      topProducts
    };
  } catch (error) {
    console.error("Error in sales analytics:", error);
    throw error;
  }
};


const getCustomerAnalytics = async () => {
  try {
    // 1. New Users (Last 30 Days)
    const newUsers = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 2. User Preferences (Hair/Skin Type)
    const userPreferences = await User.aggregate([
      {
        $group: {
          _id: null,
          hairTypes: { $addToSet: "$preferences.hairType" },
          skinTypes: { $addToSet: "$preferences.skinType" }
        }
      }
    ]);

    // 3. Most Active Users (Most Purchases)
    const activeUsers = await User.aggregate([
      {
        $addFields: {
          purchaseCount: { $size: "$purchaseHistory" }
        }
      },
      { $sort: { purchaseCount: -1 } },
      { $limit: 5 },
      { $project: { name: 1, email: 1, purchaseCount: 1, _id: 0 } }
    ]);

    return {
      newUsers,
      userPreferences: userPreferences[0] || { hairTypes: [], skinTypes: [] },
      activeUsers
    };
  } catch (error) {
    console.error("Error in customer analytics:", error);
    throw error;
  }
};



const getProductSuggestions = async () => {
  try {
    // 1. Get ALL user preferences (not just hardcoded ones)
    const userPreferences = await User.aggregate([
      { $match: { "preferences.hairType": { $exists: true } } },
      { $group: { _id: "$preferences.hairType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 2. Get ALL product attributes
    const productAttributes = await Product.aggregate([
      { $unwind: "$attributes.hairType" },
      { $group: { _id: "$attributes.hairType", count: { $sum: 1 } } }
    ]);

    // 3. Find mismatches (demand with no supply)
    const suggestions = [];
    
    userPreferences.forEach(pref => {
      const hasMatchingProduct = productAttributes.some(
        attr => attr._id === pref._id
      );
      
      if (!hasMatchingProduct && pref._id) {
        suggestions.push({
          category: "Hair Care",
          suggestion: `Add products for "${pref._id}" hair (${pref.count} users need this)`,
          demandScore: pref.count // Quantify demand
        });
      }
    });

    return suggestions;
  } catch (error) {
    console.error("Error in AI suggestions:", error);
    throw error;
  }
};



router.get('/analytics', async (req, res) => {
  try {
    const sales = await getSalesAnalytics();
    const customers = await getCustomerAnalytics();
    const productSuggestions = await getProductSuggestions();

    res.json({ sales, customers, productSuggestions });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const orders = await User.aggregate([
      { $unwind: "$purchaseHistory" },
      {
        $lookup: {
          from: "products",
          localField: "purchaseHistory.productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          orderId: "$purchaseHistory._id",
          userId: "$_id",
          userName: "$name",
          userEmail: "$email",
          productId: "$product._id",
          productName: "$product.name",
          productPrice: "$product.price",
          quantity: "$purchaseHistory.quantity",
          total: { $multiply: ["$product.price", "$purchaseHistory.quantity"] },
          date: "$purchaseHistory.date"
        }
      },
      { $sort: { date: -1 } }
    ]);

    res.json(orders);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;