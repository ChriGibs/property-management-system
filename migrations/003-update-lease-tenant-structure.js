'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Add new columns to leases table for multiple tenants
    await queryInterface.addColumn('leases', 'tenant1Id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tenants',
        key: 'id'
      }
    });

    await queryInterface.addColumn('leases', 'tenant2Id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tenants',
        key: 'id'
      }
    });

    await queryInterface.addColumn('leases', 'tenant3Id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tenants',
        key: 'id'
      }
    });

    await queryInterface.addColumn('leases', 'tenant4Id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tenants',
        key: 'id'
      }
    });

    // Step 2: Add financial tracking columns to leases
    await queryInterface.addColumn('leases', 'totalLeaseValue', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Total value of the entire lease term'
    });

    await queryInterface.addColumn('leases', 'totalAmountPaid', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: 'Total amount paid by tenants to date'
    });

    await queryInterface.addColumn('leases', 'totalAmountRemaining', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Remaining amount to be paid on lease'
    });

    // Step 3: Migrate existing tenantId data to tenant1Id
    await queryInterface.sequelize.query(`
      UPDATE leases 
      SET tenant1Id = tenantId 
      WHERE tenantId IS NOT NULL
    `);

    // Step 4: Calculate and set totalLeaseValue for existing leases
    await queryInterface.sequelize.query(`
      UPDATE leases 
      SET totalLeaseValue = monthlyRent * CEIL(EXTRACT(EPOCH FROM (endDate - startDate)) / (30.44 * 24 * 3600))
      WHERE monthlyRent IS NOT NULL AND startDate IS NOT NULL AND endDate IS NOT NULL
    `);

    // Step 5: Calculate totalAmountRemaining based on totalLeaseValue and totalAmountPaid
    await queryInterface.sequelize.query(`
      UPDATE leases 
      SET totalAmountRemaining = COALESCE(totalLeaseValue, 0) - COALESCE(totalAmountPaid, 0)
      WHERE totalLeaseValue IS NOT NULL
    `);

    // Step 6: Add activeLease reference to properties table
    await queryInterface.addColumn('properties', 'activeLeaseId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'leases',
        key: 'id'
      },
      comment: 'Reference to the currently active lease for this property'
    });

    // Step 7: Set activeLeaseId for properties with active leases
    await queryInterface.sequelize.query(`
      UPDATE properties 
      SET activeLeaseId = (
        SELECT l.id 
        FROM leases l 
        WHERE l.propertyId = properties.id 
        AND l.status = 'active' 
        AND CURRENT_DATE BETWEEN l.startDate AND l.endDate
        LIMIT 1
      )
    `);

    // Step 8: Create new indexes for performance
    await queryInterface.addIndex('leases', ['tenant1Id'], {
      name: 'leases_tenant1_idx'
    });

    await queryInterface.addIndex('leases', ['tenant2Id'], {
      name: 'leases_tenant2_idx'
    });

    await queryInterface.addIndex('leases', ['tenant3Id'], {
      name: 'leases_tenant3_idx'
    });

    await queryInterface.addIndex('leases', ['tenant4Id'], {
      name: 'leases_tenant4_idx'
    });

    await queryInterface.addIndex('leases', ['status', 'startDate', 'endDate'], {
      name: 'leases_status_dates_idx'
    });

    await queryInterface.addIndex('properties', ['activeLeaseId'], {
      name: 'properties_active_lease_idx'
    });

    // Step 9: Remove the old tenantId column (after data migration)
    try {
      await queryInterface.removeColumn('leases', 'tenantId');
    } catch (error) {
      console.log('Note: tenantId column may not exist or already removed');
    }

    console.log('✅ Lease and tenant structure migration completed successfully');
  },

  down: async (queryInterface, Sequelize) => {
    // Reverse the migration
    
    // Add back tenantId column
    await queryInterface.addColumn('leases', 'tenantId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'tenants',
        key: 'id'
      }
    });

    // Migrate tenant1Id back to tenantId
    await queryInterface.sequelize.query(`
      UPDATE leases 
      SET tenantId = tenant1Id 
      WHERE tenant1Id IS NOT NULL
    `);

    // Remove new columns
    await queryInterface.removeColumn('leases', 'tenant1Id');
    await queryInterface.removeColumn('leases', 'tenant2Id');
    await queryInterface.removeColumn('leases', 'tenant3Id');
    await queryInterface.removeColumn('leases', 'tenant4Id');
    await queryInterface.removeColumn('leases', 'totalLeaseValue');
    await queryInterface.removeColumn('leases', 'totalAmountPaid');
    await queryInterface.removeColumn('leases', 'totalAmountRemaining');
    await queryInterface.removeColumn('properties', 'activeLeaseId');

    // Remove indexes
    await queryInterface.removeIndex('leases', 'leases_tenant1_idx');
    await queryInterface.removeIndex('leases', 'leases_tenant2_idx');
    await queryInterface.removeIndex('leases', 'leases_tenant3_idx');
    await queryInterface.removeIndex('leases', 'leases_tenant4_idx');
    await queryInterface.removeIndex('leases', 'leases_status_dates_idx');
    await queryInterface.removeIndex('properties', 'properties_active_lease_idx');
  }
}; 