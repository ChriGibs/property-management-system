const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  firstName: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
  lastName: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'manager'), defaultValue: 'manager' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => { if (user.password) { user.password = await bcrypt.hash(user.password, 10); } },
    beforeUpdate: async (user) => { if (user.changed('password')) { user.password = await bcrypt.hash(user.password, 10); } }
  }
});

User.prototype.validatePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

User.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

module.exports = User;


