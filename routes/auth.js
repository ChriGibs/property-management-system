const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { redirectIfAuth } = require('../middleware/auth');

// Login page
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('auth/login', {
    title: 'Manager Login'
  });
});

// Login POST
router.post('/login', redirectIfAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ where: { email, isActive: true } });
    
    if (!user || !(await user.validatePassword(password))) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/auth/login');
    }
    
    // Update last login
    user.lastLoginAt = new Date();
    await user.save();
    
    // Set session
    req.session.user = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    };
    
    req.flash('success', `Welcome back, ${user.firstName}!`);
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'An error occurred during login');
    res.redirect('/auth/login');
  }
});

// Register page (for initial setup)
router.get('/register', redirectIfAuth, async (req, res) => {
  // Check if any users exist - if so, redirect to login
  const userCount = await User.count();
  if (userCount > 0) {
    req.flash('error', 'Registration is disabled. Please contact an administrator.');
    return res.redirect('/auth/login');
  }
  
  res.render('auth/register', {
    title: 'Setup Administrator Account'
  });
});

// Register POST (only allowed for first user)
router.post('/register', redirectIfAuth, async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await User.count();
    if (userCount > 0) {
      req.flash('error', 'Registration is disabled');
      return res.redirect('/auth/login');
    }
    
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    
    // Validation
    if (!firstName || !lastName || !email || !password) {
      req.flash('error', 'All fields are required');
      return res.redirect('/auth/register');
    }
    
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match');
      return res.redirect('/auth/register');
    }
    
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters');
      return res.redirect('/auth/register');
    }
    
    // Create admin user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: 'admin'
    });
    
    req.flash('success', 'Administrator account created successfully! Please log in.');
    res.redirect('/auth/login');
    
  } catch (error) {
    console.error('Registration error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      req.flash('error', 'Email already exists');
    } else {
      req.flash('error', 'An error occurred during registration');
    }
    res.redirect('/auth/register');
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

module.exports = router; 