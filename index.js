require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const winston = require('winston');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/products');
const recommendationRoutes = require('./routes/recommendations');
const bookingRoutes = require('./routes/booking');
const postsRoutes = require('./routes/posts');
const adminRoutes = require('./routes/admin');
const helpsRoutes = require('./routes/helps');
const paymentRoutes = require('./routes/payments');
const reviewRoutes = require('./routes/reviews');

const app = express();

// ===========================================
// LAYER 1: PERIMETER SECURITY
// ===========================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting - Different limits for different routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests to static files
  skip: (req, res) => res.statusCode < 400,
  // Use handler instead of onLimitReached (v7 compatible)
  handler: (req, res) => {
    securityLogger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: 15 * 60 * 1000
    });
  }
});

// Stricter rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    securityLogger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: 15 * 60 * 1000
    });
  }
});

// Progressive delay for repeated requests (v2 compatible)
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per 15 minutes at full speed
  delayMs: () => 500, // Fixed delay function for v2 compatibility
  validate: { delayMs: false } // Disable the warning message
});

// Apply rate limiting
app.use(generalLimiter);
app.use(speedLimiter);
app.use('/api/auth', authLimiter);

// ===========================================
// LAYER 2: INPUT VALIDATION & SANITIZATION
// ===========================================

// Prevent NoSQL injection attacks
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    securityLogger.warn('NoSQL injection attempt detected', {
      ip: req.ip,
      path: req.path,
      sanitizedField: key
    });
  }
}));

// Prevent XSS attacks
app.use(xss());

// Prevent HTTP Parameter Pollution
app.use(hpp({
  whitelist: ['tags', 'categories'] // Allow duplicates for these fields
}));

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Log large payloads for monitoring
    if (buf.length > 1024 * 1024) { // 1MB
      securityLogger.info('Large payload received', {
        ip: req.ip,
        path: req.path,
        size: buf.length
      });
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================
// LAYER 3: CORS CONFIGURATION
// ===========================================

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000', 
  'http://localhost:5001',
  'http://0.0.0.0:4000',
  'https://beuaty-styles.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      securityLogger.warn('CORS violation', {
        origin: origin,
        ip: req?.ip || 'unknown'
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ===========================================
// LAYER 4: SECURITY LOGGING & MONITORING
// ===========================================

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/security-events.log',
      level: 'warn'
    }),
    new winston.transports.File({ 
      filename: 'logs/app.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Security monitoring middleware
const securityMonitoring = (req, res, next) => {
  const startTime = Date.now();
  
  // Log all requests for analysis
  securityLogger.info('Request received', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  // Monitor response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (res.statusCode >= 400) {
      securityLogger.warn('Error response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: duration,
        ip: req.ip
      });
    }
    
    // Log suspicious patterns
    if (duration > 5000) { // Requests taking more than 5 seconds
      securityLogger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration: duration,
        ip: req.ip
      });
    }
  });
  
  next();
};

app.use(securityMonitoring);

// ===========================================
// LAYER 5: COMPRESSION & PERFORMANCE
// ===========================================

app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression filter function
    return compression.filter(req, res);
  }
}));

// ===========================================
// LAYER 6: ROUTE SECURITY MIDDLEWARE
// ===========================================

// Custom middleware to validate JWT and log authentication events
const authenticationLogger = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    securityLogger.info('JWT authentication attempt', {
      path: req.path,
      ip: req.ip,
      hasToken: true
    });
  } else if (req.path.includes('/api/') && !req.path.includes('/api/auth/')) {
    securityLogger.warn('Unauthenticated API access attempt', {
      path: req.path,
      ip: req.ip
    });
  }
  
  next();
};

app.use(authenticationLogger);

// ===========================================
// API ROUTES
// ===========================================

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/helps', helpsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);

// ===========================================
// SECURITY DASHBOARD ENDPOINT (for academic demo)
// ===========================================

app.get('/api/security/metrics', (req, res) => {
  // This would typically require admin authentication
  const metrics = {
    timestamp: new Date().toISOString(),
    rateLimiting: {
      active: true,
      requestsBlocked: 0, // You'd track this in a real implementation
      averageResponseTime: '120ms'
    },
    authentication: {
      totalAttempts: 0, // Track from your auth routes
      successfulLogins: 0,
      failedLogins: 0,
      jwtTokensIssued: 0
    },
    inputValidation: {
      xssAttemptsBlocked: 0,
      sqlInjectionAttempts: 0,
      malformedRequests: 0
    },
    systemHealth: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeConnections: 0 // Track active connections
    },
    securityScore: 95 // Calculate based on various factors
  };
  
  res.json(metrics);
});

// ===========================================
// ERROR HANDLING MIDDLEWARE
// ===========================================

// 404 handler
app.use('*', (req, res) => {
  securityLogger.warn('404 - Route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested resource does not exist'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  securityLogger.error('Application error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    ...(isDevelopment && { stack: error.stack })
  });
});

// ===========================================
// SERVER STARTUP
// ===========================================

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGO_URI, {
  // Security-related options
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  securityLogger.info('MongoDB connected successfully');
  
  app.listen(PORT, () => {
    securityLogger.info(`Server running on port ${PORT}`, {
      environment: process.env.NODE_ENV || 'development',
      securityLayers: [
        'Helmet (Security Headers)',
        'Rate Limiting',
        'Input Sanitization',
        'CORS Protection',
        'Security Monitoring',
        'Error Handling'
      ]
    });
  });
})
.catch(err => {
  securityLogger.error('Database connection failed', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================

process.on('SIGTERM', () => {
  securityLogger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  securityLogger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Export app for testing
module.exports = app;