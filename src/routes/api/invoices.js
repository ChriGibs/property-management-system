const express = require('express');
const { Invoice, Payment, PaymentAllocation } = require('../../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const invoices = await Invoice.findAll({ order: [['invoiceDate', 'DESC']], limit, offset });
    const invoiceIds = invoices.map(i => i.id);
    const { computePaidMapForInvoices } = require('../../services/paymentService');
    const paidMap = await computePaidMapForInvoices(invoiceIds);
    invoices.forEach(inv => { inv.paidAmount = paidMap[inv.id] || 0; });
    res.json({ data: invoices });
  } catch (error) {
    console.error('API invoices list error:', error);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { computeInvoiceTotals } = require('../../services/paymentService');
    const result = await computeInvoiceTotals(id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    const { invoice, totals } = result;
    const legacyPayments = await Payment.findAll({ where: { invoiceId: id }, order: [['paymentDate', 'DESC']] });
    const allocations = await PaymentAllocation.findAll({ where: { invoiceId: id }, include: [{ model: Payment, as: 'payment' }], order: [['createdAt', 'DESC']] });
    res.json({ data: { invoice, legacyPayments, allocations, totals } });
  } catch (error) {
    console.error('API invoice detail error:', error);
    res.status(500).json({ error: 'Failed to load invoice' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const invoiceNumber = payload.invoiceNumber || require('../../models/Invoice').generateInvoiceNumber();
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

router.put('/:id', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
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

module.exports = router;


