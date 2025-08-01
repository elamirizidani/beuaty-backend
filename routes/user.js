const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs')
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
  const { items } = req.body; // Now accepts array of items

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Items array required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify all products exist and get their prices
    const productIds = items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    
    if (products.length !== items.length) {
      return res.status(400).json({ message: 'Some products not found' });
    }

    // Create purchase records
    const purchaseRecords = items.map(item => {
      const product = products.find(p => p._id.toString() === item.productId);
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: product.price, // Store price at time of purchase
        date: new Date()
      };
    });

    // Add purchases to history
    user.purchaseHistory.push(...purchaseRecords);
    
    // Clear the cart after successful purchase
    user.cart = [];
    
    await user.save();

    res.json({ 
      success: true,
      message: 'Purchase recorded successfully',
      purchaseHistory: user.purchaseHistory
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/purchases', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId)
      .populate({
        path: 'purchaseHistory.productId',
        select: 'name description image' // Include whatever product fields you need
      })
      .select('purchaseHistory'); // Only return purchase history

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Format the response
    const purchases = user.purchaseHistory.map(purchase => ({
      id: purchase._id,
      date: purchase.date,
      quantity: purchase.quantity,
      
      product: {
        id: purchase.productId._id,
        name: purchase.productId.name,
        description: purchase.productId.description,
        image: purchase.productId.image,
        // price: purchase.productId.price,
      },
      status: purchase.status || 'completed' // Default status if not set
    }));
    res.json({
      success: true,
      count: purchases.length,
      purchases
    });

  } catch (err) {
    console.error(err);
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
      cartItem.quantity = quantity;
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

router.post('/cart/empty', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Empty the cart by setting it to an empty array
    user.cart = [];
    await user.save();

    res.json({ 
      success: true,
      message: 'Cart emptied successfully',
      cart: user.cart // Returns empty array
    });
  } catch (err) {
    console.error('Error emptying cart:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error while emptying cart' 
    });
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




router.post('/change-password', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  // Validate input
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ 
      success: false,
      message: 'All fields are required' 
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ 
      success: false,
      message: 'New passwords do not match' 
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ 
      success: false,
      message: 'Password must be at least 6 characters' 
    });
  }

  try {
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Verify current password (using bcrypt directly)
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);
    
    // Update without modifying schema
    await User.findByIdAndUpdate(userId, { 
      passwordHash: newPasswordHash 
    });

    res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });

  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error while changing password' 
    });
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