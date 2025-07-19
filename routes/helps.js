const express = require('express');
const router = express.Router();
const Helps = require('../models/Helps');



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

    res.status(201).json({
      message: 'Helps submitted successfully!',
      helps: newHelps
    });
  } catch (error) {
    console.error('Helps error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});
module.exports = router;