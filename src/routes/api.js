const express = require('express');
const router = express.Router();
const { Property, User, AcquisitionProperty, ProspectTenant, Lease, Invoice, Tenant, Payment, PaymentAllocation, PaymentRequest } = require('../models');
const stripeLib = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const sendgrid = process.env.SENDGRID_API_KEY ? require('@sendgrid/mail') : null;
if (sendgrid) sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
const twilio = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const { Op } = require('sequelize');
const { createHttpError } = require('../api/utils/errorMiddleware');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Public JSON auth endpoints for SPA
// Public redirect for legacy/mock links
router.get('/mock-pay/:id', (req, res) => {
  const rawBase = process.env.CLIENT_BASE_URL || req.headers.origin || 'http://localhost:5175';
  const clientBase = /^https?:\/\//i.test(rawBase) ? rawBase : `http://${rawBase}`;
  const id = encodeURIComponent(req.params.id);
  const amount = req.query.amount ? `&amount=${encodeURIComponent(req.query.amount)}` : '';
  return res.redirect(`${clientBase}/mock-stripe-checkout?paymentRequestId=${id}${amount}`);
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email, isActive: true } });
    if (!user || !(await user.validatePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    user.lastLoginAt = new Date();
    await user.save();
    const payload = { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '1d' });
    res.cookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });
    return res.json({ user: payload });
  } catch (err) {
    console.error('API login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// JWT auth middleware for SPA API
function requireJwt(req, res, next) {
  const token = req.cookies && req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret');
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// All API routes below require JWT (SPA)
router.use(requireJwt);

// Current user info
router.get('/me', (req, res) => {
  return res.json({ user: req.user });
});

// Properties JSON endpoints
router.get('/properties', async (req, res) => {
  try {
    const properties = await Property.findAll({ order: [['address', 'ASC']] });
    res.json({ data: properties });
  } catch (error) {
    console.error('API properties list error:', error);
    res.status(500).json({ error: 'Failed to load properties' });
  }
});

// Create property
router.post('/properties', async (req, res, next) => {
  try {
    const { name, address, city, state, zipCode } = req.body || {};
    if (!address || !city || !state || !zipCode) {
      throw createHttpError(400, 'Address, city, state, and zip are required', { code: 'VALIDATION_ERROR' });
    }
    const created = await Property.create({
      name: name?.trim() || null,
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      isActive: true
    });
    return res.status(201).json({ data: created });
  } catch (error) { return next(error); }
});

router.put('/properties/:id', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) return res.status(404).json({ error: 'Not found' });
    await property.update(req.body || {});
    res.json({ data: property });
  } catch (error) {
    console.error('API property update error:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});
router.get('/properties/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const property = await Property.findByPk(id);
    if (!property) return res.status(404).json({ error: 'Not found' });

    // Active lease (by property.activeLeaseId if present, else latest active)
    let activeLease = null;
    if (property.activeLeaseId) {
      activeLease = await Lease.findByPk(property.activeLeaseId, {
        include: [
          { model: Tenant, as: 'tenant1' },
          { model: Tenant, as: 'tenant2' },
          { model: Tenant, as: 'tenant3' },
          { model: Tenant, as: 'tenant4' },
        ],
      });
    }
    if (!activeLease) {
      activeLease = await Lease.findOne({
        where: { propertyId: id, status: 'active' },
        order: [['startDate', 'DESC']],
        include: [
          { model: Tenant, as: 'tenant1' },
          { model: Tenant, as: 'tenant2' },
          { model: Tenant, as: 'tenant3' },
          { model: Tenant, as: 'tenant4' },
        ],
      });
    }

    // All leases for property (ids for invoice lookup)
    const leases = await Lease.findAll({ where: { propertyId: id }, attributes: ['id'] });
    const leaseIds = leases.map(l => l.id);

    // Invoices for property leases
    let invoices = [];
    if (leaseIds.length) {
      invoices = await Invoice.findAll({ where: { leaseId: leaseIds }, order: [['invoiceDate', 'DESC']] });
    }
    // Compute paid map and totals using service
    const { computePaidMapForInvoices } = require('../services/paymentService');
    const invoiceIds = invoices.map(inv => inv.id);
    const paidMap = await computePaidMapForInvoices(invoiceIds);
    invoices.forEach(inv => { inv.paidAmount = paidMap[inv.id] || 0; });
    const totalsFor = (inv) => (parseFloat(inv.rentAmount || 0) + parseFloat(inv.lateFeeAmount || 0) + parseFloat(inv.otherCharges || 0));
    const totalInvoiced = invoices.reduce((sum, inv) => sum + totalsFor(inv), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const outstanding = totalInvoiced - totalPaid;

    // Tenants from active lease (flatten to array)
    let activeTenants = [];
    if (activeLease) {
      activeTenants = [activeLease.tenant1, activeLease.tenant2, activeLease.tenant3, activeLease.tenant4]
        .filter(Boolean);
    }

    res.json({
      data: {
        property,
        activeLease,
        activeTenants,
        invoices,
        payments: [],
        totals: {
          totalInvoiced,
          totalPaid,
          outstanding,
        },
      },
    });
  } catch (error) {
    console.error('API property show error:', error);
    res.status(500).json({ error: 'Failed to load property detail' });
  }
});

// Tenants JSON
router.get('/tenants', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const tenants = await Tenant.findAll({ order: [['lastName', 'ASC'], ['firstName', 'ASC']], limit, offset });
    res.json({ data: tenants });
  } catch (error) {
    console.error('API tenants list error:', error);
    res.status(500).json({ error: 'Failed to load tenants' });
  }
});

router.get('/tenants/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    const leases = await Lease.findAll({
      where: {
        [Op.or]: [
          { tenant1Id: id },
          { tenant2Id: id },
          { tenant3Id: id },
          { tenant4Id: id }
        ]
      },
      include: ['property'],
      order: [['startDate', 'DESC']]
    });
    res.json({ data: { tenant, leases } });
  } catch (error) {
    console.error('API tenant detail error:', error);
    res.status(500).json({ error: 'Failed to load tenant detail' });
  }
});

