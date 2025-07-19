const mongoose = require('mongoose');
const helpsSchema = new mongoose.Schema({
    fullName: {
    type: String,
    required: true,
    trim: true
  },
    email: {
    type: String,
    required: true,
    trim: true
  },
  about: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Helps', helpsSchema);