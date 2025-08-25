const { sequelize, Invoice, Payment, PaymentAllocation } = require('../models');

function toNumber(val) { return parseFloat(val || 0); }

async function computeInvoiceTotals(invoiceId) {
  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) return null;
  const total = toNumber(invoice.rentAmount) + toNumber(invoice.lateFeeAmount) + toNumber(invoice.otherCharges);

  // Legacy direct payments
  const legacy = await Payment.findAll({ where: { invoiceId: invoiceId } });
  const legacyPaid = legacy.filter(p => p.status === 'completed').reduce((s, p) => s + toNumber(p.amount), 0);

  // Allocations to this invoice
  const allocs = await PaymentAllocation.findAll({ where: { invoiceId: invoiceId }, include: [{ model: Payment, as: 'payment' }] });
  const allocPaid = allocs.filter(a => a.payment && a.payment.status === 'completed').reduce((s, a) => s + toNumber(a.amount), 0);

  const totalPaid = legacyPaid + allocPaid;
  return { invoice, totals: { total, totalPaid, outstanding: Math.max(0, total - totalPaid) } };
}

async function computePaidMapForInvoices(invoiceIds) {
  if (!Array.isArray(invoiceIds) || !invoiceIds.length) return {};
  const payments = await Payment.findAll({ where: { invoiceId: invoiceIds } });
  const allocations = await PaymentAllocation.findAll({ where: { invoiceId: invoiceIds }, include: [{ model: Payment, as: 'payment' }] });

  const legacyPaidByInvoice = payments.filter(p => p.status === 'completed').reduce((m, p) => { m[p.invoiceId] = (m[p.invoiceId] || 0) + toNumber(p.amount); return m; }, {});
  const allocPaidByInvoice = allocations.filter(a => a.payment && a.payment.status === 'completed').reduce((m, a) => { m[a.invoiceId] = (m[a.invoiceId] || 0) + toNumber(a.amount); return m; }, {});

  const result = {};
  for (const id of invoiceIds) {
    result[id] = (legacyPaidByInvoice[id] || 0) + (allocPaidByInvoice[id] || 0);
  }
  return result;
}

module.exports = { computeInvoiceTotals, computePaidMapForInvoices };

async function applyPaymentWithAllocations({
  allocations,
  amount,
  paymentFields = {}
}) {
  return await sequelize.transaction(async (t) => {
    // Create the payment row first
    const payment = await Payment.create({
      invoiceId: allocations && allocations.length ? parseInt(allocations[0].invoiceId) : null,
      amount,
      paymentDate: paymentFields.paymentDate || new Date(),
      paymentMethod: paymentFields.paymentMethod || 'online',
      transactionId: paymentFields.transactionId || null,
      checkNumber: paymentFields.checkNumber || null,
      status: paymentFields.status || 'completed',
      processingFee: paymentFields.processingFee || 0,
      description: paymentFields.description || null,
      notes: paymentFields.notes || null
    }, { transaction: t });

    if (Array.isArray(allocations) && allocations.length) {
      const rows = allocations
        .filter(a => a && a.invoiceId && parseFloat(a.amount || 0) > 0)
        .map(a => ({ paymentId: payment.id, invoiceId: parseInt(a.invoiceId), amount: parseFloat(a.amount) }));
      if (rows.length) await PaymentAllocation.bulkCreate(rows, { transaction: t });
    }
    return payment;
  });
}

module.exports.applyPaymentWithAllocations = applyPaymentWithAllocations;


