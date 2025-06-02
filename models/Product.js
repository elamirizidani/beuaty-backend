const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  date: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: String,
  subcategory: String,
  description: String,
  price: Number,
  productImage:String,
  attributes: {
    hairType: [String],
    skinType: [String],
    ingredients: [String]
  },
  reviews: [reviewSchema]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);