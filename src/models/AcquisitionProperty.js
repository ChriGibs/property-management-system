const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AcquisitionProperty = sequelize.define('AcquisitionProperty', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  status: { type: DataTypes.ENUM('new','screening','contacted','offer-prep','offer-sent','under-contract','won','lost'), defaultValue: 'new' },
  source: { type: DataTypes.ENUM('manual-upload','web-scrape','referral','mls','other'), defaultValue: 'manual-upload' },
  headline: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true },
  state: { type: DataTypes.STRING, allowNull: true },
  zipCode: { type: DataTypes.STRING, allowNull: true },
  county: { type: DataTypes.STRING, allowNull: true },
  propertyType: { type: DataTypes.ENUM('single-family','apartment','condo','townhouse','duplex','other'), allowNull: true },
  bedrooms: { type: DataTypes.INTEGER, allowNull: true },
  bathrooms: { type: DataTypes.DECIMAL(3, 1), allowNull: true },
  squareFootage: { type: DataTypes.INTEGER, allowNull: true },
  yearBuilt: { type: DataTypes.INTEGER, allowNull: true },
  listedPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  url: { type: DataTypes.TEXT, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  aiScore: { type: DataTypes.INTEGER, allowNull: true },
  aiSummary: { type: DataTypes.TEXT, allowNull: true },
  underwriting: { type: DataTypes.JSONB, allowNull: true },
  computedMetrics: { type: DataTypes.JSONB, allowNull: true },
  tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
  lastEvaluatedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'acquisition_properties',
  timestamps: true
});

module.exports = AcquisitionProperty;


