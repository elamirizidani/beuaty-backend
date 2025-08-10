const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');

const authMiddleware = require('../middleware/authMiddleware');

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// const generateOTP = () => {
//   return crypto.randomInt(100000, 999999).toString();
// };
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Your OTP for password reset is:</p>
        <h3 style="background: #f4f4f4; padding: 10px; display: inline-block; border-radius: 5px;">${otp}</h3>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};



// Register
router.post('/register', async (req, res) => {
  const { name, email, password,role } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    user = new User({ name, email, passwordHash,role });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
// console.log(req.body)
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email,role:user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


router.put('/preferences', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { hairType, skinType, beautyGoals, priceRange } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.preferences = {
      hairType,
      skinType,
      beautyGoals,
      priceRange
    };

    await user.save();

    res.json({ message: 'Preferences updated', preferences: user.preferences });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});




router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Create or update reset token
    await PasswordResetToken.findOneAndUpdate(
      { email },
      { otp, expiresAt },
      { upsert: true, new: true }
    );

    // Send OTP email
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true,
      message: 'OTP sent to your email'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const resetToken = await PasswordResetToken.findOne({ email });
    if (!resetToken) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    // Check if OTP matches and is not expired
    if (resetToken.otp !== otp || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Generate a temporary token for password reset (valid for 10 minutes)
    const tempToken = jwt.sign(
      { email, purpose: 'password_reset' }, 
      process.env.JWT_SECRET, 
      { expiresIn: '10m' }
    );

    res.json({ 
      success: true,
      message: 'OTP verified',
      tempToken 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset Password (after OTP verification)
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    // Verify the temporary token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid token' });
    }

    const { email } = decoded;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    user.passwordHash = passwordHash;
    await user.save();

    // Delete the used OTP
    await PasswordResetToken.deleteOne({ email });

    res.json({ 
      success: true,
      message: 'Password reset successfully' 
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ message: 'Token expired' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



module.exports = router;