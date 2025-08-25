const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProspectActivity = sequelize.define('ProspectActivity', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  prospectTenantId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'prospect_tenants', key: 'id' } },
  type: { type: DataTypes.ENUM('note','call','email','meeting','status-change'), allowNull: false, defaultValue: 'note' },
  direction: { type: DataTypes.ENUM('inbound','outbound'), allowNull: true },
  channel: { type: DataTypes.ENUM('phone','email','sms','in-person','system'), allowNull: true },
  subject: { type: DataTypes.STRING, allowNull: true },
  body: { type: DataTypes.TEXT, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  occurredAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'prospect_activities',
  timestamps: true
});

module.exports = ProspectActivity;


