const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');

// Helper function: count common purchased products between two users
function countCommonProducts(purchasesA, purchasesB) {
  const setA = new Set(purchasesA.map(p => p.productId.toString()));
  const setB = new Set(purchasesB.map(p => p.productId.toString()));

  let commonCount = 0;
  setA.forEach(productId => {
    if (setB.has(productId)) commonCount++;
  });
  return commonCount;
}

// Content-Based Recommendation: by user's hairType preference
router.get('/content-based/:userId', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userHairType = user.preferences?.hairType;

    if (!userHairType) return res.status(400).json({ message: 'User preferences not set' });

    const recommendedProducts = await Product.find({
      'attributes.hairType': userHairType
    }).limit(10);

    res.json({ recommendedProducts });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Collaborative Filtering Recommendation: simple user similarity on purchase history
router.get('/collaborative/:userId', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const currentUser = await User.findById(req.params.userId).populate('purchaseHistory.productId');
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    // All other users (limit for performance)
    const otherUsers = await User.find({ _id: { $ne: currentUser._id } }).limit(100).populate('purchaseHistory.productId');

    // Calculate similarity scores
    const similarityScores = otherUsers.map(otherUser => {
      const commonCount = countCommonProducts(currentUser.purchaseHistory, otherUser.purchaseHistory);
      return { user: otherUser, score: commonCount };
    });

    // Sort by highest similarity score
    similarityScores.sort((a, b) => b.score - a.score);

    // Take top 5 similar users
    const topUsers = similarityScores.slice(0, 5).map(s => s.user);

    // Aggregate products purchased by top similar users but NOT by current user
    const currentUserProducts = new Set(currentUser.purchaseHistory.map(p => p.productId._id.toString()));

    const recommendedProductIds = new Set();

    topUsers.forEach(user => {
      user.purchaseHistory.forEach(purchase => {
        const prodId = purchase.productId._id.toString();
        if (!currentUserProducts.has(prodId)) {
          recommendedProductIds.add(prodId);
        }
      });
    });

    // Fetch product details for recommendations
    const recommendedProducts = await Product.find({ _id: { $in: Array.from(recommendedProductIds) } }).limit(10);

    res.json({ recommendedProducts });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;