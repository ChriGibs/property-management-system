const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Tenant = sequelize.define('Tenant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  firstName: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
  lastName: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
  email: { type: DataTypes.STRING, allowNull: true, unique: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING, allowNull: true },
  password: { type: DataTypes.STRING, allowNull: true },
  emergencyContactName: { type: DataTypes.STRING, allowNull: true },
  emergencyContactPhone: { type: DataTypes.STRING, allowNull: true },
  employerName: { type: DataTypes.STRING, allowNull: true },
  monthlyIncome: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'tenants',
  timestamps: true,
  hooks: {
    beforeValidate: (tenant) => {
      const hasEmail = tenant.email && String(tenant.email).trim().length > 0;
      const hasPhone = tenant.phone && String(tenant.phone).trim().length > 0;
      if (!hasEmail && !hasPhone) {
        throw new Error('Either email or phone is required');
      }
    },
    beforeCreate: async (tenant) => { if (tenant.password) { tenant.password = await bcrypt.hash(tenant.password, 10); } },
    beforeUpdate: async (tenant) => { if (tenant.changed('password')) { tenant.password = await bcrypt.hash(tenant.password, 10); } }
  }
});

Tenant.prototype.validatePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

Tenant.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

module.exports = Tenant;


