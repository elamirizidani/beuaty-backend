const express = require('express');
const router = express.Router();
const Helps = require('../models/Helps');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


router.get('/', async (req, res) => {
  try {
    const helps = await Helps.find().sort({ createdAt: 1 });
    res.json(helps);
  } catch (error) {
    console.error('Failed to fetch helps:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post('/create', async (req, res) => {
  const {
    fullName,
    email,
    about,
    message
  } = req.body;

  // Basic validation
  if (!fullName || !email || !about || !message) {
    return res.status(400).json({ message: 'All required fields must be filled out.' });
  }

  try {
    const newHelps = new Helps({
      fullName,
      email,
      about,
      message
    });

    await newHelps.save();
    await sendConfirmationEmail(newHelps);

    res.status(201).json({
      message: 'Helps submitted successfully!',
      helps: newHelps
    });
  } catch (error) {
    console.error('Helps error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});


async function sendConfirmationEmail(helper) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: helper.email,
    subject: helper.about,
    html: helper.message
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${helper.email}`);
  } catch (error) {
    console.error('Error sending confirmation email:', error);
  }
}


module.exports = router;