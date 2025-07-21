const express = require('express');
const router = express.Router();
const { Tenant } = require('../models');
const { redirectIfTenantAuth } = require('../middleware/auth');

// Tenant login page
router.get('/login', redirectIfTenantAuth, (req, res) => {
  res.render('tenants/auth/login', {
    title: 'Tenant Login'
  });
});

// Tenant login POST
router.post('/login', redirectIfTenantAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const tenant = await Tenant.findOne({ where: { email, isActive: true } });
    
    if (!tenant || !(await tenant.validatePassword(password))) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/tenant-auth/login');
    }
    
    // Update last login
    tenant.lastLoginAt = new Date();
    await tenant.save();
    
    // Set session
    req.session.tenant = {
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email
    };
    
    req.flash('success', `Welcome, ${tenant.firstName}!`);
    res.redirect('/tenant-portal');
    
  } catch (error) {
    console.error('Tenant login error:', error);
    req.flash('error', 'An error occurred during login');
    res.redirect('/tenant-auth/login');
  }
});

// Tenant logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Tenant logout error:', err);
    }
    res.redirect('/');
  });
});

module.exports = router; 