module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.createTable('payment_allocations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      paymentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'payments', key: 'id' },
        onDelete: 'CASCADE'
      },
      invoiceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onDelete: 'CASCADE'
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
    await queryInterface.addIndex('payment_allocations', ['paymentId']);
    await queryInterface.addIndex('payment_allocations', ['invoiceId']);
  },
  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('payment_allocations');
  }
};


