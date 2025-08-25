const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentRequest = sequelize.define('PaymentRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  leaseId: { type: DataTypes.INTEGER, allowNull: true },
  primaryTenantId: { type: DataTypes.INTEGER, allowNull: true },
  amountTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'usd' },
  deliveryMethod: { type: DataTypes.ENUM('email','sms','link','email+sms'), allowNull: false, defaultValue: 'link' },
  toEmail: { type: DataTypes.STRING, allowNull: true },
  toPhone: { type: DataTypes.STRING, allowNull: true },
  message: { type: DataTypes.TEXT, allowNull: true },
  stripeCustomerId: { type: DataTypes.STRING, allowNull: true },
  stripeCheckoutSessionId: { type: DataTypes.STRING, allowNull: true },
  stripePaymentIntentId: { type: DataTypes.STRING, allowNull: true },
  lastUrl: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('draft','sent','completed','failed','expired','cancelled'), allowNull: false, defaultValue: 'sent' },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'payment_requests',
  timestamps: true,
  indexes: [
    { fields: ['leaseId'] },
    { fields: ['primaryTenantId'] },
    { fields: ['status'] },
    { fields: ['stripeCheckoutSessionId'] },
    { fields: ['stripePaymentIntentId'] },
  ]
});

module.exports = PaymentRequest;


