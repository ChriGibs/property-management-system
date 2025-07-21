const express = require('express');
const router = express.Router();
const { Lease, Property, Tenant, Invoice, Payment } = require('../models');
const { requireAuth } = require('../middleware/auth');

// All lease routes require authentication
router.use(requireAuth);

// List all leases
router.get('/', async (req, res) => {
  try {
    const leases = await Lease.findAll({
      include: [
        { model: Property, as: 'property' },
        { model: Tenant, as: 'tenant1', required: false },
        { model: Tenant, as: 'tenant2', required: false },
        { model: Tenant, as: 'tenant3', required: false },
        { model: Tenant, as: 'tenant4', required: false }
      ],
      order: [['startDate', 'DESC']]
    });
    
    res.render('leases/index', {
      title: 'Leases',
      leases,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Leases list error:', error);
    req.flash('error', 'Error loading leases');
    res.redirect('/dashboard');
  }
});

// New lease form
router.get('/new', async (req, res) => {
  try {
    const [properties, tenants] = await Promise.all([
      Property.findAll({ 
        where: { isActive: true },
        order: [['name', 'ASC']]
      }),
      Tenant.findAll({ 
        where: { isActive: true },
        order: [['lastName', 'ASC'], ['firstName', 'ASC']]
      })
    ]);
    
    res.render('leases/new', {
      title: 'Create New Lease',
      properties,
      tenants,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('New lease form error:', error);
    req.flash('error', 'Error loading lease form');
    res.redirect('/leases');
  }
});

// Create lease
router.post('/', async (req, res) => {
  try {
    const {
      propertyId,
      tenant1Id,
      tenant2Id,
      tenant3Id,
      tenant4Id,
      startDate,
      endDate,
      monthlyRent,
      securityDeposit,
      petDeposit,
      lateFeeAmount,
      lateFeeDaysAfterDue,
      rentDueDay,
      leaseType,
      notes,
      signedDate
    } = req.body;

    // Validate required fields
    if (!propertyId || !tenant1Id || !startDate || !endDate || !monthlyRent) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect('/leases/new');
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      req.flash('error', 'End date must be after start date');
      return res.redirect('/leases/new');
    }

    const leaseData = {
      propertyId: parseInt(propertyId),
      tenant1Id: tenant1Id ? parseInt(tenant1Id) : null,
      tenant2Id: tenant2Id ? parseInt(tenant2Id) : null,
      tenant3Id: tenant3Id ? parseInt(tenant3Id) : null,
      tenant4Id: tenant4Id ? parseInt(tenant4Id) : null,
      startDate,
      endDate,
      monthlyRent: parseFloat(monthlyRent),
      securityDeposit: securityDeposit ? parseFloat(securityDeposit) : 0,
      petDeposit: petDeposit ? parseFloat(petDeposit) : 0,
      lateFeeAmount: lateFeeAmount ? parseFloat(lateFeeAmount) : 0,
      lateFeeDaysAfterDue: lateFeeDaysAfterDue ? parseInt(lateFeeDaysAfterDue) : 5,
      rentDueDay: rentDueDay ? parseInt(rentDueDay) : 1,
      leaseType: leaseType || 'fixed-term',
      notes: notes?.trim() || null,
      signedDate: signedDate || null,
      status: 'pending',
      totalAmountPaid: 0
    };

    // Calculate total lease value
    const durationMonths = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30.44));
    leaseData.totalLeaseValue = parseFloat(monthlyRent) * durationMonths;
    leaseData.totalAmountRemaining = leaseData.totalLeaseValue;

    const lease = await Lease.create(leaseData);
    
    // Update property's active lease if this lease is active
    if (lease.status === 'active') {
      await Property.update(
        { activeLeaseId: lease.id },
        { where: { id: propertyId } }
      );
    }
    
    req.flash('success', 'Lease created successfully!');
    res.redirect(`/leases/${lease.id}`);
  } catch (error) {
    console.error('Lease creation error:', error);
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      req.flash('error', `Validation error: ${messages.join(', ')}`);
    } else {
      req.flash('error', 'Error creating lease. Please try again.');
    }
    res.redirect('/leases/new');
  }
});

