/**
 * P25 Part C: the page a print gets, the full-page invoice, and the review link.
 * docs/API-CONTRACT.md M3 section 16.1 and M7 "Setting groups added by P25".
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  charactersFor,
  pageCss,
  PRINTER_KEYS,
  printerFor,
  THERMAL_FEED_MM,
} from '../../client/src/features/printing/printers.js';
import { ALL_MODELS } from '../models/index.js';
import { paiseToRupees } from '../utils/money.js';
import { buildGoldenDay } from './helpers/goldenDay.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

describe('the page a print gets', () => {
  it('gives a thermal roll two lengths, the content height plus the feed, and never auto', () => {
    for (const printer of ['THERMAL_80', 'THERMAL_58']) {
      const css = pageCss({ printer, contentHeightMm: 143.2 });
      const width = printer === 'THERMAL_80' ? 80 : 58;
      assert.equal(css, `@page { size: ${width}mm ${144 + THERMAL_FEED_MM}mm; margin: 0; }`);
      assert.doesNotMatch(css, /auto/);
      assert.match(css, /size: \d+mm \d+mm;/);
    }
  });

  it('gives A4 and A5 their own paper with 12 mm margins', () => {
    assert.equal(pageCss({ printer: 'A4' }), '@page { size: A4; margin: 12mm; }');
    assert.equal(pageCss({ printer: 'A5' }), '@page { size: A5; margin: 12mm; }');
    for (const printer of PRINTER_KEYS) assert.doesNotMatch(pageCss({ printer, contentHeightMm: 50 }), /auto/);
  });

  it('refuses a thermal page with no measured height, and an unknown printer', () => {
    assert.throws(() => pageCss({ printer: 'THERMAL_80' }), /measured height/);
    assert.throws(() => pageCss({ printer: 'THERMAL_80', contentHeightMm: 0 }), /measured height/);
    assert.throws(() => pageCss({ printer: 'LETTER', contentHeightMm: 50 }), /Unknown printer/);
  });

  it('moves a device that saved a paper width to the same paper, as a printer', () => {
    assert.equal(printerFor({ paperMm: 80 }), 'THERMAL_80');
    assert.equal(printerFor({ paperMm: 58 }), 'THERMAL_58');
    assert.equal(printerFor({}), 'THERMAL_80');
    assert.equal(printerFor({ printer: 'A5', paperMm: 58 }), 'A5');
    assert.equal(charactersFor('THERMAL_58'), 32);
    assert.equal(charactersFor('A4'), 48);
  });
});

describe('the receipt and the full-page invoice', () => {
  it('print the same amounts for every golden day bill', async () => {
    const token = golden.tokens.OWNER;
    const ids = Object.entries(golden.ids.bills);
    assert.equal(ids.length, 16);

    for (const [name, billId] of ids) {
      const invoice = (await request('GET', `/api/v1/bills/${billId}/invoice`, { token })).body.data;
      const bill = (await request('GET', `/api/v1/bills/${billId}`, { token })).body.data;
      const { text } = (await request('GET', `/api/v1/bills/${billId}/receipt?width=48`, { token })).body.data;

      // The invoice carries the bill's own frozen figures, unchanged.
      assert.equal(invoice.billNumber, bill.billNumber, name);
      assert.equal(invoice.itemTotalInPaise, bill.subtotalInPaise, name);
      assert.equal(invoice.gstInPaise, bill.totalTaxInPaise, name);
      assert.equal(invoice.cgstInPaise + invoice.sgstInPaise, bill.totalTaxInPaise, name);
      assert.equal(invoice.roundOffInPaise, bill.roundOffInPaise, name);
      assert.equal(invoice.billTotalInPaise, bill.grandTotalInPaise, name);
      assert.equal(invoice.discount?.amountInPaise ?? 0, bill.discount?.amountInPaise ?? 0, name);
      assert.deepEqual(invoice.lines.map((line) => line.lineTotalInPaise), bill.lines.map((line) => line.lineTotalInPaise), name);
      assert.deepEqual(invoice.payments.map((payment) => payment.amountInPaise), bill.payments.map((payment) => payment.amountInPaise), name);

      // And the paper prints every one of those amounts.
      const onPaper = (paise) => assert.ok(text.includes(paiseToRupees(Math.abs(paise))), `${name}: ${paiseToRupees(paise)} is not on the receipt`);
      onPaper(invoice.itemTotalInPaise);
      onPaper(invoice.billTotalInPaise);
      invoice.lines.forEach((line) => onPaper(line.lineTotalInPaise));
      invoice.taxRows.forEach((row) => {
        onPaper(row.cgstInPaise);
        onPaper(row.sgstInPaise);
      });
      if (invoice.discount) onPaper(invoice.discount.amountInPaise);
      if (invoice.roundOffInPaise !== 0) onPaper(invoice.roundOffInPaise);
      invoice.payments.forEach((payment) => onPaper(payment.amountInPaise));
      assert.ok(text.includes(invoice.billNumber), name);
    }
  });

  it('is readable by the same six roles as the receipt, and by no other restaurant', async () => {
    const billId = golden.ids.bills.B01;
    for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'STOREKEEPER']) {
      if (!golden.tokens[role]) continue;
      for (const path of ['invoice', 'receipt']) {
        const response = await request('GET', `/api/v1/bills/${billId}/${path}`, { token: golden.tokens[role] });
        assert.equal(response.status, 200, `${role} ${path}`);
      }
    }
    assert.equal((await request('GET', `/api/v1/bills/${billId}/invoice`)).status, 401);
    const other = await seedTeam();
    assert.equal((await request('GET', `/api/v1/bills/${billId}/invoice`, { token: other.tokens.OWNER })).status, 404);
  });

  it('prints the receipt settings, and Duplicate never on a first print', async () => {
    const owner = golden.tokens.OWNER;
    const billId = golden.ids.bills.B01;
    const before = (await request('GET', `/api/v1/bills/${billId}/receipt?width=48`, { token: owner })).body.data;
    assert.equal(before.reviewLinkUrl, null);
    assert.doesNotMatch(before.text, /DUPLICATE|Scan to review us/);
    assert.match(before.text, /TAX INVOICE/);

    const receipt = { headerLine2: 'Indian Street Food', footerText: 'Swaad bhi, Yaad bhi!', reviewLinkUrl: 'https://example.com/review' };
    const patch = await request('PATCH', '/api/v1/settings', { token: owner, body: { reason: 'Receipt lines', receipt } });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    try {
      const after = (await request('GET', `/api/v1/bills/${billId}/receipt?width=48`, { token: owner })).body.data;
      assert.equal(after.reviewLinkUrl, 'https://example.com/review');
      assert.match(after.text, /Indian Street Food/);
      assert.match(after.text, /Swaad bhi, Yaad bhi!/);
      assert.match(after.text, /Scan to review us/);
      const invoice = (await request('GET', `/api/v1/bills/${billId}/invoice`, { token: owner })).body.data;
      assert.deepEqual(invoice.restaurant.headerLines, ['Indian Street Food']);
      assert.equal(invoice.footerText, 'Swaad bhi, Yaad bhi!');
      assert.equal(invoice.isDuplicate, false);
    } finally {
      await request('PATCH', '/api/v1/settings', {
        token: owner,
        body: { reason: 'Back', receipt: { headerLine2: null, footerText: null, reviewLinkUrl: null } },
      });
    }
  });
});

describe('the review link setting', () => {
  it('accepts an https address and clears with an empty string', async () => {
    const team = await seedTeam();
    const set = await request('PATCH', '/api/v1/settings', {
      token: team.tokens.OWNER,
      body: { reason: 'Review QR', receipt: { reviewLinkUrl: 'https://g.page/r/abc123/review' } },
    });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.data.receipt.reviewLinkUrl, 'https://g.page/r/abc123/review');

    const cleared = await request('PATCH', '/api/v1/settings', {
      token: team.tokens.OWNER,
      body: { reason: 'No QR', receipt: { reviewLinkUrl: '' } },
    });
    assert.equal(cleared.body.data.receipt.reviewLinkUrl, null);
  });

  it('refuses http, anything not a web address, and anything over 300 characters', async () => {
    const team = await seedTeam();
    for (const bad of ['http://g.page/r/abc', 'not a link', 'https://', `https://example.com/${'a'.repeat(290)}`]) {
      const response = await request('PATCH', '/api/v1/settings', {
        token: team.tokens.OWNER,
        body: { reason: 'Review QR', receipt: { reviewLinkUrl: bad } },
      });
      assert.equal(response.status, 400, bad.slice(0, 40));
    }
  });
});
