/**
 * A small fake of Pine Labs' in-store cloud service, for tests. P25 Part I.
 * It answers UploadBilledTransaction, GetStatus and CancelTransaction in the
 * shapes of Pine Labs' public page. The codes for "still waiting" and
 * "declined" are made up here, because the public page does not give them.
 */
import http from 'node:http';

export const PATHS = Object.freeze({ upload: '/upload', status: '/status', cancel: '/cancel' });
// Made up for the fake: never a real or published Pine Labs value.
export const GOOD = Object.freeze({ merchantId: '10001', securityToken: 'fake-pine-labs-token-0001' });

export async function startFakePineLabs() {
  const state = { next: 4000001, transactions: new Map(), requests: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      state.requests.push({ path: req.url, body });
      const send = (payload) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (String(body.SecurityToken) !== GOOD.securityToken || String(body.MerchantID) !== GOOD.merchantId) {
        return send({ ResponseCode: 1, ResponseMessage: 'INVALID MERCHANT' });
      }
      if (req.url === PATHS.upload) {
        const ptrid = state.next++;
        state.transactions.set(String(ptrid), { amount: body.Amount, status: 'WAITING', body });
        return send({ ResponseCode: 0, ResponseMessage: 'APPROVED', PlutusTransactionReferenceID: ptrid, AdditionalInfo: null });
      }
      const transaction = state.transactions.get(String(body.PlutusTransactionReferenceID));
      if (req.url === PATHS.status) {
        if (!transaction) return send({ ResponseCode: 2, ResponseMessage: 'TXN NOT FOUND', PlutusTransactionReferenceID: body.PlutusTransactionReferenceID });
        if (transaction.status === 'APPROVED') {
          return send({
            ResponseCode: 0,
            ResponseMessage: 'TXN APPROVED',
            PlutusTransactionReferenceID: body.PlutusTransactionReferenceID,
            TransactionData: [
              { Tag: 'TID', Value: '30001234' },
              { Tag: 'MID', Value: 'MID777' },
              { Tag: 'PaymentMode', Value: transaction.mode ?? 'UPI' },
              { Tag: 'RRN', Value: transaction.rrn },
              { Tag: 'ApprovalCode', Value: 'A12345' },
              { Tag: 'CardNumber', Value: '************4321' },
              { Tag: 'AmountInPaisa', Value: String(transaction.approvedAmount ?? transaction.amount) },
            ],
          });
        }
        if (transaction.status === 'DECLINED') return send({ ResponseCode: 3, ResponseMessage: 'TXN DECLINED', PlutusTransactionReferenceID: body.PlutusTransactionReferenceID });
        if (transaction.status === 'VOIDED') return send({ ResponseCode: 1008, ResponseMessage: 'TXN VOIDED', PlutusTransactionReferenceID: body.PlutusTransactionReferenceID });
        return send({ ResponseCode: 1001, ResponseMessage: 'TXN UPLOADED', PlutusTransactionReferenceID: body.PlutusTransactionReferenceID });
      }
      if (req.url === PATHS.cancel) {
        if (transaction && transaction.status === 'WAITING') transaction.status = 'VOIDED';
        return send({ ResponseCode: 0, ResponseMessage: 'APPROVED' });
      }
      res.writeHead(404);
      return res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    state,
    approve(ptrid, { rrn = '628100123456', approvedAmount, mode } = {}) {
      Object.assign(state.transactions.get(String(ptrid)), { status: 'APPROVED', rrn, approvedAmount, mode });
    },
    decline(ptrid) {
      state.transactions.get(String(ptrid)).status = 'DECLINED';
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
