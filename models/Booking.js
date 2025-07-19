
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  serviceType: {
    type: String,
    required: true,
  },
  date: {
    type: String, // or Date, if you're storing as a JS Date
    required: true
  },
  timeSlot: {
    type: String,
    required: true
  },
  specialRequests: {
    type: String,
    default: ''
  },
  reminder: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Booking', bookingSchema);