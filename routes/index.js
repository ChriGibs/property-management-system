const express = require('express');
const router = express.Router();

// Homepage - redirect to appropriate dashboard based on authentication
router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  
  if (req.session.tenant) {
    return res.redirect('/tenant-portal');
  }
  
  // Render landing page with login options
  res.render('index', {
    title: 'Property Management System'
  });
});

module.exports = router; 