router.post('/tenants', async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, isActive } = req.body;
    if (!firstName || !lastName) {
      throw createHttpError(400, 'First and last name are required', { code: 'VALIDATION_ERROR' });
    }
    if (!(email && String(email).trim()) && !(phone && String(phone).trim())) {
      throw createHttpError(400, 'Either email or phone is required', { code: 'VALIDATION_ERROR' });
    }
    const created = await Tenant.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      password: 'placeholder', // not used for manager tenants in this API
      isActive: isActive !== undefined ? !!isActive : true
    });
    res.status(201).json({ data: created });
  } catch (error) { return next(error); }
});

router.put('/tenants/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    const { firstName, lastName, email, phone, isActive } = req.body;
    await tenant.update({
      firstName: firstName ?? tenant.firstName,
      lastName: lastName ?? tenant.lastName,
      email: email ?? tenant.email,
      phone: phone ?? tenant.phone,
      isActive: isActive ?? tenant.isActive
    });
    res.json({ data: tenant });
  } catch (error) {
    console.error('API tenant update error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Leases JSON
router.get('/leases', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const leases = await Lease.findAll({ order: [['startDate', 'DESC']], include: ['property'], limit, offset });
    res.json({ data: leases });
  } catch (error) {
    console.error('API leases list error:', error);
    res.status(500).json({ error: 'Failed to load leases' });
  }
});

router.get('/leases/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lease = await Lease.findByPk(id, {
      include: [
        'property',
        { model: Tenant, as: 'tenant1' },
        { model: Tenant, as: 'tenant2' },
        { model: Tenant, as: 'tenant3' },
        { model: Tenant, as: 'tenant4' },
      ],
    });
    if (!lease) return res.status(404).json({ error: 'Not found' });

    const invoices = await Invoice.findAll({ where: { leaseId: id }, order: [['invoiceDate', 'DESC']] });
    const invoiceIds = invoices.map(i => i.id);
    const { computePaidMapForInvoices } = require('../services/paymentService');
    const paidMap = await computePaidMapForInvoices(invoiceIds);
    invoices.forEach(inv => { inv.paidAmount = paidMap[inv.id] || 0; });
    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.rentAmount || 0) + parseFloat(inv.lateFeeAmount || 0) + parseFloat(inv.otherCharges || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount || 0), 0);
    const outstanding = totalInvoiced - totalPaid;

    const tenants = [lease.tenant1, lease.tenant2, lease.tenant3, lease.tenant4].filter(Boolean);

    res.json({
      data: {
        lease,
        property: lease.property,
        tenants,
        invoices,
        payments: [],
        totals: { totalInvoiced, totalPaid, outstanding },
      },
    });
  } catch (error) {
    console.error('API lease detail error:', error);
    res.status(500).json({ error: 'Failed to load lease detail' });
  }
});

