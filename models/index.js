const sequelize = require('../config/database');

// Import all models
const User = require('./User');
const Property = require('./Property');
const Tenant = require('./Tenant');
const Lease = require('./Lease');
const Invoice = require('./Invoice');
const Payment = require('./Payment');

// Define associations
// Property to Lease (One-to-Many)
Property.hasMany(Lease, {
  foreignKey: 'propertyId',
  as: 'leases'
});
Lease.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property'
});

// Tenant to Lease (Multi-tenant support)
Tenant.hasMany(Lease, {
  foreignKey: 'tenant1Id',
  as: 'leasesAsTenant1'
});
Tenant.hasMany(Lease, {
  foreignKey: 'tenant2Id',
  as: 'leasesAsTenant2'
});
Tenant.hasMany(Lease, {
  foreignKey: 'tenant3Id',
  as: 'leasesAsTenant3'
});
Tenant.hasMany(Lease, {
  foreignKey: 'tenant4Id',
  as: 'leasesAsTenant4'
});

// Lease to Tenant (Multi-tenant support)
Lease.belongsTo(Tenant, {
  foreignKey: 'tenant1Id',
  as: 'tenant1'
});
Lease.belongsTo(Tenant, {
  foreignKey: 'tenant2Id',
  as: 'tenant2'
});
Lease.belongsTo(Tenant, {
  foreignKey: 'tenant3Id',
  as: 'tenant3'
});
Lease.belongsTo(Tenant, {
  foreignKey: 'tenant4Id',
  as: 'tenant4'
});

// Property to Active Lease (One-to-One)
Property.belongsTo(Lease, {
  foreignKey: 'activeLeaseId',
  as: 'activeLease'
});

// Lease to Invoice (One-to-Many)
Lease.hasMany(Invoice, {
  foreignKey: 'leaseId',
  as: 'invoices'
});
Invoice.belongsTo(Lease, {
  foreignKey: 'leaseId',
  as: 'lease'
});

// Invoice to Payment (One-to-Many)
Invoice.hasMany(Payment, {
  foreignKey: 'invoiceId',
  as: 'payments'
});
Payment.belongsTo(Invoice, {
  foreignKey: 'invoiceId',
  as: 'invoice'
});

// Note: Payments are now only linked to invoices, not directly to leases
// To get lease payments, query through invoices

// Define helpful association methods for common queries

// Property methods
Property.prototype.getActiveLease = function() {
  return Lease.findOne({
    where: {
      propertyId: this.id,
      status: 'active'
    },
    include: [
      { model: Tenant, as: 'tenant1', required: false },
      { model: Tenant, as: 'tenant2', required: false },
      { model: Tenant, as: 'tenant3', required: false },
      { model: Tenant, as: 'tenant4', required: false }
    ]
  });
};

Property.prototype.getCurrentTenants = async function() {
  const activeLease = await this.getActiveLease();
  if (!activeLease) return [];
  
  const tenants = [];
  if (activeLease.tenant1) tenants.push(activeLease.tenant1);
  if (activeLease.tenant2) tenants.push(activeLease.tenant2);
  if (activeLease.tenant3) tenants.push(activeLease.tenant3);
  if (activeLease.tenant4) tenants.push(activeLease.tenant4);
  
  return tenants;
};

// Legacy method for backward compatibility
Property.prototype.getCurrentTenant = async function() {
  const tenants = await this.getCurrentTenants();
  return tenants.length > 0 ? tenants[0] : null;
};

// Tenant methods
Tenant.prototype.getAllLeases = function() {
  return Lease.findAll({
    where: {
      [sequelize.Sequelize.Op.or]: [
        { tenant1Id: this.id },
        { tenant2Id: this.id },
        { tenant3Id: this.id },
        { tenant4Id: this.id }
      ]
    },
    include: [{ model: Property, as: 'property' }],
    order: [['startDate', 'DESC']]
  });
};

// Lease methods
Lease.prototype.getCurrentBalance = async function() {
  // Get all invoices for this lease
  const invoices = await Invoice.findAll({
    where: {
      leaseId: this.id,
      status: ['sent', 'paid', 'partially_paid', 'overdue']
    },
    include: [{
      model: Payment,
      as: 'payments',
      where: { status: 'completed' },
      required: false
    }]
  });

  let totalInvoiced = 0;
  let totalPaid = 0;

  invoices.forEach(invoice => {
    totalInvoiced += parseFloat(invoice.rentAmount || 0);
    
    invoice.payments.forEach(payment => {
      totalPaid += parseFloat(payment.amount || 0);
    });
  });

  return totalInvoiced - totalPaid;
};

Lease.prototype.getOutstandingInvoices = function() {
  return Invoice.findAll({
    where: {
      leaseId: this.id,
      status: ['sent', 'partially_paid', 'overdue']
    },
    order: [['dueDate', 'ASC']]
  });
};

Lease.prototype.getFutureCashflow = function() {
  const remainingMonths = this.getRemainingMonths();
  const monthlyRent = parseFloat(this.monthlyRent);
  
  const cashflow = [];
  const now = new Date();
  
  for (let i = 0; i < remainingMonths; i++) {
    const futureDate = new Date(now.getFullYear(), now.getMonth() + i + 1, this.rentDueDay);
    cashflow.push({
      date: futureDate,
      amount: monthlyRent,
      description: 'Monthly Rent'
    });
  }
  
  return cashflow;
};

Lease.prototype.getAllPayments = async function() {
  const invoices = await Invoice.findAll({
    where: { leaseId: this.id },
    include: [{
      model: Payment,
      as: 'payments',
      required: false
    }],
    order: [['createdAt', 'DESC'], [{ model: Payment, as: 'payments' }, 'paymentDate', 'DESC']]
  });

  const allPayments = [];
  invoices.forEach(invoice => {
    invoice.payments.forEach(payment => {
      allPayments.push({
        ...payment.toJSON(),
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount
        }
      });
    });
  });

  return allPayments;
};

// Export all models and sequelize instance
module.exports = {
  sequelize,
  User,
  Property,
  Tenant,
  Lease,
  Invoice,
  Payment
}; 