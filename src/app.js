require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { jsonErrorHandler } = require('./api/utils/errorMiddleware');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
let sentry = null;
try { sentry = require('@sentry/node'); } catch (e) { /* ignore optional sentry */ }
const { sequelize } = require('./models');

const app = express();

// Request IDs and logging
app.use((req, res, next) => {
  const rid = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', rid);
  req.id = rid;
  next();
});
app.use(pinoHttp({
  genReqId: (req) => req.id,
  customLogLevel: (res, err) => err ? 'error' : 'info',
  redact: {
    // remove sensitive headers entirely from logs
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]'
    ],
    remove: true
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        headers: {
          // only include minimal safe headers
          'user-agent': req.headers['user-agent'],
          'accept': req.headers['accept'],
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
          'origin': req.headers['origin']
        },
        query: req.query
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
        headers: {
          'content-type': res.getHeader && res.getHeader('content-type'),
          'content-length': res.getHeader && res.getHeader('content-length')
        }
      };
    }
  }
}));

// Optional Sentry
if (process.env.SENTRY_DSN && sentry) {
  sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.0 });
  app.use(sentry.Handlers.requestHandler());
}

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
if (process.env.SENTRY_DSN && sentry) {
  app.use(sentry.Handlers.errorHandler());
}

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.status(404).send('Not found');
});

module.exports = { app, sequelize };


