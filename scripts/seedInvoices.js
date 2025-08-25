#!/usr/bin/env node
/* Seed monthly invoices for a lease between two months (inclusive)
   Usage: node scripts/seedInvoices.js <leaseId> <startYYYY-MM> <endYYYY-MM>
*/

const { sequelize, Lease, Invoice } = require('../src/models');
const { Op } = require('sequelize');

function parseMonth(str) {
  const [y, m] = str.split('-').map((v) => parseInt(v, 10));
  if (!y || !m || m < 1 || m > 12) throw new Error(`Invalid month: ${str}`);
  return { y, m };
}

function firstOfMonth(y, m) {
  // Set to midday UTC to avoid TZ shifting into previous local day
  return new Date(Date.UTC(y, m - 1, 1, 12));
}

function lastOfMonth(y, m) {
  // Midday UTC on the last day
  return new Date(Date.UTC(y, m, 0, 12)); // day 0 of next month -> last day of current
}

function utcAt(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12));
}

(async () => {
  const [leaseIdArg, startArg, endArg, resetFlag] = process.argv.slice(2);
  if (!leaseIdArg || !startArg || !endArg) {
    console.error('Usage: node scripts/seedInvoices.js <leaseId> <startYYYY-MM> <endYYYY-MM> [--reset]');
    process.exit(1);
  }

  const leaseId = parseInt(leaseIdArg, 10);
  const { y: startY, m: startM } = parseMonth(startArg);
  const { y: endY, m: endM } = parseMonth(endArg);

  await sequelize.authenticate();
  const lease = await Lease.findByPk(leaseId);
  // Optional purge existing invoices for the range
  if (resetFlag === '--reset') {
    const startRange = new Date(Date.UTC(startY, startM - 1, 1, 0));
    const endRange = new Date(Date.UTC(endY, endM, 0, 23, 59, 59));
    const deleted = await Invoice.destroy({ where: { leaseId, periodStart: { [Op.between]: [startRange, endRange] } } });
    console.log(`Deleted ${deleted} existing invoices in range for lease ${leaseId}`);
  }
  if (!lease) {
    console.error(`Lease ${leaseId} not found`);
    process.exit(1);
  }

  const rent = parseFloat(lease.monthlyRent || 0);
  const dueDay = lease.rentDueDay || 1;

  // iterate months
  const created = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    const periodStart = firstOfMonth(y, m);
    const periodEnd = lastOfMonth(y, m);
    const invoiceDate = firstOfMonth(y, m);
    const dueDate = utcAt(y, m, Math.max(1, Math.min(28, dueDay)));

    // prevent duplicates by leaseId + periodStart
    const existing = await Invoice.findOne({ where: { leaseId, periodStart } });
    if (!existing) {
      const invoiceNumber = Invoice.generateInvoiceNumber();
      const inv = await Invoice.create({
        leaseId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        periodStart,
        periodEnd,
        rentAmount: rent,
        lateFeeAmount: 0,
        otherCharges: 0,
        status: 'sent',
      });
      created.push(inv.id);
    } else {
      // Update dates in case they were previously seeded with TZ-shifted values
      await existing.update({ invoiceDate, dueDate });
    }

    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  console.log(`Seed complete. Created ${created.length} invoices for lease ${leaseId}. IDs:`, created);
  await sequelize.close();
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (e) { /* noop */ }
  process.exit(1);
});


