// const mongoose = require('mongoose');

// const reviewSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   rating: { type: Number, min: 1, max: 5 },
//   comment: String,
//   date: { type: Date, default: Date.now }
// });

// const productSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   category: String,
//   subcategory: String,
//   description: String,
//   price: Number,
//   productImage:String,
//   attributes: {
//     hairType: [String],
//     skinType: [String],
//     ingredients: [String]
//   },
//   reviews: [reviewSchema]
// }, { timestamps: true });

// module.exports = mongoose.model('Product', productSchema);



// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: String,
  subcategory: String,
  description: String,
  price: Number,
  productImage: String,
  attributes: {
    hairType: [String],
    skinType: [String],
    ingredients: [String]
  },
  // Remove the embedded reviews array and replace with:
  reviewCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    min: 1,
    max: 5,
    default: 0
  }
}, { timestamps: true });

// Virtual for getting reviews (not stored in DB)
productSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'productId'
});

// Update review stats when reviews are modified
productSchema.statics.updateReviewStats = async function(productId) {
  const stats = await this.model('Review').aggregate([
    { $match: { productId: productId } },
    { 
      $group: {
        _id: '$productId',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await this.findByIdAndUpdate(productId, {
      averageRating: stats[0].averageRating.toFixed(1),
      reviewCount: stats[0].reviewCount
    });
  }
};

module.exports = mongoose.model('Product', productSchema);