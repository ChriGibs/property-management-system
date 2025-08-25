const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProspectTenant = sequelize.define('ProspectTenant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING, allowNull: true },
  stage: { type: DataTypes.ENUM('lead','pre-screen','application','screening','approved','waitlist','rejected','converted'), defaultValue: 'lead' },
  source: { type: DataTypes.ENUM('website','referral','inbound-call','listing-portal','other'), defaultValue: 'website' },
  interestedPropertyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'properties', key: 'id' } },
  notes: { type: DataTypes.TEXT, allowNull: true },
  applicationUrlToken: { type: DataTypes.STRING, allowNull: true },
  screening: { type: DataTypes.JSONB, allowNull: true },
  communicationPrefs: { type: DataTypes.JSONB, allowNull: true },
  aiRiskScore: { type: DataTypes.INTEGER, allowNull: true },
  aiSummary: { type: DataTypes.TEXT, allowNull: true },
  marketingAttribution: { type: DataTypes.JSONB, allowNull: true },
  interestedPropertyDetails: { type: DataTypes.JSONB, allowNull: true },
  desiredTerms: { type: DataTypes.JSONB, allowNull: true },
  screeningDecision: { type: DataTypes.ENUM('pending','approved','approved-with-conditions','declined'), defaultValue: 'pending' },
  screeningReviewedByUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  screeningReviewedAt: { type: DataTypes.DATE, allowNull: true },
  screeningNotes: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'prospect_tenants',
  timestamps: true,
  indexes: [ { fields: ['stage'] }, { fields: ['createdAt'] } ]
});

module.exports = ProspectTenant;