router.post('/leases', async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await Lease.create({
      propertyId: parseInt(payload.propertyId),
      tenant1Id: payload.tenant1Id ? parseInt(payload.tenant1Id) : null,
      startDate: payload.startDate,
      endDate: payload.endDate,
      monthlyRent: payload.monthlyRent,
      status: payload.status || 'active',
      notes: payload.notes || null
    });
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('API lease create error:', error);
    res.status(500).json({ error: 'Failed to create lease' });
  }
});

router.put('/leases/:id', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id);
    if (!lease) return res.status(404).json({ error: 'Not found' });
    await lease.update(req.body || {});
    res.json({ data: lease });
  } catch (error) {
    console.error('API lease update error:', error);
    res.status(500).json({ error: 'Failed to update lease' });
  }
});

// Invoices
router.get('/invoices', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const invoices = await Invoice.findAll({ order: [['invoiceDate', 'DESC']], limit, offset });
    const invoiceIds = invoices.map(i => i.id);
    const { computePaidMapForInvoices } = require('../services/paymentService');
    const paidMap = await computePaidMapForInvoices(invoiceIds);
    invoices.forEach(inv => { inv.paidAmount = paidMap[inv.id] || 0; });
    res.json({ data: invoices });
  } catch (error) {
    console.error('API invoices list error:', error);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

// Invoice detail with allocations and payments
router.get('/invoices/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { computeInvoiceTotals } = require('../services/paymentService');
    const result = await computeInvoiceTotals(id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    const { invoice, totals } = result;
    // For compatibility, also return raw legacy and allocation lists
    const legacyPayments = await Payment.findAll({ where: { invoiceId: id }, order: [['paymentDate', 'DESC']] });
    const allocations = await PaymentAllocation.findAll({ where: { invoiceId: id }, include: [{ model: Payment, as: 'payment' }], order: [['createdAt', 'DESC']] });
    res.json({ data: { invoice, legacyPayments, allocations, totals } });
  } catch (error) {
    console.error('API invoice detail error:', error);
    res.status(500).json({ error: 'Failed to load invoice' });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const payload = req.body || {};
    const invoiceNumber = payload.invoiceNumber || require('../models/Invoice').generateInvoiceNumber();
    const created = await Invoice.create({
      invoiceNumber,
      leaseId: payload.leaseId || null,
      invoiceDate: payload.invoiceDate || new Date(),
      dueDate: payload.dueDate,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      rentAmount: payload.rentAmount || 0,
      lateFeeAmount: payload.lateFeeAmount || 0,
      otherCharges: payload.otherCharges || 0,
      otherChargesDescription: payload.otherChargesDescription || null,
      notes: payload.notes || null,
      status: payload.status || 'sent'
    });
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('API invoice create error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.put('/invoices/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    await invoice.update(req.body || {});
    res.json({ data: invoice });
  } catch (error) {
    console.error('API invoice update error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.delete('/invoices/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    await invoice.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('API invoice delete error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});
// Payments
router.get('/payments', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const payments = await Payment.findAll({ order: [['paymentDate', 'DESC']], include: [{ model: PaymentAllocation, as: 'allocations' }], limit, offset });
    res.json({ data: payments });
  } catch (error) {
    console.error('API payments list error:', error);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

// Payment detail with allocations and invoice info
router.get('/payments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payment = await Payment.findByPk(id, {
      include: [
        {
          model: PaymentAllocation,
          as: 'allocations',
          include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNumber', 'dueDate'] }]
        },
        { model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNumber'] }
      ]
    });
    if (!payment) return res.status(404).json({ error: 'Not found' });
    res.json({ data: payment });
  } catch (error) {
    console.error('API payment detail error:', error);
    res.status(500).json({ error: 'Failed to load payment' });
  }
});

// Payment Links (Stripe Checkout) – stubs
router.post('/paylinks', async (req, res) => {
  try {
    const payload = req.body || {};
    const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];
    const amountTotal = allocations.reduce((s, a) => s + parseFloat(a.amount || 0), 0);

    const pr = await PaymentRequest.create({
      leaseId: payload.leaseId || null,
      primaryTenantId: payload.tenantId || null,
      amountTotal,
      currency: 'usd',
      deliveryMethod: payload.deliveryMethod || 'link',
      toEmail: payload.toEmail || null,
      toPhone: payload.toPhone || null,
      message: payload.message || null,
      status: 'sent',
      metadata: { allocations }
    });

    const rawBase = process.env.CLIENT_BASE_URL || req.headers.origin || 'http://localhost:5175';
    const clientBase = /^https?:\/\//i.test(rawBase) ? rawBase : `http://${rawBase}`;
    let url = `${clientBase}/mock-stripe-checkout?paymentRequestId=${pr.id}&amount=${amountTotal.toFixed(2)}`;
    if (stripeLib && amountTotal > 0) {
      try {
        const APP_BASE_URL = process.env.APP_BASE_URL || process.env.CLIENT_BASE_URL || 'http://localhost:5175';
        const allocIds = [...new Set(allocations.map(a => parseInt(a.invoiceId)).filter(Boolean))];
        const invs = allocIds.length ? await Invoice.findAll({ where: { id: allocIds } }) : [];
        const idToInvoice = invs.reduce((m, inv) => { m[inv.id] = inv; return m; }, {});
        const line_items = allocations.map(a => {
          const inv = idToInvoice[a.invoiceId];
          const name = inv?.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : `Invoice #${a.invoiceId}`;
          const descParts = [];
          if (inv?.dueDate) descParts.push(`Due ${new Date(inv.dueDate).toLocaleDateString()}`);
          if (inv?.otherChargesDescription) descParts.push(String(inv.otherChargesDescription));
          const description = descParts.join(' • ');
          return {
            price_data: {
              currency: 'usd',
              product_data: { name, description },
              unit_amount: Math.round(parseFloat(a.amount) * 100)
            },
            quantity: 1
          };
        }).filter(li => li.price_data.unit_amount > 0);

        const session = await stripeLib.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items,
          success_url: `${APP_BASE_URL}/mock-stripe-checkout?paymentRequestId=${pr.id}&status=success`,
          cancel_url: `${APP_BASE_URL}/mock-stripe-checkout?paymentRequestId=${pr.id}&status=cancel`,
          metadata: {
            paymentRequestId: String(pr.id),
            allocationsJson: JSON.stringify(allocations)
          }
        });

        pr.stripeCheckoutSessionId = session.id;
        pr.lastUrl = session.url || url; // ensure we always have a usable URL
        await pr.save();
        url = session.url || url;
      } catch (e) {
        console.warn('Stripe session create failed, falling back to mock:', e?.message || e);
        // url remains as clientBase mock link
      }
    }

    // Optionally send email
    try {
      if (payload.toEmail && sendgrid) {
        await sendgrid.send({
          from: process.env.SENDGRID_FROM_EMAIL || 'no-reply@example.com',
          to: payload.toEmail,
          subject: `Payment Request for Lease ${payload.leaseId || ''}`.trim(),
          html: `<p>You have a new payment request.</p><p><a href="${url}">Pay Now</a></p><p>${payload.message ? String(payload.message) : ''}</p>`
        });
      }
    } catch (e) {
      console.warn('SendGrid send failed:', e.message);
    }

    // Optionally send SMS (prefers Messaging Service if configured)
    try {
      if (payload.toPhone && twilio && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)) {
        const messageCreateParams = { to: payload.toPhone, body: `Payment request: ${url}` };
        if (process.env.TWILIO_MESSAGING_SERVICE_SID) { messageCreateParams.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID; }
        else if (process.env.TWILIO_FROM_NUMBER) { messageCreateParams.from = process.env.TWILIO_FROM_NUMBER; }
        await twilio.messages.create(messageCreateParams);
      }
    } catch (e) {
      console.warn('Twilio send failed:', e.message);
    }
    // persist lastUrl for non-Stripe fallback
    if (!pr.lastUrl) { pr.lastUrl = url; await pr.save(); }
    res.status(201).json({ data: { paymentRequest: pr, url } });
  } catch (error) {
    console.error('API paylinks create error:', error);
    res.status(500).json({ error: 'Failed to create paylink' });
  }
});

