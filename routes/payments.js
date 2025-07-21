const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Payment, Invoice, Lease, Property, Tenant } = require('../models');

router.use(requireAuth);

// GET /payments - List all payments
router.get('/', async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [
        {
          model: Invoice,
          as: 'invoice',
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
        }
      ],
      order: [['paymentDate', 'DESC']]
    });

    res.render('payments/index', {
      title: 'Payments',
      payments
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    req.flash('error', 'Error loading payments');
    res.redirect('/dashboard');
  }
});

// GET /payments/new - New payment form
router.get('/new', async (req, res) => {
  try {
    const { invoice: invoiceId, lease: leaseId } = req.query;
    
    let invoices = [];
    let selectedInvoice = null;

    if (invoiceId) {
      // Direct invoice selection
      selectedInvoice = await Invoice.findByPk(invoiceId, {
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
      
      if (selectedInvoice) {
        invoices = [selectedInvoice];
      }
    } else if (leaseId) {
      // Show invoices for a specific lease
      invoices = await Invoice.findAll({
        where: { 
          leaseId: leaseId,
          status: ['sent', 'partially_paid', 'overdue']
        },
        include: [
          {
            model: Lease,
            as: 'lease',
            include: [
              { model: Property, as: 'property' },
              { model: Tenant, as: 'tenant1' }
            ]
          }
        ],
        order: [['dueDate', 'ASC']]
      });
    } else {
      // Show all unpaid invoices
      invoices = await Invoice.findAll({
        where: { 
          status: ['sent', 'partially_paid', 'overdue']
        },
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
        ],
        order: [['dueDate', 'ASC']]
      });
    }

    // Calculate remaining balance for each invoice
    const invoicesWithBalance = await Promise.all(
      invoices.map(async (invoice) => {
        const totalPaid = await Payment.getTotalPaidForInvoice(invoice.id);
        return {
          ...invoice.toJSON(),
          totalPaid,
          balanceAmount: invoice.totalAmount - totalPaid
        };
      })
    );

    res.render('payments/new', {
      title: 'Record Payment',
      invoices: invoicesWithBalance,
      selectedInvoice
    });
  } catch (error) {
    console.error('Error loading new payment form:', error);
    req.flash('error', 'Error loading form');
    res.redirect('/payments');
  }
});

// POST /payments - Create new payment
router.post('/', async (req, res) => {
  try {
    const {
      invoiceId,
      amount,
      paymentDate,
      paymentMethod,
      transactionId,
      checkNumber,
      description,
      notes
    } = req.body;

    if (!invoiceId || !amount || parseFloat(amount) <= 0) {
      req.flash('error', 'Please select an invoice and enter a valid payment amount');
      return res.redirect('/payments/new');
    }

    // Verify invoice exists and get current balance
    const invoice = await Invoice.findByPk(invoiceId);
    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/payments/new');
    }

    const totalPaid = await Payment.getTotalPaidForInvoice(invoiceId);
    const remainingBalance = invoice.totalAmount - totalPaid;

    if (parseFloat(amount) > remainingBalance) {
      req.flash('error', `Payment amount ($${amount}) exceeds remaining balance ($${remainingBalance.toFixed(2)})`);
      return res.redirect(`/payments/new?invoice=${invoiceId}`);
    }

    const payment = await Payment.create({
      invoiceId,
      amount: parseFloat(amount),
      paymentDate: paymentDate || new Date(),
      paymentMethod,
      transactionId,
      checkNumber,
      description,
      notes,
      status: 'completed' // Auto-mark as completed for manual entries
    });

    // Update invoice status based on payment
    const newTotalPaid = totalPaid + parseFloat(amount);
    if (newTotalPaid >= invoice.totalAmount) {
      await invoice.update({ 
        status: 'paid',
        paidDate: new Date(),
        paidAmount: newTotalPaid 
      });
    } else {
      await invoice.update({ 
        status: 'partially_paid',
        paidAmount: newTotalPaid 
      });
    }

    req.flash('success', 'Payment recorded successfully');
    res.redirect(`/payments/${payment.id}`);
  } catch (error) {
    console.error('Error creating payment:', error);
    req.flash('error', 'Error recording payment: ' + error.message);
    res.redirect('/payments/new');
  }
});

// GET /payments/:id - Show payment details
router.get('/:id', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        {
          model: Invoice,
          as: 'invoice',
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
            }
          ]
        }
      ]
    });

    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    res.render('payments/show', {
      title: `Payment ${payment.id}`,
      payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    req.flash('error', 'Error loading payment');
    res.redirect('/payments');
  }
});

