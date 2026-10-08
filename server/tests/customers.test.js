/** P27: customers from orders, for CRM. API-CONTRACT M22. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { Customer } from '../models/Customer.js';
import { ALL_MODELS } from '../models/index.js';
import { createTable, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let floor;
let other;
let baseUrl;
let tableCounter = 0;
const newTable = async () => (await createTable(floor.tokens.OWNER, { name: `Cust ${(tableCounter += 1)}` })).body.data;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  floor = await seedFloor();
  other = await seedFloor();
});
after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const seat = async (body) => {
  const table = await newTable();
  return request('POST', '/api/v1/orders', { token: floor.tokens.WAITER, body: { orderType: 'DINE_IN', tableId: table.id, guestCount: 2, ...body } });
};
const customerByPhone = (phone) => Customer.findOne({ restaurantId: floor.restaurant._id, phone }).lean();

describe('customers from seated tables', () => {
  it('records a customer with one visit and the consent given at the table', async () => {
    const response = await seat({ customerName: 'Asha Patel', customerPhone: '98765 43210', offersConsent: true });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.customerName, 'Asha Patel');
    const customer = await customerByPhone('9876543210');
    assert.equal(customer.visitCount, 1);
    assert.equal(customer.name, 'Asha Patel');
    assert.equal(customer.offers.given, true);
    assert.equal(customer.offers.source, 'STAFF');
    assert.equal(customer.offers.textVersion, '2026-10-v1');
    assert.equal(customer.offersHistory.length, 1);
  });

  it('a second visit counts, and a visit without the tick keeps the consent', async () => {
    assert.equal((await seat({ customerPhone: '9876543210' })).status, 201);
    const customer = await customerByPhone('9876543210');
    assert.equal(customer.visitCount, 2);
    assert.equal(customer.offers.given, true);
    assert.equal(customer.name, 'Asha Patel');
  });

  it('refuses consent without a phone; a name alone makes no customer', async () => {
    const refused = await seat({ customerName: 'No Phone', offersConsent: true });
    assert.equal(refused.status, 400);
    const before = await Customer.countDocuments({ restaurantId: floor.restaurant._id });
    assert.equal((await seat({ customerName: 'Just A Name' })).status, 201);
    assert.equal(await Customer.countDocuments({ restaurantId: floor.restaurant._id }), before);
  });

  it('a phone booking seated becomes a visit', async () => {
    const settings = await request('PATCH', '/api/v1/settings', { token: floor.tokens.OWNER, body: { reason: 'Bookings', features: { online: true }, online: { reservationsEnabled: true } } });
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    const table = await newTable();
    const booked = await request('POST', '/api/v1/online/reservations', {
      token: floor.tokens.CASHIER,
      body: { guestName: 'Ravi Shah', guestPhone: '9123456780', partySize: 4, at: new Date(Date.now() + 3600_000).toISOString() },
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    const seated = await request('POST', `/api/v1/online/reservations/${booked.body.data.id}/seat`, { token: floor.tokens.WAITER, body: { tableId: table.id, guestCount: 4 } });
    assert.equal(seated.status, 200, JSON.stringify(seated.body));
    const customer = await customerByPhone('9123456780');
    assert.equal(customer.visitCount, 1);
    assert.equal(customer.name, 'Ravi Shah');
  });
});

describe('the customers screen', () => {
  it('lists newest first, searches by name and by the last digits, filters on consent', async () => {
    const list = await request('GET', '/api/v1/customers', { token: floor.tokens.MANAGER });
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].phone, '9123456780');
    const agreed = await request('GET', '/api/v1/customers?offers=true', { token: floor.tokens.MANAGER });
    assert.deepEqual(agreed.body.data.map((row) => row.phone), ['9876543210']);
    const byName = await request('POST', '/api/v1/customers/search', { token: floor.tokens.MANAGER, body: { query: 'asha' } });
    assert.deepEqual(byName.body.data.map((row) => row.name), ['Asha Patel']);
    const byDigits = await request('POST', '/api/v1/customers/search', { token: floor.tokens.MANAGER, body: { query: '6780' } });
    assert.deepEqual(byDigits.body.data.map((row) => row.name), ['Ravi Shah']);
    const regex = await request('POST', '/api/v1/customers/search', { token: floor.tokens.MANAGER, body: { query: '.*' } });
    assert.deepEqual(regex.body.data, []);
  });

  it('shows visits, keeps a withdrawal in the history, and the owner alone downloads, audited without phones', async () => {
    const asha = (await request('POST', '/api/v1/customers/search', { token: floor.tokens.MANAGER, body: { query: 'asha' } })).body.data[0];
    const detail = await request('GET', `/api/v1/customers/${asha.id}`, { token: floor.tokens.MANAGER });
    assert.equal(detail.body.data.visits.length, 2);
    assert.equal(detail.body.data.totalSpentInPaise, 0);

    const noReason = await request('PATCH', `/api/v1/customers/${asha.id}`, { token: floor.tokens.MANAGER, body: { offersConsent: false } });
    assert.equal(noReason.status, 400);
    const withdrawn = await request('PATCH', `/api/v1/customers/${asha.id}`, { token: floor.tokens.MANAGER, body: { offersConsent: false, reason: 'Asked by phone' } });
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
    assert.equal(withdrawn.body.data.offers.given, false);
    assert.equal(withdrawn.body.data.offersHistory.length, 2);

    assert.equal((await request('GET', '/api/v1/customers/export', { token: floor.tokens.MANAGER })).status, 403);
    await request('PATCH', `/api/v1/customers/${asha.id}`, { token: floor.tokens.MANAGER, body: { offersConsent: true, reason: 'Said yes again at the counter' } });
    const file = await fetch(`${baseUrl}/api/v1/customers/export`, { headers: { Authorization: `Bearer ${floor.tokens.OWNER}` } });
    assert.equal(file.status, 200);
    const csv = await file.text();
    assert.match(csv, /^Name,Mobile number,Visits,Last visit,Agreed on,Consent text version\n/);
    assert.match(csv, /Asha Patel,9876543210,2,/);
    assert.equal(csv.includes('9123456780'), false, 'only those who agreed');
    const audit = await AuditLog.findOne({ restaurantId: floor.restaurant._id, action: 'CUSTOMERS_EXPORTED' }).lean();
    assert.equal(audit.details.count, 1);
    assert.equal(JSON.stringify(audit).includes('9876543210'), false);
  });

  it('is refused to a waiter, and another restaurant sees nothing', async () => {
    assert.equal((await request('GET', '/api/v1/customers', { token: floor.tokens.WAITER })).status, 403);
    assert.equal((await request('POST', '/api/v1/customers/search', { token: floor.tokens.CASHIER, body: { query: 'asha' } })).status, 403);
    const theirs = await request('GET', '/api/v1/customers', { token: other.tokens.OWNER });
    assert.deepEqual(theirs.body.data, []);
    const asha = await customerByPhone('9876543210');
    assert.equal((await request('GET', `/api/v1/customers/${asha._id}`, { token: other.tokens.OWNER })).status, 404);
  });
});
