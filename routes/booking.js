const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// POST /api/booking — Create a new booking


router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ date: 1, timeSlot: 1 });
    res.json(bookings);
  } catch (error) {
    console.error('Failed to fetch bookings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/create', async (req, res) => {
  const {
    fullName,
    phoneNumber,
    email,
    serviceType,
    date,
    timeSlot,
    specialRequests,
    reminder
  } = req.body;

  // Basic validation
  if (!fullName || !phoneNumber || !email || !serviceType || !date || !timeSlot) {
    return res.status(400).json({ message: 'All required fields must be filled out.' });
  }

  try {
    const newBooking = new Booking({
      fullName,
      phoneNumber,
      email,
      serviceType,
      date,
      timeSlot,
      specialRequests,
      reminder
    });

    await newBooking.save();

    res.status(201).json({
      message: 'Booking submitted successfully!',
      booking: newBooking
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

module.exports = router;