router.get('/paylinks', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const items = await PaymentRequest.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json({ data: items });
  } catch (error) {
    console.error('API paylinks list error:', error);
    res.status(500).json({ error: 'Failed to list paylinks' });
  }
});

// Mock complete endpoint for local testing (no Stripe required)
router.post('/paylinks/:id/mock-complete', async (req, res) => {
  try {
    const pr = await PaymentRequest.findByPk(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Not found' });
    if (pr.status === 'completed') return res.json({ data: pr });
    const snapshot = (pr.metadata && (pr.metadata.allocations || (pr.metadata.allocationsJson && JSON.parse(pr.metadata.allocationsJson)))) || [];
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      return res.status(400).json({ error: 'No allocations stored on payment request' });
    }
    const total = snapshot.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
    const mainInvoiceId = parseInt(snapshot[0].invoiceId);
    const payment = await Payment.create({
      invoiceId: mainInvoiceId,
      amount: total,
      paymentDate: new Date(),
      paymentMethod: 'online',
      status: 'completed',
      description: `Mock payment for request ${pr.id}`,
    });
    if (Array.isArray(snapshot) && snapshot.length) {
      const rows = snapshot.filter(a => a && a.invoiceId && parseFloat(a.amount || 0) > 0).map(a => ({ paymentId: payment.id, invoiceId: parseInt(a.invoiceId), amount: parseFloat(a.amount) }));
      if (rows.length) await PaymentAllocation.bulkCreate(rows);
    }
    pr.status = 'completed';
    await pr.save();
    res.json({ data: { paymentId: payment.id } });
  } catch (e) {
    console.error('Mock complete error:', e);
    res.status(500).json({ error: 'Failed to mock complete' });
  }
});

