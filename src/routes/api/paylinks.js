const express = require('express');
const { Invoice, PaymentRequest, Payment, PaymentAllocation } = require('../../models');
const stripeLib = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const router = express.Router();

router.post('/', async (req, res) => {
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
          return { price_data: { currency: 'usd', product_data: { name, description }, unit_amount: Math.round(parseFloat(a.amount) * 100) }, quantity: 1 };
        }).filter(li => li.price_data.unit_amount > 0);

        const session = await stripeLib.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items,
          success_url: `${APP_BASE_URL}/mock-stripe-checkout?paymentRequestId=${pr.id}&status=success`,
          cancel_url: `${APP_BASE_URL}/mock-stripe-checkout?paymentRequestId=${pr.id}&status=cancel`,
          metadata: { paymentRequestId: String(pr.id), allocationsJson: JSON.stringify(allocations) }
        });

        pr.stripeCheckoutSessionId = session.id;
        pr.lastUrl = session.url || url;
        await pr.save();
        url = session.url || url;
      } catch (e) { /* ignore */ }
    }
    if (!pr.lastUrl) { pr.lastUrl = url; await pr.save(); }
    res.status(201).json({ data: { paymentRequest: pr, url } });
  } catch (error) {
    console.error('API paylinks create error:', error);
    res.status(500).json({ error: 'Failed to create paylink' });
  }
});

router.get('/', async (req, res) => {
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

router.post('/:id/mock-complete', async (req, res) => {
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
    const payment = await Payment.create({ invoiceId: mainInvoiceId, amount: total, paymentDate: new Date(), paymentMethod: 'online', status: 'completed', description: `Mock payment for request ${pr.id}` });
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

router.get('/:id', async (req, res) => {
  try {
    const pr = await PaymentRequest.findByPk(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Not found' });
    res.json({ data: pr });
  } catch (error) {
    console.error('API paylinks detail error:', error);
    res.status(500).json({ error: 'Failed to load paylink' });
  }
});

module.exports = router;


