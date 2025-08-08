const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product',
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  rating: { 
    type: Number, 
    required: true,
    min: 1,
    max: 5 
  },
  comment: {
    type: String,
    maxlength: 500
  },
//   images: [String], // Array of image URLs
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  verifiedPurchase: {
    type: Boolean,
    default: false
  },
  helpfulCount: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

// Add indexes for faster queries
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true }); // Prevent duplicate reviews
reviewSchema.index({ productId: 1, rating: 1 }); // For rating-based queries

module.exports = mongoose.model('Review', reviewSchema);