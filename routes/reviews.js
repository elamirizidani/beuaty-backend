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




router.get('/search', async (req, res) => {
  try {
    const {
      q,           // General search query
      category,    // Filter by category
      subcategory, // Filter by subcategory
      minPrice,    // Minimum price
      maxPrice,    // Maximum price
      hairType,    // Filter by hair type
      skinType,    // Filter by skin type
      minRating,   // Minimum average rating
      sortBy,      // Sort field (price, rating, name, createdAt)
      sortOrder,   // Sort order (asc, desc)
      page = 1,    // Page number
      limit = 10   // Items per page
    } = req.query;

    // Build the search query
    let query = {};

    // Text search across name and description
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { 'attributes.ingredients': { $in: [new RegExp(q, 'i')] } }
      ];
    }

    // Category filters
    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }

    if (subcategory) {
      query.subcategory = { $regex: subcategory, $options: 'i' };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Attribute filters
    if (hairType) {
      const hairTypes = Array.isArray(hairType) ? hairType : [hairType];
      query['attributes.hairType'] = { $in: hairTypes };
    }

    if (skinType) {
      const skinTypes = Array.isArray(skinType) ? skinType : [skinType];
      query['attributes.skinType'] = { $in: skinTypes };
    }

    // Rating filter
    if (minRating) {
      query.averageRating = { $gte: parseFloat(minRating) };
    }

    // Build sort options
    let sortOptions = {};
    if (sortBy) {
      const order = sortOrder === 'desc' ? -1 : 1;
      
      switch (sortBy) {
        case 'price':
          sortOptions.price = order;
          break;
        case 'rating':
          sortOptions.averageRating = order;
          break;
        case 'name':
          sortOptions.name = order;
          break;
        case 'newest':
          sortOptions.createdAt = -1;
          break;
        case 'oldest':
          sortOptions.createdAt = 1;
          break;
        case 'popular':
          sortOptions.reviewCount = -1;
          break;
        default:
          sortOptions.createdAt = -1; // Default sort by newest
      }
    } else {
      sortOptions.createdAt = -1; // Default sort
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute the search
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v'); // Exclude version field

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    // Response
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        },
        filters: {
          query: q || '',
          category: category || '',
          subcategory: subcategory || '',
          priceRange: {
            min: minPrice || null,
            max: maxPrice || null
          },
          hairType: hairType || null,
          skinType: skinType || null,
          minRating: minRating || null
        }
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching products',
      error: error.message
    });
  }
});

// Helper function to check if purchase was verified
async function checkVerifiedPurchase(userId, productId) {
  const user = await User.findById(userId);
  return user.purchaseHistory.some(p => p.productId.equals(productId));
}

module.exports = router;