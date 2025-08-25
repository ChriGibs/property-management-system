const sequelize = require('../config/database');

// Import all models
const User = require('./User');
const Property = require('./Property');
const Tenant = require('./Tenant');
const Lease = require('./Lease');
const Invoice = require('./Invoice');
const Payment = require('./Payment');
const PaymentAllocation = require('./PaymentAllocation');
const AcquisitionProperty = require('./AcquisitionProperty');
const AcquisitionActivity = require('./AcquisitionActivity');
const ProspectTenant = require('./ProspectTenant');
const ProspectActivity = require('./ProspectActivity');
const PaymentRequest = require('./PaymentRequest');

// Associations (copied from root models/index.js)
Property.hasMany(Lease, { foreignKey: 'propertyId', as: 'leases' });
Lease.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });

Tenant.hasMany(Lease, { foreignKey: 'tenant1Id', as: 'leasesAsTenant1' });
Tenant.hasMany(Lease, { foreignKey: 'tenant2Id', as: 'leasesAsTenant2' });
Tenant.hasMany(Lease, { foreignKey: 'tenant3Id', as: 'leasesAsTenant3' });
Tenant.hasMany(Lease, { foreignKey: 'tenant4Id', as: 'leasesAsTenant4' });

Lease.belongsTo(Tenant, { foreignKey: 'tenant1Id', as: 'tenant1' });
Lease.belongsTo(Tenant, { foreignKey: 'tenant2Id', as: 'tenant2' });
Lease.belongsTo(Tenant, { foreignKey: 'tenant3Id', as: 'tenant3' });
Lease.belongsTo(Tenant, { foreignKey: 'tenant4Id', as: 'tenant4' });

Property.belongsTo(Lease, { foreignKey: 'activeLeaseId', as: 'activeLease' });

Lease.hasMany(Invoice, { foreignKey: 'leaseId', as: 'invoices' });
Invoice.belongsTo(Lease, { foreignKey: 'leaseId', as: 'lease' });

Invoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments' });
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

Payment.hasMany(PaymentAllocation, { foreignKey: 'paymentId', as: 'allocations' });
PaymentAllocation.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Invoice.hasMany(PaymentAllocation, { foreignKey: 'invoiceId', as: 'allocations' });
PaymentAllocation.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

// CRM
AcquisitionProperty.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });
AcquisitionProperty.hasMany(AcquisitionActivity, { foreignKey: 'acquisitionPropertyId', as: 'activities' });
AcquisitionActivity.belongsTo(AcquisitionProperty, { foreignKey: 'acquisitionPropertyId', as: 'acquisitionProperty' });
AcquisitionActivity.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });

ProspectTenant.belongsTo(Property, { foreignKey: 'interestedPropertyId', as: 'interestedProperty' });
ProspectTenant.hasMany(ProspectActivity, { foreignKey: 'prospectTenantId', as: 'activities' });
ProspectActivity.belongsTo(ProspectTenant, { foreignKey: 'prospectTenantId', as: 'prospect' });
ProspectActivity.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });

PaymentRequest.belongsTo(Lease, { foreignKey: 'leaseId', as: 'lease' });
PaymentRequest.belongsTo(Tenant, { foreignKey: 'primaryTenantId', as: 'primaryTenant' });
PaymentRequest.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });

module.exports = {
  sequelize,
  User,
  Property,
  Tenant,
  Lease,
  Invoice,
  Payment,
  PaymentAllocation,
  PaymentRequest,
  AcquisitionProperty,
  AcquisitionActivity,
  ProspectTenant,
  ProspectActivity
};


