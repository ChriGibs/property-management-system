const express = require('express');
const { Lease, Tenant, Invoice } = require('../../models');

const router = express.Router();

router.get('/', async (req, res) => {
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

router.get('/:id', async (req, res) => {
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
    const { computePaidMapForInvoices } = require('../../services/paymentService');
    const paidMap = await computePaidMapForInvoices(invoiceIds);
    invoices.forEach(inv => { inv.paidAmount = paidMap[inv.id] || 0; });
    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.rentAmount || 0) + parseFloat(inv.lateFeeAmount || 0) + parseFloat(inv.otherCharges || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount || 0), 0);
    const outstanding = totalInvoiced - totalPaid;

    const tenants = [lease.tenant1, lease.tenant2, lease.tenant3, lease.tenant4].filter(Boolean);

    res.json({ data: { lease, property: lease.property, tenants, invoices, payments: [], totals: { totalInvoiced, totalPaid, outstanding } } });
  } catch (error) {
    console.error('API lease detail error:', error);
    res.status(500).json({ error: 'Failed to load lease detail' });
  }
});

router.post('/', async (req, res) => {
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

router.put('/:id', async (req, res) => {
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

module.exports = router;


