import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { requireAuth, requireRole } from './middleware/authMiddleware.js';

// Import Models
import User from './models/User.js';
import Ticket from './models/Ticket.js';
import Message from './models/Message.js';
import ActivityLog from './models/ActivityLog.js';
import Transaction from './models/Transaction.js';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import syncRoutes from './routes/syncRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment Validation
const requiredEnv = ['PORT', 'MONGODB_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);

if (missingEnv.length > 0) {
  console.error('FATAL: Missing env variables:', missingEnv.join(', '));
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT;

// 100 reqs per 15 min per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
// 5 attempts per 15 min per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts, please try again later.' }
});

app.use('/api', apiLimiter); 
app.use('/auth', authLimiter);

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.use(helmet({
    contentSecurityPolicy: false, 
}));

// Data Sanitization
app.use((req, res, next) => {
    if (req.body) {
        const sanitize = (obj) => {
            for (let key in obj) {
                // Prevent NoSQL Injection
                if (key.startsWith('$') || key.includes('.')) {
                    delete obj[key];
                    continue;
                }
                // Basic Recursive Sanitization
                if (typeof obj[key] === 'string') {
                    // Remove Null Bytes
                    obj[key] = obj[key].replace(/\0/g, '');
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitize(obj[key]);
                }
            }
        };
        sanitize(req.body);
    }
    next();
});

// Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Session Config
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60, // 14 days
    autoRemove: 'native'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Secure in production
    httpOnly: true, // Prevents XSS JS access
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    sameSite: 'strict'
  }
}));

// Static Files
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// Routes
app.use('/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sync', syncRoutes);

// System Routes
app.get('/health', (req, res) => {
const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    
    // Return 503 if DB is down so load balancers know to drop us
    if (dbState !== 1) {
        return res.status(503).json({ status: 'error', db: dbStatus });
    }

    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        db: dbStatus,
        memory: process.memoryUsage().rss / 1024 / 1024 + ' MB'
    });
});

app.get('/version', (req, res) => {
  res.sendFile(path.join(__dirname, 'version.json'));
});

app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
     return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reset-password.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/settings', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/settings.html'));
});

app.get('/tickets.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/tickets.html'));
});
app.get('/ticket.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/ticket.html'));
});

app.get('/admin', requireAuth, requireRole(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// 401 Unauthorized (Not Logged In)
app.get('/401', (req, res) => {
  res.status(401).sendFile(path.join(__dirname, '../public/401.html'));
});

// 403 Forbidden (Logged In, No Permission)
app.get('/403', (req, res) => {
  res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
});

// 404 Not Found
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
});

// DB init

const seedAdminUser = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (!existingAdmin) {
      console.log('System: Admin user not found. Creating default admin...');
      
      await User.create({
        email: adminEmail,
        password: process.env.ADMIN_PASSWORD,
        role: 'admin',
        isActive: true
      });

      console.log(`System: Default admin created (${adminEmail})`);
    } else {
      console.log('System: Admin user check passed.');
    }
  } catch (err) {
    console.error('System: Failed to seed admin user:', err.message);
  }
};

const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Database: Connected to MongoDB successfully.');

    // Seed Data
    await seedAdminUser();

    // Start Express
    const server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
    console.log(`\n${signal} received. Closing HTTP server...`);
    if (server) {
        server.close(async () => {
            console.log('HTTP server closed.');
            try {
                await mongoose.connection.close();
                console.log('MongoDB connection closed.');
                process.exit(0);
            } catch (err) {
                console.error('Error closing DB:', err);
                process.exit(1);
            }
        });
    } else {
        process.exit(0);
    }
    
    // Force close if it takes too long
    setTimeout(() => {
        console.error('Forcing shutdown...');
        process.exit(1);
    }, 10000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('FATAL: Database connection failed.');
    console.error(err);
    process.exit(1);
  }
};

// Initialize
startServer();