const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  actionType: { type: String, enum: ['viewed', 'liked', 'bought'], required: true },
  date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  preferences: {
    hairType: String,
    skinType: String,
    beautyGoals: String,
    priceRange: { min: Number, max: Number }
  },
  purchaseHistory: [{ productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, date: Date, quantity: Number }],
  cart: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now }
  }],
  interactionHistory: [interactionSchema],
  purchaseHistory: [{
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: { type: Number, default: 1 },
  date: { type: Date, default: Date.now }
}],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);