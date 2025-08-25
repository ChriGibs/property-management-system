const express = require('express');
const { ProspectTenant } = require('../../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { stage, source } = req.query;
    const where = {};
    if (stage) where.stage = stage;
    if (source) where.source = source;
    const prospects = await ProspectTenant.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json({ data: prospects });
  } catch (error) {
    console.error('API prospects list error:', error);
    res.status(500).json({ error: 'Failed to load prospects' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, stage, source, notes, interestedPropertyId } = req.body;
    if (!email && !(firstName && lastName && phone)) {
      return res.status(400).json({ error: 'Email or full name with phone is required' });
    }
    const created = await ProspectTenant.create({
      firstName: firstName?.trim() || null,
      lastName: lastName?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      stage: stage || 'new',
      source: source || 'manual',
      notes: notes?.trim() || null,
      interestedPropertyId: interestedPropertyId || null
    });
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('API prospects create error:', error);
    res.status(500).json({ error: 'Failed to create prospect' });
  }
});

module.exports = router;