// View lease details
router.get('/:id', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id, {
      include: [
        { model: Property, as: 'property' },
        { model: Tenant, as: 'tenant1', required: false },
        { model: Tenant, as: 'tenant2', required: false },
        { model: Tenant, as: 'tenant3', required: false },
        { model: Tenant, as: 'tenant4', required: false },
        { 
          model: Invoice, 
          as: 'invoices',
          include: [
            { 
              model: Payment, 
              as: 'payments',
              required: false 
            }
          ],
          required: false,
          order: [['invoiceDate', 'DESC']]
        }
      ]
    });
    
    if (!lease) {
      req.flash('error', 'Lease not found');
      return res.redirect('/leases');
    }
    
    res.render('leases/show', {
      title: `Lease - ${lease.property ? lease.property.name : 'Property'}`,
      lease,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Lease view error:', error);
    req.flash('error', 'Error loading lease');
    res.redirect('/leases');
  }
});

// Edit lease form
router.get('/:id/edit', async (req, res) => {
  try {
    const [lease, properties, tenants] = await Promise.all([
      Lease.findByPk(req.params.id, {
        include: [
          { model: Property, as: 'property' },
          { model: Tenant, as: 'tenant1', required: false },
          { model: Tenant, as: 'tenant2', required: false },
          { model: Tenant, as: 'tenant3', required: false },
          { model: Tenant, as: 'tenant4', required: false }
        ]
      }),
      Property.findAll({ 
        where: { isActive: true },
        order: [['name', 'ASC']]
      }),
      Tenant.findAll({ 
        where: { isActive: true },
        order: [['lastName', 'ASC'], ['firstName', 'ASC']]
      })
    ]);
    
    if (!lease) {
      req.flash('error', 'Lease not found');
      return res.redirect('/leases');
    }
    
    res.render('leases/edit', {
      title: `Edit Lease - ${lease.property ? lease.property.name : 'Property'}`,
      lease,
      properties,
      tenants,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Lease edit form error:', error);
    req.flash('error', 'Error loading lease for editing');
    res.redirect('/leases');
  }
});

// Update lease
router.put('/:id', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id);
    
    if (!lease) {
      req.flash('error', 'Lease not found');
      return res.redirect('/leases');
    }

    const {
      propertyId,
      tenant1Id,
      tenant2Id,
      tenant3Id,
      tenant4Id,
      startDate,
      endDate,
      monthlyRent,
      securityDeposit,
      petDeposit,
      lateFeeAmount,
      lateFeeDaysAfterDue,
      rentDueDay,
      status,
      leaseType,
      notes,
      signedDate,
      totalAmountPaid
    } = req.body;

    // Validate required fields
    if (!propertyId || !tenant1Id || !startDate || !endDate || !monthlyRent) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect(`/leases/${req.params.id}/edit`);
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      req.flash('error', 'End date must be after start date');
      return res.redirect(`/leases/${req.params.id}/edit`);
    }

    const updateData = {
      propertyId: parseInt(propertyId),
      tenant1Id: tenant1Id ? parseInt(tenant1Id) : null,
      tenant2Id: tenant2Id ? parseInt(tenant2Id) : null,
      tenant3Id: tenant3Id ? parseInt(tenant3Id) : null,
      tenant4Id: tenant4Id ? parseInt(tenant4Id) : null,
      startDate,
      endDate,
      monthlyRent: parseFloat(monthlyRent),
      securityDeposit: securityDeposit ? parseFloat(securityDeposit) : 0,
      petDeposit: petDeposit ? parseFloat(petDeposit) : 0,
      lateFeeAmount: lateFeeAmount ? parseFloat(lateFeeAmount) : 0,
      lateFeeDaysAfterDue: lateFeeDaysAfterDue ? parseInt(lateFeeDaysAfterDue) : 5,
      rentDueDay: rentDueDay ? parseInt(rentDueDay) : 1,
      status: status || 'pending',
      leaseType: leaseType || 'fixed-term',
      notes: notes?.trim() || null,
      signedDate: signedDate || null,
      totalAmountPaid: totalAmountPaid ? parseFloat(totalAmountPaid) : lease.totalAmountPaid || 0
    };

    // Recalculate total lease value if dates or rent changed
    if (updateData.startDate !== lease.startDate || updateData.endDate !== lease.endDate || updateData.monthlyRent !== lease.monthlyRent) {
      const durationMonths = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30.44));
      updateData.totalLeaseValue = parseFloat(monthlyRent) * durationMonths;
    }

    // Update remaining amount
    if (updateData.totalLeaseValue || updateData.totalAmountPaid !== lease.totalAmountPaid) {
      const totalValue = updateData.totalLeaseValue || lease.totalLeaseValue;
      updateData.totalAmountRemaining = totalValue - updateData.totalAmountPaid;
    }

    await lease.update(updateData);
    
    // Update property's active lease reference
    if (updateData.status === 'active') {
      await Property.update(
        { activeLeaseId: lease.id },
        { where: { id: updateData.propertyId } }
      );
    } else if (lease.status === 'active' && updateData.status !== 'active') {
      // Remove active lease reference if lease is no longer active
      await Property.update(
        { activeLeaseId: null },
        { where: { id: updateData.propertyId, activeLeaseId: lease.id } }
      );
    }
    
    req.flash('success', 'Lease updated successfully!');
    res.redirect(`/leases/${lease.id}`);
  } catch (error) {
    console.error('Lease update error:', error);
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      req.flash('error', `Validation error: ${messages.join(', ')}`);
    } else {
      req.flash('error', 'Error updating lease. Please try again.');
    }
    res.redirect(`/leases/${req.params.id}/edit`);
  }
});

