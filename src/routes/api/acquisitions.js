const express = require('express');
const { AcquisitionProperty } = require('../../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { status, city, state } = req.query;
    const where = {};
    if (status) where.status = status;
    if (city) where.city = city;
    if (state) where.state = state;
    const acquisitions = await AcquisitionProperty.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json({ data: acquisitions });
  } catch (error) {
    console.error('API acquisitions list error:', error);
    res.status(500).json({ error: 'Failed to load acquisitions' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { headline, address, city, state, zipCode, county, propertyType, bedrooms, bathrooms, squareFootage, yearBuilt, listedPrice, url, notes, source } = req.body;
    if (!headline || !headline.trim()) {
      return res.status(400).json({ error: 'Headline is required' });
    }
    const created = await AcquisitionProperty.create({
      headline: headline.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zipCode: zipCode?.trim() || null,
      county: county?.trim() || null,
      propertyType: propertyType || null,
      bedrooms: bedrooms != null ? parseInt(bedrooms) : null,
      bathrooms: bathrooms != null ? parseFloat(bathrooms) : null,
      squareFootage: squareFootage != null ? parseInt(squareFootage) : null,
      yearBuilt: yearBuilt != null ? parseInt(yearBuilt) : null,
      listedPrice: listedPrice != null ? parseFloat(listedPrice) : null,
      url: url?.trim() || null,
      notes: notes?.trim() || null,
      source: source || 'manual',
      createdByUserId: req.user.id
    });
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('API acquisitions create error:', error);
    res.status(500).json({ error: 'Failed to create acquisition' });
  }
});

module.exports = router;