// GET /payments/:id/edit - Edit payment form
router.get('/:id/edit', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        {
          model: Invoice,
          as: 'invoice',
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
        }
      ]
    });

    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    // Get other unpaid invoices in case user wants to change assignment
    const invoices = await Invoice.findAll({
      where: { 
        status: ['sent', 'partially_paid', 'overdue']
      },
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
      ],
      order: [['dueDate', 'ASC']]
    });

    res.render('payments/edit', {
      title: `Edit Payment ${payment.id}`,
      payment,
      invoices
    });
  } catch (error) {
    console.error('Error loading edit form:', error);
    req.flash('error', 'Error loading form');
    res.redirect('/payments');
  }
});

// PUT /payments/:id - Update payment
router.put('/:id', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Invoice, as: 'invoice' }]
    });
    
    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    const {
      amount,
      paymentDate,
      paymentMethod,
      transactionId,
      checkNumber,
      status,
      description,
      notes
    } = req.body;

    const oldAmount = parseFloat(payment.amount);
    const newAmount = parseFloat(amount);

    await payment.update({
      amount: newAmount,
      paymentDate,
      paymentMethod,
      transactionId,
      checkNumber,
      status,
      description,
      notes
    });

    // Update invoice paid amount if payment amount changed
    if (oldAmount !== newAmount && payment.invoice) {
      const currentPaidAmount = parseFloat(payment.invoice.paidAmount || 0);
      const adjustedPaidAmount = currentPaidAmount - oldAmount + newAmount;
      
      let newStatus = 'partially_paid';
      if (adjustedPaidAmount >= payment.invoice.totalAmount) {
        newStatus = 'paid';
      } else if (adjustedPaidAmount <= 0) {
        newStatus = 'sent';
      }

      await payment.invoice.update({
        paidAmount: adjustedPaidAmount,
        status: newStatus,
        paidDate: newStatus === 'paid' ? new Date() : null
      });
    }

    req.flash('success', 'Payment updated successfully');
    res.redirect(`/payments/${payment.id}`);
  } catch (error) {
    console.error('Error updating payment:', error);
    req.flash('error', 'Error updating payment: ' + error.message);
    res.redirect(`/payments/${req.params.id}/edit`);
  }
});

// DELETE /payments/:id - Delete payment
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Invoice, as: 'invoice' }]
    });
    
    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    const paymentAmount = parseFloat(payment.amount);
    const invoice = payment.invoice;

    await payment.destroy();

    // Update invoice status after payment deletion
    if (invoice) {
      const currentPaidAmount = parseFloat(invoice.paidAmount || 0);
      const newPaidAmount = Math.max(0, currentPaidAmount - paymentAmount);
      
      let newStatus = 'sent';
      if (newPaidAmount > 0 && newPaidAmount < invoice.totalAmount) {
        newStatus = 'partially_paid';
      } else if (newPaidAmount >= invoice.totalAmount) {
        newStatus = 'paid';
      }

      await invoice.update({
        paidAmount: newPaidAmount,
        status: newStatus,
        paidDate: newStatus === 'paid' ? new Date() : null
      });
    }

    req.flash('success', 'Payment deleted successfully');
    res.redirect('/payments');
  } catch (error) {
    console.error('Error deleting payment:', error);
    req.flash('error', 'Error deleting payment');
    res.redirect('/payments');
  }
});

// POST /payments/:id/refund - Process refund
router.post('/:id/refund', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Invoice, as: 'invoice' }]
    });
    
    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    const { refundAmount } = req.body;
    const amount = refundAmount ? parseFloat(refundAmount) : payment.amount;

    await payment.processRefund(amount);

    // Update invoice status
    if (payment.invoice) {
      const currentPaidAmount = parseFloat(payment.invoice.paidAmount || 0);
      const newPaidAmount = Math.max(0, currentPaidAmount - amount);
      
      let newStatus = 'sent';
      if (newPaidAmount > 0 && newPaidAmount < payment.invoice.totalAmount) {
        newStatus = 'partially_paid';
      }

      await payment.invoice.update({
        paidAmount: newPaidAmount,
        status: newStatus,
        paidDate: null
      });
    }

    req.flash('success', 'Payment refunded successfully');
    res.redirect(`/payments/${payment.id}`);
  } catch (error) {
    console.error('Error processing refund:', error);
    req.flash('error', 'Error processing refund');
    res.redirect(`/payments/${req.params.id}`);
  }
});

module.exports = router; 