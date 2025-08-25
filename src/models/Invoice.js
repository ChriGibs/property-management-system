const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  leaseId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'leases', key: 'id' } },
  invoiceNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  invoiceDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  dueDate: { type: DataTypes.DATE, allowNull: false },
  periodStart: { type: DataTypes.DATE, allowNull: false },
  periodEnd: { type: DataTypes.DATE, allowNull: false },
  rentAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  lateFeeAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  otherCharges: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  otherChargesDescription: { type: DataTypes.TEXT, allowNull: true },
  totalAmount: { type: DataTypes.VIRTUAL, get() { return parseFloat(this.rentAmount || 0) + parseFloat(this.lateFeeAmount || 0) + parseFloat(this.otherCharges || 0);} },
  paidAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  balanceAmount: { type: DataTypes.VIRTUAL, get() { return this.totalAmount - parseFloat(this.paidAmount || 0);} },
  status: { type: DataTypes.ENUM('draft','sent','paid','partially_paid','overdue','cancelled'), defaultValue: 'draft' },
  sentDate: { type: DataTypes.DATE, allowNull: true },
  paidDate: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'invoices',
  timestamps: true,
  indexes: [ { fields: ['leaseId'] }, { fields: ['invoiceNumber'] }, { fields: ['status'] }, { fields: ['dueDate'] } ]
});

Invoice.prototype.isOverdue = function() {
  return this.status !== 'paid' && this.status !== 'cancelled' && new Date() > this.dueDate;
};

Invoice.prototype.markAsPaid = async function(paidAmount = null) {
  const amount = paidAmount || this.totalAmount;
  this.paidAmount = amount;
  this.paidDate = new Date();
  if (amount >= this.totalAmount) this.status = 'paid';
  else if (amount > 0) this.status = 'partially_paid';
  return await this.save();
};

Invoice.generateInvoiceNumber = function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const timestamp = Date.now().toString().slice(-6);
  return `INV-${year}${month}-${timestamp}`;
};

module.exports = Invoice;


