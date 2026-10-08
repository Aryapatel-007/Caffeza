/**
 * A fake Tally HTTP server for P25 Part K's tests. It answers the documented
 * collection export with companies or ledgers, and an import with CREATED and
 * ERRORS counts, or whatever reply a test sets.
 */
import { createServer } from 'node:http';

import { escapeXml } from '../../services/integrations/tally/xml.js';

export async function startFakeTally({ companies = ['Tally Cafe & Co'], ledgers = [] } = {}) {
  const state = { companies, ledgers, imports: [], importReply: null };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let reply;
      if (/<TYPE>Company<\/TYPE>/.test(body)) {
        reply = state.companies.map((name) => `<COMPANY NAME="${escapeXml(name)}" RESERVEDNAME=""></COMPANY>`).join('');
      } else if (/<TYPE>Ledger<\/TYPE>/.test(body)) {
        reply = state.ledgers.map((name) => `<LEDGER NAME="${escapeXml(name)}" RESERVEDNAME=""><PARENT>Any</PARENT></LEDGER>`).join('');
      } else if (/<TALLYREQUEST>Import Data<\/TALLYREQUEST>/.test(body)) {
        state.imports.push(body);
        const count = (body.match(/<TALLYMESSAGE>/g) ?? []).length;
        reply = state.importReply ?? `<RESPONSE><CREATED>${count}</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><ERRORS>0</ERRORS></RESPONSE>`;
      } else {
        res.writeHead(400).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/xml' }).end(`<ENVELOPE><BODY><DATA><COLLECTION>${reply}</COLLECTION></DATA></BODY></ENVELOPE>`);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { state, address: `127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
