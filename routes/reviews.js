const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User'); 
// Add a review
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      userId: req.user.id,
      productId: req.body.productId
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You already reviewed this product' });
    }

    const review = new Review({
      ...req.body,
      userId: req.user.id,
      verifiedPurchase: await checkVerifiedPurchase(req.user.id, req.body.productId)
    });

    await review.save();
    
    // Update product review stats
    await Product.updateReviewStats(req.body.productId);

    res.status(201).json(review);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get reviews for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.productId })
      .populate('userId', 'name profilePicture')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/latest', async (req, res) => {
  try {
    const latestReviews = await Review.find()
      .populate('userId', 'name profilePicture')
      .populate('productId', 'name images price') // Include product info
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(6) // Limit to 6 reviews
      .exec();

    res.json(latestReviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Helper function to check if purchase was verified
async function checkVerifiedPurchase(userId, productId) {
  const user = await User.findById(userId);
  return user.purchaseHistory.some(p => p.productId.equals(productId));
}

module.exports = router;