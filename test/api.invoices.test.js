const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, sequelize } = require('../src/app');
const { Invoice, Payment, PaymentAllocation, User } = require('../src/models');

function authed(req) {
  const user = { id: 1, role: 'admin', firstName: 'Test', lastName: 'User', email: 'test@example.com' };
  const token = jwt.sign(user, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: '5m' });
  return req.set('Cookie', [`auth_token=${token}`]).set('Origin', process.env.CLIENT_BASE_URL || 'http://localhost:5173');
}

async function resetDb() {
  await sequelize.sync({ force: true });
}

describe('API /invoices', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:5173';
    await resetDb();
    await User.create({ firstName: 'Test', lastName: 'User', email: 'test@example.com', password: 'password', role: 'admin' });
  });

  after(async () => {
    await sequelize.close();
  });

  it('lists invoices (empty)', async () => {
    const res = await authed(request(app).get('/api/invoices')).expect(200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 0);
  });

  it('creates and fetches invoice detail with totals', async () => {
    const create = await authed(request(app).post('/api/invoices')).send({ rentAmount: 1000, dueDate: new Date().toISOString(), invoiceNumber: require('../src/models/Invoice').generateInvoiceNumber(), invoiceDate: new Date().toISOString(), periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() }).expect(201);
    const id = create.body.data.id;

    // Add a payment allocation
    const p = await Payment.create({ invoiceId: null, amount: 500, paymentDate: new Date(), status: 'completed', paymentMethod: 'online' });
    await PaymentAllocation.create({ paymentId: p.id, invoiceId: id, amount: 500 });

    const show = await authed(request(app).get(`/api/invoices/${id}`)).expect(200);
    assert.equal(show.body.data.invoice.id, id);
    assert.equal(show.body.data.totals.totalPaid, 500);
  });
});


