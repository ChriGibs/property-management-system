const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, sequelize } = require('../src/app');
const { Invoice, PaymentAllocation, User } = require('../src/models');

function authed(req) {
  const user = { id: 1, role: 'admin', firstName: 'Test', lastName: 'User', email: 'test@example.com' };
  const token = jwt.sign(user, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '5m' });
  return req.set('Cookie', [`auth_token=${token}`]).set('Origin', process.env.CLIENT_BASE_URL || 'http://localhost:5173');
}

async function resetDb() {
  await sequelize.sync({ force: true });
}

describe('API /payments', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:5173';
    await resetDb();
    await User.create({ firstName: 'Test', lastName: 'User', email: 'test@example.com', password: 'password', role: 'admin' });
  });

  after(async () => {
    await sequelize.close();
  });

  it('creates a payment with allocations', async () => {
    const inv = await Invoice.create({
      invoiceNumber: require('../src/models/Invoice').generateInvoiceNumber(),
      invoiceDate: new Date(),
      periodStart: new Date(),
      periodEnd: new Date(),
      dueDate: new Date(),
      rentAmount: 1000,
      status: 'sent'
    });
    const res = await authed(request(app).post('/api/payments')).send({ allocations: [{ invoiceId: inv.id, amount: 200 }], paymentMethod: 'online' }).expect(201);
    assert.ok(res.body.data.id);
    const allocs = await PaymentAllocation.findAll({ where: { invoiceId: inv.id } });
    assert.equal(allocs.length, 1);
    assert.equal(Number(allocs[0].amount), 200);
  });
});


