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

module.exports = router;