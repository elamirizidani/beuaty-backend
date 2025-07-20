const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const { sendReminderEmail } = require('../services/reminderService');

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

    await sendConfirmationEmail(newBooking);

    res.status(201).json({
      message: 'Booking submitted successfully!',
      booking: newBooking
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});



async function sendConfirmationEmail(booking) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: booking.email,
    subject: 'Your Appointment Confirmation',
    html: `
      <h2>Hi ${booking.fullName},</h2>
      <p>Your appointment has been booked successfully!</p>
      <p><strong>Appointment Details:</strong></p>
      <ul>
        <li>Date: ${new Date(booking.date).toLocaleDateString()}</li>
        <li>Time: ${booking.timeSlot}</li>
        <li>Service: ${booking.serviceType}</li>
      </ul>
      ${booking.reminder ? '<p>You will receive a reminder 15 minutes before your appointment.</p>' : ''}
      <p>Thank you for choosing our service!</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${booking.email}`);
  } catch (error) {
    console.error('Error sending confirmation email:', error);
  }
}

module.exports = router;