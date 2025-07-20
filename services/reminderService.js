const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Booking = require('../models/Booking'); // Your booking model

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Function to send reminder email
const sendReminderEmail = async (booking) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: booking.email,
    subject: 'Reminder: Your Upcoming Appointment',
    html: `
      <h2>Hi ${booking.fullName},</h2>
      <p>This is a reminder that you have an appointment for <strong>${booking.serviceType}</strong> in 15 minutes.</p>
      <p><strong>Appointment Details:</strong></p>
      <ul>
        <li>Date: ${new Date(booking.date).toLocaleDateString()}</li>
        <li>Time: ${booking.timeSlot}</li>
        <li>Service: ${booking.serviceType}</li>
      </ul>
      <p>We look forward to seeing you!</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Reminder email sent to ${booking.email}`);
  } catch (error) {
    console.error('Error sending reminder email:', error);
  }
};

// Check for appointments every minute
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60000);
    
    
    const currentHours = fifteenMinutesLater.getHours().toString().padStart(2, '0');
    const currentMinutes = fifteenMinutesLater.getMinutes().toString().padStart(2, '0');
    const currentTimeString = `${currentHours}:${currentMinutes}`;
    
    
    const currentDateString = fifteenMinutesLater.toISOString().split('T')[0];
    
    const upcomingAppointments = await Booking.find({
      reminder: true,
      date: currentDateString,
      timeSlot: currentTimeString
    });
    
    upcomingAppointments.forEach(sendReminderEmail);
  } catch (error) {
    console.error('Error checking for reminders:', error);
  }
});

module.exports = { sendReminderEmail };