const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Lease = sequelize.define('Lease', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  propertyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'properties',
      key: 'id'
    }
  },
  tenant1Id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  tenant2Id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  tenant3Id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  tenant4Id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  monthlyRent: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  totalLeaseValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Total value of the entire lease term'
  },
  totalAmountPaid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: 'Total amount paid by tenants to date'
  },
  totalAmountRemaining: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Remaining amount to be paid on lease'
  },
  securityDeposit: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  petDeposit: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  lateFeeAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  lateFeeDaysAfterDue: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  },
  rentDueDay: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 31
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'terminated', 'pending'),
    defaultValue: 'pending'
  },
  leaseType: {
    type: DataTypes.ENUM('fixed-term', 'month-to-month'),
    defaultValue: 'fixed-term'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  signedDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'leases',
  timestamps: true,
  indexes: [
    {
      fields: ['propertyId', 'status']
    },
    {
      fields: ['tenant1Id']
    },
    {
      fields: ['tenant2Id']
    },
    {
      fields: ['tenant3Id']
    },
    {
      fields: ['tenant4Id']
    },
    {
      fields: ['status', 'startDate', 'endDate']
    }
  ]
});

// Instance method to check if lease is currently active
Lease.prototype.isCurrentlyActive = function() {
  const now = new Date();
  return this.status === 'active' && 
         now >= this.startDate && 
         now <= this.endDate;
};

// Instance method to get remaining months
Lease.prototype.getRemainingMonths = function() {
  if (this.status !== 'active') return 0;
  
  const now = new Date();
  const endDate = new Date(this.endDate);
  
  if (now > endDate) return 0;
  
  const diffTime = endDate - now;
  const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44)); // Average month length
  return Math.max(0, diffMonths);
};

// Instance method to get all tenant IDs
Lease.prototype.getTenantIds = function() {
  return [this.tenant1Id, this.tenant2Id, this.tenant3Id, this.tenant4Id].filter(id => id != null);
};

// Instance method to calculate lease duration in months
Lease.prototype.getLeaseDurationMonths = function() {
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  const diffTime = end - start;
  const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(1, diffMonths);
};

// Instance method to calculate total lease value
Lease.prototype.calculateTotalLeaseValue = function() {
  return this.monthlyRent * this.getLeaseDurationMonths();
};

// Instance method to update remaining amount
Lease.prototype.updateRemainingAmount = function() {
  const totalValue = this.totalLeaseValue || this.calculateTotalLeaseValue();
  this.totalAmountRemaining = totalValue - (this.totalAmountPaid || 0);
  return this.totalAmountRemaining;
};

// Instance method to get payment progress percentage
Lease.prototype.getPaymentProgress = function() {
  const totalValue = this.totalLeaseValue || this.calculateTotalLeaseValue();
  if (totalValue === 0) return 0;
  return Math.min(100, ((this.totalAmountPaid || 0) / totalValue) * 100);
};

// Instance method to get all tenants for this lease
Lease.prototype.getAllTenants = function() {
  const tenants = [];
  if (this.tenant1) tenants.push(this.tenant1);
  if (this.tenant2) tenants.push(this.tenant2);
  if (this.tenant3) tenants.push(this.tenant3);
  if (this.tenant4) tenants.push(this.tenant4);
  return tenants;
};

// Instance method to get primary tenant name for display
Lease.prototype.getPrimaryTenantName = function() {
  const tenants = this.getAllTenants();
  if (tenants.length === 0) return 'No Tenants';
  if (tenants.length === 1) return tenants[0].getFullName();
  return `${tenants[0].getFullName()} +${tenants.length - 1} more`;
};

// Instance method to get all tenant names
Lease.prototype.getAllTenantNames = function() {
  return this.getAllTenants().map(tenant => tenant.getFullName()).join(', ');
};

module.exports = Lease; 