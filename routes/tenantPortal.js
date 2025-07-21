const express = require('express');
const router = express.Router();
const { requireTenantAuth } = require('../middleware/auth');

router.use(requireTenantAuth);

router.get('/', (req, res) => {
  res.render('tenant-portal/index', { title: 'Tenant Portal' });
});

module.exports = router; 