const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentAllocation = sequelize.define('PaymentAllocation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paymentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'payments', key: 'id' } },
  invoiceId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'invoices', key: 'id' } },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0.01 } }
}, {
  tableName: 'payment_allocations',
  timestamps: true,
  indexes: [ { fields: ['paymentId'] }, { fields: ['invoiceId'] } ]
});

module.exports = PaymentAllocation;


