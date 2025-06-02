const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');

// User buys a product
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

module.exports = router;