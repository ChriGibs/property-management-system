const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Invoice, Payment, Lease, Property, Tenant } = require('../models');

router.use(requireAuth);

// GET /invoices - List all invoices
router.get('/', async (req, res) => {
  try {
    const invoices = await Invoice.findAll({
      include: [
        {
          model: Lease,
          as: 'lease',
          required: false,
          include: [
            { model: Property, as: 'property' },
            { model: Tenant, as: 'tenant1' }
          ]
        },
        {
          model: Payment,
          as: 'payments',
          required: false
        }
      ],
      order: [['invoiceDate', 'DESC']]
    });

    // Calculate payment totals for each invoice
    const invoicesWithTotals = invoices.map(invoice => {
      const payments = invoice.payments || [];
      const totalPaid = payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      
      return {
        ...invoice.toJSON(),
        totalPaid,
        balanceAmount: invoice.totalAmount - totalPaid
      };
    });

    res.render('invoices/index', {
      title: 'Invoices',
      invoices: invoicesWithTotals
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    req.flash('error', 'Error loading invoices');
    res.redirect('/dashboard');
  }
});

// GET /invoices/new - New invoice form
router.get('/new', async (req, res) => {
  try {
    const { lease: leaseId } = req.query;
    
    const leases = await Lease.findAll({
      where: { status: 'active' },
      include: [
        { model: Property, as: 'property' },
        { model: Tenant, as: 'tenant1' }
      ],
      order: [['startDate', 'DESC']]
    });

    let selectedLease = null;
    if (leaseId) {
      selectedLease = await Lease.findByPk(leaseId, {
        include: [
          { model: Property, as: 'property' },
          { model: Tenant, as: 'tenant1' }
        ]
      });
    }

    res.render('invoices/new', {
      title: 'Create Invoice',
      leases,
      selectedLease
    });
  } catch (error) {
    console.error('Error loading new invoice form:', error);
    req.flash('error', 'Error loading form');
    res.redirect('/invoices');
  }
});

// POST /invoices - Create new invoice
router.post('/', async (req, res) => {
  try {
    const {
      leaseId,
      invoiceDate,
      dueDate,
      periodStart,
      periodEnd,
      rentAmount,
      lateFeeAmount,
      otherCharges,
      otherChargesDescription,
      notes
    } = req.body;

    // Generate unique invoice number
    const invoiceNumber = Invoice.generateInvoiceNumber();

    // Calculate total amount
    const total = parseFloat(rentAmount || 0) + 
                  parseFloat(lateFeeAmount || 0) + 
                  parseFloat(otherCharges || 0);

    const invoice = await Invoice.create({
      leaseId: leaseId || null,
      invoiceNumber,
      invoiceDate: invoiceDate || new Date(),
      dueDate,
      periodStart,
      periodEnd,
      rentAmount: rentAmount || 0,
      lateFeeAmount: lateFeeAmount || 0,
      otherCharges: otherCharges || 0,
      otherChargesDescription,
      notes,
      status: 'draft'
    });

    req.flash('success', 'Invoice created successfully');
    res.redirect(`/invoices/${invoice.id}`);
  } catch (error) {
    console.error('Error creating invoice:', error);
    req.flash('error', 'Error creating invoice: ' + error.message);
    res.redirect('/invoices/new');
  }
});

// GET /invoices/:id - Show invoice details
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [
        {
          model: Lease,
          as: 'lease',
          required: false,
          include: [
            { model: Property, as: 'property' },
            { model: Tenant, as: 'tenant1' },
            { model: Tenant, as: 'tenant2', required: false },
            { model: Tenant, as: 'tenant3', required: false },
            { model: Tenant, as: 'tenant4', required: false }
          ]
        },
        {
          model: Payment,
          as: 'payments',
          order: [['paymentDate', 'DESC']]
        }
      ]
    });

    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/invoices');
    }

    // Calculate payment totals
    const payments = invoice.payments || [];
    const totalPaid = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    const invoiceData = {
      ...invoice.toJSON(),
      totalPaid,
      balanceAmount: invoice.totalAmount - totalPaid,
      isOverdue: invoice.isOverdue()
    };

    res.render('invoices/show', {
      title: `Invoice ${invoice.invoiceNumber}`,
      invoice: invoiceData
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    req.flash('error', 'Error loading invoice');
    res.redirect('/invoices');
  }
});

// GET /invoices/:id/edit - Edit invoice form
router.get('/:id/edit', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [
        {
          model: Lease,
          as: 'lease',
          required: false,
          include: [
            { model: Property, as: 'property' },
            { model: Tenant, as: 'tenant1' }
          ]
        }
      ]
    });

    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/invoices');
    }

    const leases = await Lease.findAll({
      where: { status: 'active' },
      include: [
        { model: Property, as: 'property' },
        { model: Tenant, as: 'tenant1' }
      ],
      order: [['startDate', 'DESC']]
    });

    res.render('invoices/edit', {
      title: `Edit Invoice ${invoice.invoiceNumber}`,
      invoice,
      leases
    });
  } catch (error) {
    console.error('Error loading edit form:', error);
    req.flash('error', 'Error loading form');
    res.redirect('/invoices');
  }
});

// PUT /invoices/:id - Update invoice
router.put('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/invoices');
    }

    const {
      leaseId,
      invoiceDate,
      dueDate,
      periodStart,
      periodEnd,
      rentAmount,
      lateFeeAmount,
      otherCharges,
      otherChargesDescription,
      status,
      notes
    } = req.body;

    await invoice.update({
      leaseId: leaseId || null,
      invoiceDate,
      dueDate,
      periodStart,
      periodEnd,
      rentAmount: rentAmount || 0,
      lateFeeAmount: lateFeeAmount || 0,
      otherCharges: otherCharges || 0,
      otherChargesDescription,
      status,
      notes
    });

    req.flash('success', 'Invoice updated successfully');
    res.redirect(`/invoices/${invoice.id}`);
  } catch (error) {
    console.error('Error updating invoice:', error);
    req.flash('error', 'Error updating invoice: ' + error.message);
    res.redirect(`/invoices/${req.params.id}/edit`);
  }
});

// DELETE /invoices/:id - Delete invoice
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [{ model: Payment, as: 'payments' }]
    });
    
    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/invoices');
    }

    // Check if invoice has payments
    if (invoice.payments && invoice.payments.length > 0) {
      req.flash('error', 'Cannot delete invoice that has payments. Please delete payments first.');
      return res.redirect(`/invoices/${invoice.id}`);
    }

    await invoice.destroy();
    req.flash('success', 'Invoice deleted successfully');
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error deleting invoice:', error);
    req.flash('error', 'Error deleting invoice');
    res.redirect('/invoices');
  }
});

// POST /invoices/:id/send - Mark invoice as sent
router.post('/:id/send', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/invoices');
    }

    await invoice.update({
      status: 'sent',
      sentDate: new Date()
    });

    req.flash('success', 'Invoice marked as sent');
    res.redirect(`/invoices/${invoice.id}`);
  } catch (error) {
    console.error('Error sending invoice:', error);
    req.flash('error', 'Error sending invoice');
    res.redirect(`/invoices/${req.params.id}`);
  }
});

// POST /invoices/:id/mark-paid - Quick mark as paid
router.post('/:id/mark-paid', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/invoices');
    }

    await invoice.markAsPaid();
    req.flash('success', 'Invoice marked as paid');
    res.redirect(`/invoices/${invoice.id}`);
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    req.flash('error', 'Error updating invoice');
    res.redirect(`/invoices/${req.params.id}`);
  }
});

module.exports = router; 