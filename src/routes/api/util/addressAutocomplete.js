module.exports = async function addressAutocompleteHandler(req, res) {
  try {
    const query = req.query.q;
    if (!query || query.length < 3) {
      return res.json({ suggestions: [] });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    const mockSuggestions = [
      { formatted_address: `${query} Main St, San Francisco, CA 94102`, street_address: `${query} Main St`, city: 'San Francisco', state: 'CA', zip_code: '94102', county: 'San Francisco County' },
      { formatted_address: `${query} Oak Ave, Oakland, CA 94610`, street_address: `${query} Oak Ave`, city: 'Oakland', state: 'CA', zip_code: '94610', county: 'Alameda County' },
      { formatted_address: `${query} Pine St, Berkeley, CA 94704`, street_address: `${query} Pine St`, city: 'Berkeley', state: 'CA', zip_code: '94704', county: 'Alameda County' }
    ];
    res.json({ suggestions: mockSuggestions.slice(0, 3) });
  } catch (error) {
    console.error('Address autocomplete error:', error);
    res.status(500).json({ error: 'Address lookup failed' });
  }
}


