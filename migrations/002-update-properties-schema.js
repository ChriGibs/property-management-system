'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns to Properties table
    await queryInterface.addColumn('Properties', 'name', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'Unnamed Property'
    });

    await queryInterface.addColumn('Properties', 'county', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('Properties', 'currentValue', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });

    await queryInterface.addColumn('Properties', 'currentValueDate', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Update existing properties to have meaningful names based on their address
    await queryInterface.sequelize.query(`
      UPDATE "Properties" 
      SET name = CONCAT(address, ' Property') 
      WHERE name = 'Unnamed Property'
    `);

    // Remove the default value constraint after updating existing records
    await queryInterface.changeColumn('Properties', 'name', {
      type: Sequelize.STRING,
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the added columns
    await queryInterface.removeColumn('Properties', 'name');
    await queryInterface.removeColumn('Properties', 'county');
    await queryInterface.removeColumn('Properties', 'currentValue');
    await queryInterface.removeColumn('Properties', 'currentValueDate');
  }
}; 