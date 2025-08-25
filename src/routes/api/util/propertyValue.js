module.exports = async function propertyValueHandler(req, res) {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    const baseValue = 500000;
    const randomFactor = 0.8 + (Math.random() * 0.4);
    const estimatedValue = Math.round(baseValue * randomFactor);
    res.json({ success: true, value: estimatedValue, source: 'Mock Real Estate API', confidence: 'Medium', lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('Property value error:', error);
    res.status(500).json({ success: false, message: 'Property value lookup failed' });
  }
}


