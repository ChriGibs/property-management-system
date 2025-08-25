const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email, isActive: true } });
    if (!user || !(await user.validatePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    user.lastLoginAt = new Date();
    await user.save();
    const payload = { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '1d' });
    res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ user: payload });
  } catch (err) {
    console.error('API login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

router.post('/refresh', (req, res) => {
  try {
    const raw = req.cookies && req.cookies.auth_token;
    if (!raw) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(raw, process.env.JWT_SECRET || 'dev_jwt_secret', { ignoreExpiration: true });
    const payload = { id: decoded.id, role: decoded.role, firstName: decoded.firstName, lastName: decoded.lastName, email: decoded.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '1d' });
    res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ user: payload });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

module.exports = router;