router.get('/paylinks/:id', async (req, res) => {
  try {
    const pr = await PaymentRequest.findByPk(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Not found' });
    res.json({ data: pr });
  } catch (error) {
    console.error('API paylinks detail error:', error);
    res.status(500).json({ error: 'Failed to load paylink' });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const payload = req.body || {};
    const allocations = Array.isArray(payload.allocations) ? payload.allocations : null;
    if (!allocations && !payload.invoiceId) {
      return res.status(400).json({ error: 'invoiceId or allocations[] required' });
    }

    const amountFromAlloc = allocations ? allocations.reduce((s, a) => s + parseFloat(a.amount || 0), 0) : null;
    const paymentAmount = amountFromAlloc != null ? amountFromAlloc : parseFloat(payload.amount || 0);

    if (allocations) {
      const { applyPaymentWithAllocations } = require('../services/paymentService');
      const payment = await applyPaymentWithAllocations({ allocations, amount: paymentAmount, paymentFields: payload });
      const withAllocations = await Payment.findByPk(payment.id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
      return res.status(201).json({ data: withAllocations });
    } else {
      // fallback to direct invoice payment (legacy)
      const payment = await Payment.create({
        invoiceId: parseInt(payload.invoiceId),
        amount: paymentAmount,
        paymentDate: payload.paymentDate || new Date(),
        paymentMethod: payload.paymentMethod || 'online',
        transactionId: payload.transactionId || null,
        checkNumber: payload.checkNumber || null,
        status: payload.status || 'completed',
        processingFee: payload.processingFee || 0,
        description: payload.description || null,
        notes: payload.notes || null
      });
      const withAllocations = await Payment.findByPk(payment.id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
      return res.status(201).json({ data: withAllocations });
    }
  } catch (error) {
    console.error('API payment create error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Update payment (core fields) and optionally replace allocations
router.put('/payments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payload = req.body || {};
    const payment = await Payment.findByPk(id);
    if (!payment) return res.status(404).json({ error: 'Not found' });

    // Update core fields
    const updatable = {
      paymentDate: payload.paymentDate || payment.paymentDate,
      paymentMethod: payload.paymentMethod || payment.paymentMethod,
      status: payload.status || payment.status,
      description: payload.description ?? payment.description,
      notes: payload.notes ?? payment.notes,
      processingFee: payload.processingFee ?? payment.processingFee
    };
    await payment.update(updatable);

    // Replace allocations if provided
    if (Array.isArray(payload.allocations)) {
      await PaymentAllocation.destroy({ where: { paymentId: id } });
      const rows = payload.allocations
        .filter(a => a && a.invoiceId && parseFloat(a.amount || 0) > 0)
        .map(a => ({ paymentId: id, invoiceId: parseInt(a.invoiceId), amount: parseFloat(a.amount) }));
      if (rows.length) await PaymentAllocation.bulkCreate(rows);
    }

    const result = await Payment.findByPk(id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
    res.json({ data: result });
  } catch (error) {
    console.error('API payment update error:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// Delete payment (and cascading allocations)
router.delete('/payments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payment = await Payment.findByPk(id);
    if (!payment) return res.status(404).json({ error: 'Not found' });
    await payment.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('API payment delete error:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// Acquisitions JSON list
router.get('/acquisitions', async (req, res) => {
  try {
    const { status, city, state } = req.query;
    const where = {};
    if (status) where.status = status;
    if (city) where.city = city;
    if (state) where.state = state;
    const acquisitions = await AcquisitionProperty.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    res.json({ data: acquisitions });
  } catch (error) {
    console.error('API acquisitions list error:', error);
    res.status(500).json({ error: 'Failed to load acquisitions' });
  }
});

router.post('/acquisitions', async (req, res) => {
  try {
    const {
      headline,
      address,
      city,
      state,
      zipCode,
      county,
      propertyType,
      bedrooms,
      bathrooms,
      squareFootage,
      yearBuilt,
      listedPrice,
      url,
      notes,
      source
    } = req.body;

    if (!headline || !headline.trim()) {
      return res.status(400).json({ error: 'Headline is required' });
    }

    const created = await AcquisitionProperty.create({
      headline: headline.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zipCode: zipCode?.trim() || null,
      county: county?.trim() || null,
      propertyType: propertyType || null,
      bedrooms: bedrooms != null ? parseInt(bedrooms) : null,
      bathrooms: bathrooms != null ? parseFloat(bathrooms) : null,
      squareFootage: squareFootage != null ? parseInt(squareFootage) : null,
      yearBuilt: yearBuilt != null ? parseInt(yearBuilt) : null,
      listedPrice: listedPrice != null ? parseFloat(listedPrice) : null,
      url: url?.trim() || null,
      notes: notes?.trim() || null,
      source: source || 'manual',
      createdByUserId: req.user.id
    });

    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('API acquisitions create error:', error);
    res.status(500).json({ error: 'Failed to create acquisition' });
  }
});

// Prospect tenants JSON list
router.get('/prospects', async (req, res) => {
  try {
    const { stage, source } = req.query;
    const where = {};
    if (stage) where.stage = stage;
    if (source) where.source = source;
    const prospects = await ProspectTenant.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    res.json({ data: prospects });
  } catch (error) {
    console.error('API prospects list error:', error);
    res.status(500).json({ error: 'Failed to load prospects' });
  }
});

router.post('/prospects', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, stage, source, notes, interestedPropertyId } = req.body;
    if (!email && !(firstName && lastName && phone)) {
      return res.status(400).json({ error: 'Email or full name with phone is required' });
    }
    const created = await ProspectTenant.create({
      firstName: firstName?.trim() || null,
      lastName: lastName?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      stage: stage || 'new',
      source: source || 'manual',
      notes: notes?.trim() || null,
      interestedPropertyId: interestedPropertyId || null
    });
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('API prospects create error:', error);
    res.status(500).json({ error: 'Failed to create prospect' });
  }
});

// Dashboard summary
router.get('/dashboard/summary', async (req, res) => {
  try {
    const [propertiesCount, tenantsCount, activeLeasesCount, invoicesOverdueCount] = await Promise.all([
      Property.count({ where: { isActive: true } }),
      Tenant.count({ where: { isActive: true } }),
      Lease.count({ where: { status: 'active' } }),
      Invoice.count({ where: { status: ['overdue'] } })
    ]);

    res.json({
      data: {
        propertiesCount,
        tenantsCount,
        activeLeasesCount,
        invoicesOverdueCount
      }
    });
  } catch (error) {
    console.error('API dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
});

// Address autocomplete endpoint
router.get('/address-autocomplete', async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query || query.length < 3) {
      return res.json({ suggestions: [] });
    }

    // Using a mock geocoding service for demo
    // In production, you would use Google Places API, Mapbox, or similar
    const suggestions = await mockAddressAutocomplete(query);
    
    res.json({ suggestions });
  } catch (error) {
    console.error('Address autocomplete error:', error);
    res.status(500).json({ error: 'Address lookup failed' });
  }
});

// Property value estimation endpoint
router.post('/property-value', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Address is required' 
      });
    }

    // Mock property value estimation
    // In production, you would use Zillow API, RentSpider, or similar
    const valueData = await mockPropertyValue(address);
    
    res.json(valueData);
  } catch (error) {
    console.error('Property value error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Property value lookup failed' 
    });
  }
});

// Mock address autocomplete function
// Replace this with actual API integration
async function mockAddressAutocomplete(query) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Mock suggestions based on query
  const mockSuggestions = [
    {
      formatted_address: `${query} Main St, San Francisco, CA 94102`,
      street_address: `${query} Main St`,
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94102',
      county: 'San Francisco County'
    },
    {
      formatted_address: `${query} Oak Ave, Oakland, CA 94610`,
      street_address: `${query} Oak Ave`,
      city: 'Oakland',
      state: 'CA',
      zip_code: '94610',
      county: 'Alameda County'
    },
    {
      formatted_address: `${query} Pine St, Berkeley, CA 94704`,
      street_address: `${query} Pine St`,
      city: 'Berkeley',
      state: 'CA',
      zip_code: '94704',
      county: 'Alameda County'
    }
  ];
  
  return mockSuggestions.slice(0, 3); // Return top 3 suggestions
}

// Mock property value estimation function
// Replace this with actual API integration
async function mockPropertyValue(address) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Generate a mock property value based on address
  const baseValue = 500000;
  const randomFactor = 0.8 + (Math.random() * 0.4); // 80% to 120% of base
  const estimatedValue = Math.round(baseValue * randomFactor);
  
  return {
    success: true,
    value: estimatedValue,
    source: 'Mock Real Estate API',
    confidence: 'Medium',
    lastUpdated: new Date().toISOString()
  };
}

