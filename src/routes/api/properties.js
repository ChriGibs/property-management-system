const express = require('express');
const { Property } = require('../../models');
const { createHttpError } = require('../../api/utils/errorMiddleware');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const properties = await Property.findAll({ order: [['address', 'ASC']] });
    res.json({ data: properties });
  } catch (error) {
    console.error('API properties list error:', error);
    res.status(500).json({ error: 'Failed to load properties' });
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, address, city, state, zipCode } = req.body || {};
    if (!address || !city || !state || !zipCode) {
      throw createHttpError(400, 'Address, city, state, and zip are required', { code: 'VALIDATION_ERROR' });
    }
    const created = await Property.create({
      name: name?.trim() || null,
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      isActive: true
    });
    return res.status(201).json({ data: created });
  } catch (error) { return next(error); }
});

router.put('/:id', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) return res.status(404).json({ error: 'Not found' });
    await property.update(req.body || {});
    res.json({ data: property });
  } catch (error) {
    console.error('API property update error:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

module.exports = router;


