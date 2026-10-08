/**
 * What may differ between TallyPrime and Tally.ERP 9. P25 Part J4.6.
 *
 * Both accept XML posted over HTTP to their own server, and both import an
 * XML file: an ENVELOPE whose HEADER asks to "Import Data" and whose BODY
 * holds IMPORTDATA, REQUESTDESC (REPORTNAME, STATICVARIABLES with
 * SVCURRENTCOMPANY) and REQUESTDATA with TALLYMESSAGE elements, from Tally's
 * own documentation (https://help.tallysolutions.com/xml-integration/).
 * The two profiles start the same. One changes only when a real test against
 * that version shows a difference, recorded in docs/INTEGRATIONS.md. Nothing
 * outside this file branches on the version.
 */
const BASE = Object.freeze({
  dateFormat: (businessDate) => businessDate.replaceAll('-', ''),
  encoding: 'UTF-8',
  ledgerEntriesTag: 'ALLLEDGERENTRIES.LIST',
  voucherAction: 'Create',
  ledgerAction: 'Create',
});

export const PROFILES = Object.freeze({
  TALLY_PRIME: Object.freeze({ ...BASE, name: 'TallyPrime' }),
  TALLY_ERP9: Object.freeze({ ...BASE, name: 'Tally.ERP 9' }),
});

export function profileFor(version) {
  const profile = PROFILES[version];
  if (!profile) throw new Error(`No Tally profile for ${version}.`);
  return profile;
}

export default { PROFILES, profileFor };
