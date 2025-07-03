const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');

// User buys a product


const getClientOrders = async () => {
  try {
    const orders = await User.aggregate([
      { $unwind: "$purchaseHistory" }, // Break down the purchaseHistory array
      { 
        $lookup: { // Join with products collection
          from: "products",
          localField: "purchaseHistory.productId",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" }, // Since lookup returns an array
      { 
        $project: { // Shape the output
          userId: "$_id",
          userName: "$name",
          userEmail: "$email",
          productId: "$purchaseHistory.productId",
          productName: "$productDetails.name",
          quantity: "$purchaseHistory.quantity",
          date: "$purchaseHistory.date",
          _id: 0
        }
      },
      { $sort: { date: -1 } } // Sort by most recent
    ]);
    
    return orders;
  } catch (error) {
    console.error("Error fetching orders:", error);
    throw error;
  }
};




router.get('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).select('-password'); // exclude password
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/purchase', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { productId, quantity } = req.body;

  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({ message: 'Product ID and quantity (>=1) required' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Add purchase to user's purchaseHistory
    user.purchaseHistory.push({
      productId,
      quantity,
      date: new Date()
    });

    await user.save();

    res.json({ message: 'Purchase recorded successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});




router.post('/cart/add', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { productId, quantity = 1 } = req.body;

  if (!productId) return res.status(400).json({ message: 'Product ID required' });

  try {
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if product already in cart
    const cartItem = user.cart.find(item => item.productId.toString() === productId);

    if (cartItem) {
      // Update quantity
      cartItem.quantity += quantity;
    } else {
      // Add new item
      user.cart.push({ productId, quantity });
    }

    await user.save();
    res.json({ message: 'Product added to cart', cart: user.cart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove product from cart
router.post('/cart/remove', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { productId } = req.body;

  if (!productId) return res.status(400).json({ message: 'Product ID required' });

  try {
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    user.cart = user.cart.filter(item => item.productId.toString() !== productId);
    await user.save();
    res.json({ message: 'Product removed from cart', cart: user.cart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current cart
router.get('/cart', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const user = await User.findById(userId).populate('cart.productId');
    // console.log(user)
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ cart: user.cart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/users', async (req, res) => {
  try {
    const users = await User.aggregate([
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
          createdAt: 1,
          lastPurchase: { $max: "$purchaseHistory.date" },
          totalPurchases: { $size: "$purchaseHistory" },
          totalSpent: {
            $sum: {
              $map: {
                input: "$purchaseHistory",
                as: "purchase",
                in: { $multiply: ["$$purchase.quantity", "$$purchase.price"] }
              }
            }
          }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const orders = await getClientOrders();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

module.exports = router;