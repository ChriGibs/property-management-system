// Simple CSRF guard for cookie-auth APIs: ensures same-origin or allowed origin on state-changing requests
const url = require('url');

function csrfOriginGuard(allowedOrigins) {
  const allowed = new Set((allowedOrigins || []).filter(Boolean));
  return function (req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const check = origin || referer;
    if (!check) return res.status(403).json({ error: 'Forbidden' });
    try {
      const parsed = url.parse(check);
      const normalized = `${parsed.protocol}//${parsed.host}`;
      if (allowed.size === 0 || allowed.has(normalized)) return next();
    } catch (err) {
      // ignore parse errors, will fail the check below
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = csrfOriginGuard;


