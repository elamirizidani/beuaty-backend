// const mongoose = require('mongoose');

// const bookingSchema = new mongoose.Schema({
//   name: String,
//   email: String,
//   date: String,
//   time: String,
//   service: String,
//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Booking', bookingSchema);



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
    // enum: [
    //   'Hair Styling',
    //   'Hair Cut & Hair Styling',
    //   'Hair Colouring',
    //   'Blowdry / Orising',
    //   'Hair Extension',
    //   'Make-Up'
    // ]
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