// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price must be positive'],
    validate: {
      validator: function(v) {
        return Number.isFinite(v) && v >= 0;
      },
      message: 'Price must be a valid positive number'
    }
  },
  productImage: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
      },
      message: 'Please provide a valid image URL'
    }
  },
  attributes: {
    hairType: {
      type: [String],
      enum: ['oily', 'dry', 'normal', 'combination', 'damaged', 'color-treated'],
      validate: {
        validator: function(v) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 hair types'
      }
    },
    skinType: {
      type: [String],
      enum: ['oily', 'dry', 'normal', 'combination', 'sensitive', 'acne-prone'],
      validate: {
        validator: function(v) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 skin types'
      }
    },
    ingredients: {
      type: [String],
      validate: {
        validator: function(v) {
          return v.length <= 50;
        },
        message: 'Cannot have more than 50 ingredients'
      }
    }
  },
  // Stock management
  stock: {
    type: Number,
    default: 0,
    min: [0, 'Stock cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Review statistics
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  averageRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
    set: function(val) {
      return Math.round(val * 10) / 10; // Round to 1 decimal place
    }
  },
  // SEO and metadata
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  tags: [String],
  // Pricing history for analytics
  priceHistory: [{
    price: Number,
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ price: 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ 'attributes.hairType': 1 });
productSchema.index({ 'attributes.skinType': 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ createdAt: -1 }); // For newest products

// Virtual for getting reviews (not stored in DB)
productSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'productId'
});

// Pre-save middleware to generate slug
productSchema.pre('save', function(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  
  // Track price changes
  if (this.isModified('price') && !this.isNew) {
    this.priceHistory.push({ price: this.price });
    // Keep only last 10 price changes
    if (this.priceHistory.length > 10) {
      this.priceHistory = this.priceHistory.slice(-10);
    }
  }
  
  next();
});

// Static method to update review stats
productSchema.statics.updateReviewStats = async function(productId) {
  try {
    const stats = await this.model('Review').aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: '$productId',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    const updateData = stats.length > 0 ? {
      averageRating: stats[0].averageRating,
      reviewCount: stats[0].reviewCount
    } : {
      averageRating: 0,
      reviewCount: 0
    };

    await this.findByIdAndUpdate(productId, updateData);
    return updateData;
  } catch (error) {
    console.error('Error updating review stats:', error);
    throw error;
  }
};

// Static method for advanced search
productSchema.statics.search = function(query) {
  const { 
    text, 
    category, 
    subcategory, 
    minPrice, 
    maxPrice, 
    hairType, 
    skinType,
    minRating,
    sortBy = 'relevance'
  } = query;

  let pipeline = [
    { $match: { isActive: true } }
  ];

  // Text search
  if (text) {
    pipeline.push({
      $match: {
        $text: { $search: text }
      }
    });
    pipeline.push({
      $addFields: {
        score: { $meta: 'textScore' }
      }
    });
  }

  // Category filters
  if (category) pipeline.push({ $match: { category } });
  if (subcategory) pipeline.push({ $match: { subcategory } });

  // Price range
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceMatch = {};
    if (minPrice !== undefined) priceMatch.$gte = minPrice;
    if (maxPrice !== undefined) priceMatch.$lte = maxPrice;
    pipeline.push({ $match: { price: priceMatch } });
  }

  // Attribute filters
  if (hairType) {
    pipeline.push({ $match: { 'attributes.hairType': { $in: Array.isArray(hairType) ? hairType : [hairType] } } });
  }
  if (skinType) {
    pipeline.push({ $match: { 'attributes.skinType': { $in: Array.isArray(skinType) ? skinType : [skinType] } } });
  }

  // Rating filter
  if (minRating) {
    pipeline.push({ $match: { averageRating: { $gte: minRating } } });
  }

  // Sorting
  let sortStage = {};
  switch (sortBy) {
    case 'price-asc':
      sortStage = { price: 1 };
      break;
    case 'price-desc':
      sortStage = { price: -1 };
      break;
    case 'rating':
      sortStage = { averageRating: -1, reviewCount: -1 };
      break;
    case 'newest':
      sortStage = { createdAt: -1 };
      break;
    case 'relevance':
    default:
      sortStage = text ? { score: { $meta: 'textScore' } } : { averageRating: -1, reviewCount: -1 };
      break;
  }
  pipeline.push({ $sort: sortStage });

  return this.aggregate(pipeline);
};

// Instance method to check if product is in stock
productSchema.methods.isInStock = function() {
  return this.stock > 0;
};

// Instance method to update stock
productSchema.methods.updateStock = function(quantity) {
  this.stock = Math.max(0, this.stock + quantity);
  return this.save();
};

module.exports = mongoose.model('Product', productSchema);