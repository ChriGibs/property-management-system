const express = require('express');
const { Payment, PaymentAllocation, Invoice } = require('../../models');

const router = express.Router();

router.get('/', async (req, res) => {
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

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payment = await Payment.findByPk(id, {
      include: [
        { model: PaymentAllocation, as: 'allocations', include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNumber', 'dueDate'] }] },
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

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const allocations = Array.isArray(payload.allocations) ? payload.allocations : null;
    if (!allocations && !payload.invoiceId) {
      return res.status(400).json({ error: 'invoiceId or allocations[] required' });
    }
    const amountFromAlloc = allocations ? allocations.reduce((s, a) => s + parseFloat(a.amount || 0), 0) : null;
    const paymentAmount = amountFromAlloc != null ? amountFromAlloc : parseFloat(payload.amount || 0);
    if (allocations) {
      const { applyPaymentWithAllocations } = require('../../services/paymentService');
      const payment = await applyPaymentWithAllocations({ allocations, amount: paymentAmount, paymentFields: payload });
      const withAllocations = await Payment.findByPk(payment.id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
      return res.status(201).json({ data: withAllocations });
    } else {
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

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payload = req.body || {};
    const payment = await Payment.findByPk(id);
    if (!payment) return res.status(404).json({ error: 'Not found' });
    const updatable = {
      paymentDate: payload.paymentDate || payment.paymentDate,
      paymentMethod: payload.paymentMethod || payment.paymentMethod,
      status: payload.status || payment.status,
      description: payload.description ?? payment.description,
      notes: payload.notes ?? payment.notes,
      processingFee: payload.processingFee ?? payment.processingFee
    };
    await payment.update(updatable);
    if (Array.isArray(payload.allocations)) {
      await PaymentAllocation.destroy({ where: { paymentId: id } });
      const rows = payload.allocations.filter(a => a && a.invoiceId && parseFloat(a.amount || 0) > 0).map(a => ({ paymentId: id, invoiceId: parseInt(a.invoiceId), amount: parseFloat(a.amount) }));
      if (rows.length) await PaymentAllocation.bulkCreate(rows);
    }
    const result = await Payment.findByPk(id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
    res.json({ data: result });
  } catch (error) {
    console.error('API payment update error:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

router.delete('/:id', async (req, res) => {
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

module.exports = router;


