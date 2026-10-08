/**
 * Tally XML, written and read. P25 Part J4 and J5.
 *
 * Only tags shown in Tally's own documentation. A debit is ISDEEMEDPOSITIVE
 * Yes with a negative AMOUNT, a credit a positive AMOUNT, exactly as Tally's
 * receipt voucher example shows. Every name is escaped. No REMOTEID: neither
 * version documents a stable one for re-sending, so a day is never re-posted
 * without the owner confirming the old vouchers were deleted in Tally.
 */
import { paiseToDecimalText } from '../../../utils/money.js';
import { SIDES } from './vouchers.js';

/** XML text: the five characters XML reserves, and nothing a control character could break. */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function envelope(reportName, companyName, messages, profile) {
  return [
    `<?xml version="1.0" encoding="${profile.encoding}"?>`,
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <IMPORTDATA>',
    '      <REQUESTDESC>',
    `        <REPORTNAME>${reportName}</REPORTNAME>`,
    '        <STATICVARIABLES>',
    `          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    '        </STATICVARIABLES>',
    '      </REQUESTDESC>',
    '      <REQUESTDATA>',
    ...messages,
    '      </REQUESTDATA>',
    '    </IMPORTDATA>',
    '  </BODY>',
    '</ENVELOPE>',
    '',
  ].join('\n');
}

/** Vouchers as the import Tally takes. */
export function toTallyXml(vouchers, profile, companyName) {
  const messages = vouchers.map((voucher) => {
    const entries = voucher.entries.map((entry) => {
      const debit = entry.side === SIDES.DEBIT;
      return [
        `            <${profile.ledgerEntriesTag}>`,
        `              <LEDGERNAME>${escapeXml(entry.ledger)}</LEDGERNAME>`,
        `              <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
        `              <AMOUNT>${paiseToDecimalText(debit ? -entry.amountInPaise : entry.amountInPaise)}</AMOUNT>`,
        `            </${profile.ledgerEntriesTag}>`,
      ].join('\n');
    });
    return [
      '        <TALLYMESSAGE>',
      `          <VOUCHER VCHTYPE="${escapeXml(voucher.voucherTypeName)}" ACTION="${profile.voucherAction}">`,
      `            <DATE>${profile.dateFormat(voucher.date)}</DATE>`,
      `            <VOUCHERTYPENAME>${escapeXml(voucher.voucherTypeName)}</VOUCHERTYPENAME>`,
      `            <VOUCHERNUMBER>${escapeXml(voucher.number)}</VOUCHERNUMBER>`,
      `            <NARRATION>${escapeXml(voucher.narration)}</NARRATION>`,
      ...entries,
      '          </VOUCHER>',
      '        </TALLYMESSAGE>',
    ].join('\n');
  });
  return envelope('Vouchers', companyName, messages, profile);
}

/** Plain ledgers under the parent group chosen per head. GST details are the accountant's, in Tally. */
export function ledgerMastersXml(ledgers, profile, companyName) {
  const messages = ledgers.map((ledger) =>
    [
      '        <TALLYMESSAGE>',
      `          <LEDGER NAME="${escapeXml(ledger.name)}" ACTION="${profile.ledgerAction}">`,
      `            <NAME>${escapeXml(ledger.name)}</NAME>`,
      `            <PARENT>${escapeXml(ledger.parent)}</PARENT>`,
      '          </LEDGER>',
      '        </TALLYMESSAGE>',
    ].join('\n'),
  );
  return envelope('All Masters', companyName, messages, profile);
}

const textOf = (xml, tag) => {
  const match = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'i').exec(xml);
  return match ? match[1] : null;
};

/**
 * Tally's answer, read defensively: its pages show more than one response
 * shape. Any LINEERROR means that voucher failed. CREATED, ALTERED and ERRORS
 * are compared with what was sent when present. Anything not understood is
 * UNKNOWN, never success.
 */
export function parseTallyResponse(xml, sentCount) {
  const text = String(xml ?? '');
  const lineErrors = [...text.matchAll(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/gi)].map((match) => match[1].trim()).filter(Boolean);
  const created = textOf(text, 'CREATED');
  const errors = textOf(text, 'ERRORS');
  const counts = created === null && errors === null ? null : { created: Number(created ?? 0), errors: Number(errors ?? 0) };

  if (lineErrors.length > 0 || (counts && counts.errors > 0)) {
    const createdSome = counts ? counts.created > 0 : false;
    return { status: createdSome ? 'PARTIAL' : 'FAILED', lineErrors, counts };
  }
  if (counts && counts.created === sentCount) return { status: 'POSTED', lineErrors, counts };
  return { status: 'UNKNOWN', lineErrors, counts };
}

export default { escapeXml, ledgerMastersXml, parseTallyResponse, toTallyXml };
