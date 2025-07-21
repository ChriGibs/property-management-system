const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Property = sequelize.define('Property', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false
  },
  zipCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  county: {
    type: DataTypes.STRING,
    allowNull: true
  },
  propertyType: {
    type: DataTypes.ENUM('single-family', 'apartment', 'condo', 'townhouse', 'duplex', 'other'),
    defaultValue: 'single-family'
  },
  bedrooms: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  bathrooms: {
    type: DataTypes.DECIMAL(3, 1),
    defaultValue: 1.0
  },
  squareFootage: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  purchasePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  currentValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  currentValueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when current value was last updated'
  },
  purchaseDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  activeLeaseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'leases',
      key: 'id'
    },
    comment: 'Reference to the currently active lease for this property'
  }
}, {
  tableName: 'properties',
  timestamps: true
});

module.exports = Property; 