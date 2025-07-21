const express = require('express');
const router = express.Router();
const { Property, Tenant, Lease, Invoice, Payment } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { Op } = require('sequelize');

// All dashboard routes require authentication
router.use(requireAuth);

// Dashboard overview
router.get('/', async (req, res) => {
  try {
    // Get overview statistics
    const totalProperties = await Property.count({ where: { isActive: true } });
    const totalTenants = await Tenant.count({ where: { isActive: true } });
    const activeLeases = await Lease.count({ where: { status: 'active' } });
    
    // Get overdue invoices
    const overdueInvoices = await Invoice.findAll({
      where: {
        status: ['sent', 'partially_paid'],
        dueDate: { [Op.lt]: new Date() }
      },
      include: [
        {
          model: Lease,
          as: 'lease',
          include: [
            { model: Property, as: 'property' },
            { model: Tenant, as: 'tenant1', required: false },
            { model: Tenant, as: 'tenant2', required: false },
            { model: Tenant, as: 'tenant3', required: false },
            { model: Tenant, as: 'tenant4', required: false }
          ]
        }
      ],
      order: [['dueDate', 'ASC']],
      limit: 10
    });
    
    // Calculate total rent due this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const monthlyRentDue = await Invoice.sum('rentAmount', {
      where: {
        dueDate: {
          [Op.between]: [startOfMonth, endOfMonth]
        },
        status: ['sent', 'partially_paid', 'overdue']
      }
    }) || 0;
    
    // Get recent payments
    const recentPayments = await Payment.findAll({
      where: { status: 'completed' },
      include: [
        {
          model: Invoice,
          as: 'invoice',
          include: [
            {
              model: Lease,
              as: 'lease',
              include: [
                { model: Property, as: 'property' },
                { model: Tenant, as: 'tenant1', required: false },
                { model: Tenant, as: 'tenant2', required: false },
                { model: Tenant, as: 'tenant3', required: false },
                { model: Tenant, as: 'tenant4', required: false }
              ]
            }
          ]
        }
      ],
      order: [['paymentDate', 'DESC']],
      limit: 5
    });
    
    // Properties needing attention (vacant or lease expiring soon)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const propertiesNeedingAttention = await Property.findAll({
      include: [
        {
          model: Lease,
          as: 'leases',
          where: {
            [Op.or]: [
              { status: 'active', endDate: { [Op.lte]: thirtyDaysFromNow } },
              { status: { [Op.ne]: 'active' } }
            ]
          },
          include: [
            { model: Tenant, as: 'tenant1', required: false },
            { model: Tenant, as: 'tenant2', required: false },
            { model: Tenant, as: 'tenant3', required: false },
            { model: Tenant, as: 'tenant4', required: false }
          ],
          required: false
        }
      ],
      where: { isActive: true }
    });
    
    res.render('dashboard/index', {
      title: 'Dashboard',
      user: req.user,
      stats: {
        totalProperties,
        totalTenants,
        activeLeases,
        monthlyRentDue,
        overdueCount: overdueInvoices.length
      },
      overdueInvoices,
      recentPayments,
      propertiesNeedingAttention
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Error loading dashboard');
    res.render('dashboard/index', {
      title: 'Dashboard',
      user: req.user,
      stats: { totalProperties: 0, totalTenants: 0, activeLeases: 0, monthlyRentDue: 0, overdueCount: 0 },
      overdueInvoices: [],
      recentPayments: [],
      propertiesNeedingAttention: []
    });
  }
});

module.exports = router; 