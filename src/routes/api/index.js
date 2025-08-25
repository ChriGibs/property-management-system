const express = require('express');
const requireJwt = require('./middleware/requireJwt');
const csrfOriginGuard = require('./middleware/csrfOrigin');

const router = express.Router();

// Public routes
router.use('/auth', require('./auth'));
router.get('/mock-pay/:id', (req, res) => {
  const rawBase = process.env.CLIENT_BASE_URL || req.headers.origin || 'http://localhost:5175';
  const clientBase = /^https?:\/\//i.test(rawBase) ? rawBase : `http://${rawBase}`;
  const id = encodeURIComponent(req.params.id);
  const amount = req.query.amount ? `&amount=${encodeURIComponent(req.query.amount)}` : '';
  return res.redirect(`${clientBase}/mock-stripe-checkout?paymentRequestId=${id}${amount}`);
});

// Protected routes
router.use(requireJwt);
router.use(csrfOriginGuard([
  process.env.CLIENT_BASE_URL || '',
  process.env.APP_BASE_URL || ''
]));
router.get('/me', (req, res) => res.json({ user: req.user }));
router.use('/properties', require('./properties'));
router.use('/tenants', require('./tenants'));
router.use('/leases', require('./leases'));
router.use('/invoices', require('./invoices'));
router.use('/payments', require('./payments'));
router.use('/prospects', require('./prospects'));
router.use('/acquisitions', require('./acquisitions'));
router.use('/paylinks', require('./paylinks'));
router.get('/address-autocomplete', require('./util/addressAutocomplete'));
router.post('/property-value', require('./util/propertyValue'));

module.exports = router;

