require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/products');
const recommendationRoutes = require('./routes/recommendations');

const app = express();


app.use(cors({
  origin: ['http://localhost:5173','http://localhost:3000', 'http://localhost:5001','http://0.0.0.0:4000','https://beuaty-styles.vercel.app'], // Add your frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/recommendations', recommendationRoutes);

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});


const PORT = process.env.PORT || 4000;

// port = process.env.PORT || 5001

  mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('DB connection error:', err);
  });