// Delete lease
router.delete('/:id', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id, {
      include: [{ model: Property, as: 'property' }]
    });
    
    if (!lease) {
      req.flash('error', 'Lease not found');
      return res.redirect('/leases');
    }

    // Remove property's active lease reference if this is the active lease
    if (lease.property && lease.property.activeLeaseId === lease.id) {
      await Property.update(
        { activeLeaseId: null },
        { where: { id: lease.propertyId } }
      );
    }

    const propertyName = lease.property ? lease.property.name : 'Unknown Property';
    await lease.destroy();
    
    req.flash('success', `Lease for "${propertyName}" deleted successfully.`);
    res.redirect('/leases');
  } catch (error) {
    console.error('Lease deletion error:', error);
    req.flash('error', 'Error deleting lease. Please try again.');
    res.redirect(`/leases/${req.params.id}`);
  }
});

// Route to activate a lease
router.post('/:id/activate', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id);
    
    if (!lease) {
      req.flash('error', 'Lease not found');
      return res.redirect('/leases');
    }

    // Deactivate any other active leases for the same property
    await Lease.update(
      { status: 'terminated' },
      { 
        where: { 
          propertyId: lease.propertyId, 
          status: 'active',
          id: { [require('sequelize').Op.ne]: lease.id }
        } 
      }
    );

    // Activate this lease
    await lease.update({ status: 'active' });
    
    // Update property's active lease reference
    await Property.update(
      { activeLeaseId: lease.id },
      { where: { id: lease.propertyId } }
    );
    
    req.flash('success', 'Lease activated successfully!');
    res.redirect(`/leases/${lease.id}`);
  } catch (error) {
    console.error('Lease activation error:', error);
    req.flash('error', 'Error activating lease');
    res.redirect(`/leases/${req.params.id}`);
  }
});

module.exports = router; 