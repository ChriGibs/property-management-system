require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { jsonErrorHandler } = require('./api/utils/errorMiddleware');
const { sequelize } = require('./models');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
    },
  },
}));

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
  credentials: true,
}));

// Stripe webhook (raw)
const stripeWebhookHandler = require('./routes/stripeWebhook');
const expressRaw = express.raw({ type: 'application/json' });
const webhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.post('/api/stripe/webhook', webhookLimiter, expressRaw, stripeWebhookHandler);

app.use(compression());
app.use(express.json());
app.use(cookieParser());

// API routes
const apiRouter = require('./routes/api/index');
app.use('/api', apiRouter);
app.use('/api/v1', apiRouter);

// Health/ready
app.get('/healthz', (req, res) => { res.json({ status: 'ok' }); });
app.get('/readyz', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ready' });
  } catch {
    res.status(500).json({ status: 'not_ready' });
  }
});

// API error handler
app.use('/api', jsonErrorHandler);

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.status(404).send('Not found');
});

module.exports = { app, sequelize };


