const express = require('express');
const { Op } = require('sequelize');
const { Tenant, Lease } = require('../../models');
const { createHttpError } = require('../../api/utils/errorMiddleware');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const tenants = await Tenant.findAll({ order: [['lastName', 'ASC'], ['firstName', 'ASC']], limit, offset });
    res.json({ data: tenants });
  } catch (error) {
    console.error('API tenants list error:', error);
    res.status(500).json({ error: 'Failed to load tenants' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    const leases = await Lease.findAll({
      where: {
        [Op.or]: [
          { tenant1Id: id },
          { tenant2Id: id },
          { tenant3Id: id },
          { tenant4Id: id }
        ]
      },
      include: ['property'],
      order: [['startDate', 'DESC']]
    });
    res.json({ data: { tenant, leases } });
  } catch (error) {
    console.error('API tenant detail error:', error);
    res.status(500).json({ error: 'Failed to load tenant detail' });
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, isActive } = req.body;
    if (!firstName || !lastName) {
      throw createHttpError(400, 'First and last name are required', { code: 'VALIDATION_ERROR' });
    }
    if (!(email && String(email).trim()) && !(phone && String(phone).trim())) {
      throw createHttpError(400, 'Either email or phone is required', { code: 'VALIDATION_ERROR' });
    }
    const created = await Tenant.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      password: 'placeholder',
      isActive: isActive !== undefined ? !!isActive : true
    });
    res.status(201).json({ data: created });
  } catch (error) { return next(error); }
});

router.put('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    const { firstName, lastName, email, phone, isActive } = req.body;
    await tenant.update({
      firstName: firstName ?? tenant.firstName,
      lastName: lastName ?? tenant.lastName,
      email: email ?? tenant.email,
      phone: phone ?? tenant.phone,
      isActive: isActive ?? tenant.isActive
    });
    res.json({ data: tenant });
  } catch (error) {
    console.error('API tenant update error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

module.exports = router;


