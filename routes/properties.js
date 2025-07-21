const express = require('express');
const router = express.Router();
const { Property, Lease, Tenant } = require('../models');
const { requireAuth } = require('../middleware/auth');

// All property routes require authentication
router.use(requireAuth);

// List all properties
router.get('/', async (req, res) => {
  try {
    const properties = await Property.findAll({
      include: [
        {
          model: Lease,
          as: 'leases',
          where: { status: 'active' },
          include: [
            { model: Tenant, as: 'tenant1', required: false },
            { model: Tenant, as: 'tenant2', required: false },
            { model: Tenant, as: 'tenant3', required: false },
            { model: Tenant, as: 'tenant4', required: false }
          ],
          required: false
        }
      ],
      order: [['address', 'ASC']]
    });
    
    res.render('properties/index', {
      title: 'Properties',
      properties,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Properties list error:', error);
    req.flash('error', 'Error loading properties');
    res.redirect('/dashboard');
  }
});

// New property form
router.get('/new', (req, res) => {
  // Ensure user is available
  if (!req.user) {
    req.flash('error', 'Authentication required');
    return res.redirect('/auth/login');
  }
  
  res.render('properties/new', {
    title: 'Add New Property',
    user: req.user,
    messages: req.flash()
  });
});

// Create property
router.post('/', async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      state,
      zipCode,
      county,
      propertyType,
      bedrooms,
      bathrooms,
      squareFootage,
      description,
      purchasePrice,
      purchaseDate,
      currentValue
    } = req.body;

    // Validate required fields
    if (!name || !address || !city || !state || !zipCode) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect('/properties/new');
    }

    const propertyData = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      county: county?.trim() || null,
      propertyType: propertyType || 'single-family',
      bedrooms: bedrooms ? parseInt(bedrooms) : 1,
      bathrooms: bathrooms ? parseFloat(bathrooms) : 1.0,
      squareFootage: squareFootage ? parseInt(squareFootage) : null,
      description: description?.trim() || null,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      purchaseDate: purchaseDate || null,
      currentValue: currentValue ? parseFloat(currentValue) : null,
      currentValueDate: currentValue ? new Date() : null,
      isActive: true
    };

    const property = await Property.create(propertyData);
    req.flash('success', `Property "${property.name}" added successfully!`);
    res.redirect(`/properties/${property.id}`);
  } catch (error) {
    console.error('Property creation error:', error);
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      req.flash('error', `Validation error: ${messages.join(', ')}`);
    } else {
      req.flash('error', 'Error creating property. Please try again.');
    }
    res.redirect('/properties/new');
  }
});

// View property details
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id, {
      include: [
        {
          model: Lease,
          as: 'leases',
          include: [
            { model: Tenant, as: 'tenant1', required: false },
            { model: Tenant, as: 'tenant2', required: false },
            { model: Tenant, as: 'tenant3', required: false },
            { model: Tenant, as: 'tenant4', required: false }
          ],
          order: [['startDate', 'DESC']]
        }
      ]
    });
    
    if (!property) {
      req.flash('error', 'Property not found');
      return res.redirect('/properties');
    }
    
    res.render('properties/show', {
      title: property.name || property.address,
      property,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Property view error:', error);
    req.flash('error', 'Error loading property');
    res.redirect('/properties');
  }
});

// Edit property form
router.get('/:id/edit', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    
    if (!property) {
      req.flash('error', 'Property not found');
      return res.redirect('/properties');
    }
    
    res.render('properties/edit', {
      title: `Edit ${property.name}`,
      property,
      user: req.user,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Property edit form error:', error);
    req.flash('error', 'Error loading property for editing');
    res.redirect('/properties');
  }
});

// Update property
router.put('/:id', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    
    if (!property) {
      req.flash('error', 'Property not found');
      return res.redirect('/properties');
    }

    const {
      name,
      address,
      city,
      state,
      zipCode,
      county,
      propertyType,
      bedrooms,
      bathrooms,
      squareFootage,
      description,
      purchasePrice,
      purchaseDate,
      currentValue,
      isActive
    } = req.body;

    // Validate required fields
    if (!name || !address || !city || !state || !zipCode) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect(`/properties/${req.params.id}/edit`);
    }

    const updateData = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      county: county?.trim() || null,
      propertyType: propertyType || 'single-family',
      bedrooms: bedrooms ? parseInt(bedrooms) : 1,
      bathrooms: bathrooms ? parseFloat(bathrooms) : 1.0,
      squareFootage: squareFootage ? parseInt(squareFootage) : null,
      description: description?.trim() || null,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      purchaseDate: purchaseDate || null,
      isActive: isActive === 'true' || isActive === true
    };

    // Only update current value if it's provided and different
    if (currentValue && parseFloat(currentValue) !== parseFloat(property.currentValue)) {
      updateData.currentValue = parseFloat(currentValue);
      updateData.currentValueDate = new Date();
    }

    await property.update(updateData);
    
    req.flash('success', `Property "${property.name}" updated successfully!`);
    res.redirect(`/properties/${property.id}`);
  } catch (error) {
    console.error('Property update error:', error);
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message);
      req.flash('error', `Validation error: ${messages.join(', ')}`);
    } else {
      req.flash('error', 'Error updating property. Please try again.');
    }
    res.redirect(`/properties/${req.params.id}/edit`);
  }
});

// Delete property
router.delete('/:id', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id, {
      include: [{ model: Lease, as: 'leases' }]
    });
    
    if (!property) {
      req.flash('error', 'Property not found');
      return res.redirect('/properties');
    }

    // Check if property has active leases
    const activeLeases = property.leases ? property.leases.filter(lease => lease.status === 'active') : [];
    if (activeLeases.length > 0) {
      req.flash('error', 'Cannot delete property with active leases. Please terminate all leases first.');
      return res.redirect(`/properties/${property.id}`);
    }

    const propertyName = property.name;
    await property.destroy();
    
    req.flash('success', `Property "${propertyName}" deleted successfully.`);
    res.redirect('/properties');
  } catch (error) {
    console.error('Property deletion error:', error);
    req.flash('error', 'Error deleting property. Please try again.');
    res.redirect(`/properties/${req.params.id}`);
  }
});

module.exports = router; 