const express = require('express');
const router = express.Router();
const { Tenant, Lease, Property } = require('../models');
const { requireAuth } = require('../middleware/auth');

// All tenant routes require authentication
router.use(requireAuth);

// List all tenants
router.get('/', async (req, res) => {
  try {
    const tenants = await Tenant.findAll({
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });
    
    res.render('tenants/index', {
      title: 'Tenants',
      tenants,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Tenants list error:', error);
    req.flash('error', 'Error loading tenants');
    res.redirect('/dashboard');
  }
});

// New tenant form
router.get('/new', (req, res) => {
  // Ensure user is available
  if (!req.user) {
    req.flash('error', 'Authentication required');
    return res.redirect('/auth/login');
  }
  
  res.render('tenants/new', {
    title: 'Add New Tenant',
    user: req.user,
    messages: req.flash()
  });
});

// Create tenant
router.post('/', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      emergencyContactName,
      emergencyContactPhone,
      employerName,
      monthlyIncome
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect('/tenants/new');
    }

    const tenantData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      password: password?.trim() || null,
      emergencyContactName: emergencyContactName?.trim() || null,
      emergencyContactPhone: emergencyContactPhone?.trim() || null,
      employerName: employerName?.trim() || null,
      monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : null,
      isActive: true
    };

    const tenant = await Tenant.create(tenantData);
    req.flash('success', `Tenant "${tenant.getFullName()}" added successfully!`);
    res.redirect(`/tenants/${tenant.id}`);
  } catch (error) {
    console.error('Tenant creation error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      req.flash('error', 'Email address is already in use');
    } else if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      req.flash('error', `Validation error: ${messages.join(', ')}`);
    } else {
      req.flash('error', 'Error creating tenant. Please try again.');
    }
    res.redirect('/tenants/new');
  }
});

// View tenant details
router.get('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (tenant) {
      // Get all leases for this tenant using the custom method
      tenant.leases = await tenant.getAllLeases();
    }
    
    if (!tenant) {
      req.flash('error', 'Tenant not found');
      return res.redirect('/tenants');
    }
    
    res.render('tenants/show', {
      title: tenant.getFullName(),
      tenant,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Tenant view error:', error);
    req.flash('error', 'Error loading tenant');
    res.redirect('/tenants');
  }
});

// Edit tenant form
router.get('/:id/edit', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      req.flash('error', 'Tenant not found');
      return res.redirect('/tenants');
    }
    
    res.render('tenants/edit', {
      title: `Edit ${tenant.getFullName()}`,
      tenant,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Tenant edit form error:', error);
    req.flash('error', 'Error loading tenant for editing');
    res.redirect('/tenants');
  }
});

// Update tenant
router.put('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      req.flash('error', 'Tenant not found');
      return res.redirect('/tenants');
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      emergencyContactName,
      emergencyContactPhone,
      employerName,
      monthlyIncome,
      isActive
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect(`/tenants/${req.params.id}/edit`);
    }

    const updateData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      emergencyContactName: emergencyContactName?.trim() || null,
      emergencyContactPhone: emergencyContactPhone?.trim() || null,
      employerName: employerName?.trim() || null,
      monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : null,
      isActive: isActive === 'true' || isActive === true
    };

    // Only update password if provided
    if (password && password.trim()) {
      updateData.password = password.trim();
    }

    await tenant.update(updateData);
    
    req.flash('success', `Tenant "${tenant.getFullName()}" updated successfully!`);
    res.redirect(`/tenants/${tenant.id}`);
  } catch (error) {
    console.error('Tenant update error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      req.flash('error', 'Email address is already in use');
    } else if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      req.flash('error', `Validation error: ${messages.join(', ')}`);
    } else {
      req.flash('error', 'Error updating tenant. Please try again.');
    }
    res.redirect(`/tenants/${req.params.id}/edit`);
  }
});

// Delete tenant
router.delete('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      req.flash('error', 'Tenant not found');
      return res.redirect('/tenants');
    }

    // Check if tenant has active leases using custom method
    const allLeases = await tenant.getAllLeases();
    const activeLeases = allLeases.filter(lease => lease.status === 'active');
    if (activeLeases.length > 0) {
      req.flash('error', 'Cannot delete tenant with active leases. Please terminate all leases first.');
      return res.redirect(`/tenants/${tenant.id}`);
    }

    const tenantName = tenant.getFullName();
    await tenant.destroy();
    
    req.flash('success', `Tenant "${tenantName}" deleted successfully.`);
    res.redirect('/tenants');
  } catch (error) {
    console.error('Tenant deletion error:', error);
    req.flash('error', 'Error deleting tenant. Please try again.');
    res.redirect(`/tenants/${req.params.id}`);
  }
});

module.exports = router; 