module.exports = router;

/* 
PRODUCTION API INTEGRATION NOTES:

1. GOOGLE PLACES API (Address Autocomplete):
   - Get API key from Google Cloud Console
   - Enable Places API
   - Replace mockAddressAutocomplete with:
   
   const response = await fetch(
     `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=address&key=${process.env.GOOGLE_PLACES_API_KEY}`
   );

2. PROPERTY VALUE APIS:
   - Zillow's official API was discontinued, but alternatives exist:
   - RentSpider API: https://www.rentspider.com/
   - Attom Data: https://www.attomdata.com/
   - RapidAPI Real Estate services
   
   Example with RapidAPI:
   const response = await fetch('https://zillow-com1.p.rapidapi.com/propertyExtendedSearch', {
     method: 'GET',
     headers: {
       'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
       'X-RapidAPI-Host': 'zillow-com1.p.rapidapi.com'
     }
   });

3. ENVIRONMENT VARIABLES TO ADD:
   - GOOGLE_PLACES_API_KEY=your_google_api_key
   - RAPIDAPI_KEY=your_rapidapi_key
   - Or other API keys as needed

4. FREE ALTERNATIVES:
   - OpenStreetMap Nominatim (for addresses)
   - County assessor APIs (for property values)
   - Custom web scraping (check terms of service)
*/


