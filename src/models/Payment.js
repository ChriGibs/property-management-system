const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  invoiceId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'invoices', key: 'id' } },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0.01 } },
  paymentDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  paymentMethod: { type: DataTypes.ENUM('credit_card','bank_transfer','check','cash','money_order','online'), allowNull: false },
  transactionId: { type: DataTypes.STRING, allowNull: true, comment: 'External payment processor transaction ID (e.g., Stripe)' },
  checkNumber: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('pending','completed','failed','refunded','cancelled'), defaultValue: 'pending' },
  processingFee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00, comment: 'Fee charged by payment processor' },
  netAmount: { type: DataTypes.VIRTUAL, get() { return parseFloat(this.amount || 0) - parseFloat(this.processingFee || 0);} },
  description: { type: DataTypes.STRING, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  processedAt: { type: DataTypes.DATE, allowNull: true },
  refundedAt: { type: DataTypes.DATE, allowNull: true },
  refundAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }
}, {
  tableName: 'payments',
  timestamps: true,
  indexes: [ { fields: ['invoiceId'] }, { fields: ['transactionId'] }, { fields: ['status'] }, { fields: ['paymentDate'] } ]
});

Payment.prototype.markAsCompleted = async function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return await this.save();
};

Payment.prototype.processRefund = async function(refundAmount = null) {
  const amount = refundAmount || this.amount;
  this.refundAmount = amount;
  this.refundedAt = new Date();
  this.status = 'refunded';
  return await this.save();
};

Payment.getTotalPaidForInvoice = async function(invoiceId) {
  const result = await Payment.sum('amount', { where: { invoiceId: invoiceId, status: 'completed' } });
  return result || 0;
};

Payment.getPaymentHistoryForInvoice = async function(invoiceId) {
  return await Payment.findAll({ where: { invoiceId }, order: [['paymentDate', 'DESC']] });
};

module.exports = Payment;


