require('dotenv').config();
const { app } = require('./app');
const { sequelize } = require('./models');
const PORT = process.env.PORT || 3000;

// Trust proxy in production for secure cookies and correct IPs
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"]
    }
  }
}));

// CORS configuration (honor CLIENT_BASE_URL in all envs)
const devOrigins = ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5175'];
const allowList = (process.env.NODE_ENV === 'production')
  ? [process.env.CLIENT_BASE_URL].filter(Boolean)
  : [process.env.CLIENT_BASE_URL, ...devOrigins].filter(Boolean);
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowList.some(o => o && origin === o);
    return callback(null, isAllowed);
  },
  credentials: true
}));

// Stripe webhook must receive raw body for signature verification; mount before JSON parser
const stripeWebhookHandler = require('./routes/stripeWebhook');
const expressRaw = express.raw({ type: 'application/json' });
const webhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.post('/api/stripe/webhook', webhookLimiter, expressRaw, stripeWebhookHandler);

// General middleware
app.use(compression());
app.use(express.json());
app.use(cookieParser());

// Mount SPA API under /api and /api/v1
const apiRouter = require('./routes/api/index');
app.use('/api', apiRouter);
app.use('/api/v1', apiRouter);

// Health and readiness endpoints
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});
app.get('/readyz', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ready' });
  } catch {
    res.status(500).json({ status: 'not_ready' });
  }
});

// JSON error handler for API
app.use('/api', jsonErrorHandler);

// Generic 404 for non-API
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.status(404).send('Not found');
});

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Property Management Server running on port ${PORT}`);
      console.log(`📡 API base: http://localhost:${PORT}/api`);
    });
    
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('👋 SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

// Start the server
startServer();


