const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json(categories.filter(category => category != null));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
})

// Get product by id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create product (admin protected)
router.post('/', authMiddleware, async (req, res) => {
  const { name, category, subcategory, description, price, attributes,productImage } = req.body;

  try {
    const newProduct = new Product({ name, category, subcategory, description, price, attributes,productImage });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update product (admin protected)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product (admin protected)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/category/:category', async (req, res) => {
  try {
    const products = await Product.find({ 
      category: req.params.category 
    });
    
    if (products.length === 0) {
      return res.status(404).json({ 
        message: 'No products found in this category' 
      });
    }
    
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
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

// GET /api/products/search/suggestions
// Auto-complete/suggestions endpoint
router.get('/search/suggestions', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { suggestions: [] }
      });
    }

    // Get product name suggestions
    const productSuggestions = await Product.find({
      name: { $regex: q, $options: 'i' }
    })
    .select('name')
    .limit(5)
    .lean();

    // Get category suggestions
    const categorySuggestions = await Product.distinct('category', {
      category: { $regex: q, $options: 'i' }
    });

    // Get ingredient suggestions
    const ingredientSuggestions = await Product.aggregate([
      { $unwind: '$attributes.ingredients' },
      { $match: { 'attributes.ingredients': { $regex: q, $options: 'i' } } },
      { $group: { _id: '$attributes.ingredients' } },
      { $limit: 5 }
    ]);

    const suggestions = [
      ...productSuggestions.map(p => ({ type: 'product', value: p.name })),
      ...categorySuggestions.slice(0, 3).map(c => ({ type: 'category', value: c })),
      ...ingredientSuggestions.map(i => ({ type: 'ingredient', value: i._id }))
    ];

    res.json({
      success: true,
      data: { suggestions }
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting suggestions',
      error: error.message
    });
  }
});

// GET /api/products/filters
// Get available filter options
router.get('/filters', async (req, res) => {
  try {
    const [categories, subcategories, hairTypes, skinTypes, priceRange] = await Promise.all([
      Product.distinct('category'),
      Product.distinct('subcategory'),
      Product.distinct('attributes.hairType'),
      Product.distinct('attributes.skinType'),
      Product.aggregate([
        {
          $group: {
            _id: null,
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        categories: categories.filter(Boolean),
        subcategories: subcategories.filter(Boolean),
        hairTypes: hairTypes.flat().filter(Boolean),
        skinTypes: skinTypes.flat().filter(Boolean),
        priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 }
      }
    });

  } catch (error) {
    console.error('Filters error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting filter options',
      error: error.message
    });
  }
});


module.exports = router;