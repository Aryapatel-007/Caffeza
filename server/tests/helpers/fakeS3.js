/**
 * A fake of Backblaze B2's S3 API, for the backup tests. P54.
 *
 * Path-style requests to one bucket. It behaves like B2 where the backups
 * depend on it: an upload carrying the AWS SDK's newer checksum headers is
 * refused, as B2 refuses them; Content-MD5 is checked against the body; each
 * key may do only what its B2 key may (the server key writes, the drill key
 * lists and reads, nobody deletes). `failUploads` makes the next N uploads fail
 * with a 503, for the retry tests. No test ever reaches a real bucket.
 */
import { createHash } from 'node:crypto';
import http from 'node:http';

// Made up for the fake, never a real B2 value.
export const FAKE_BUCKET = 'fake-backup-bucket';
export const WRITE_KEY = { keyId: 'fakeWriteKeyId0001', secret: 'fake-write-secret-not-real-0001' };
export const READ_KEY = { keyId: 'fakeReadKeyId00001', secret: 'fake-read-secret-not-real-00001' };

const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function startFakeS3() {
  const state = { objects: new Map(), requests: [], failUploads: 0 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://fake');
      const [, bucket, ...rest] = url.pathname.split('/');
      const key = decodeURIComponent(rest.join('/'));
      const keyId = /Credential=([^/]+)\//.exec(req.headers.authorization ?? '')?.[1] ?? null;
      state.requests.push({ method: req.method, key, keyId, headers: req.headers });
      const fail = (status, code, message) => {
        res.writeHead(status, { 'Content-Type': 'application/xml' });
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${xml(message)}</Message></Error>`);
      };

      if (bucket !== FAKE_BUCKET) return fail(404, 'NoSuchBucket', 'The specified bucket does not exist.');
      const may = keyId === WRITE_KEY.keyId ? 'write' : keyId === READ_KEY.keyId ? 'read' : null;
      if (!may) return fail(403, 'InvalidAccessKeyId', 'The key is not valid.');

      if (req.method === 'PUT') {
        if (may !== 'write') return fail(403, 'AccessDenied', 'This key cannot write files.');
        const unsupported = Object.keys(req.headers).find((name) => name.startsWith('x-amz-checksum-') || name === 'x-amz-sdk-checksum-algorithm');
        if (unsupported) return fail(400, 'InvalidArgument', `Unsupported header '${unsupported}' received for this API call.`);
        if (/aws-chunked/i.test(req.headers['content-encoding'] ?? '')) return fail(400, 'InvalidArgument', 'Unsupported content encoding.');
        const md5 = req.headers['content-md5'];
        if (!md5) return fail(400, 'InvalidRequest', 'Content-MD5 is required for a bucket with Object Lock.');
        if (createHash('md5').update(body).digest('base64') !== md5) return fail(400, 'BadDigest', 'The Content-MD5 does not match the body.');
        if (state.failUploads > 0) {
          state.failUploads -= 1;
          return fail(503, 'ServiceUnavailable', 'Please try again.');
        }
        state.objects.set(key, { body, lastModified: new Date() });
        res.writeHead(200, { ETag: `"${createHash('md5').update(body).digest('hex')}"` });
        return res.end();
      }

      if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
        if (may !== 'read') return fail(403, 'AccessDenied', 'This key cannot list files.');
        const prefix = url.searchParams.get('prefix') ?? '';
        const found = [...state.objects.entries()].filter(([name]) => name.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
        const contents = found
          .map(([name, object]) => `<Contents><Key>${xml(name)}</Key><LastModified>${object.lastModified.toISOString()}</LastModified><Size>${object.body.length}</Size></Contents>`)
          .join('');
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        return res.end(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${FAKE_BUCKET}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${found.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
        );
      }

      if (req.method === 'GET') {
        if (may !== 'read') return fail(403, 'AccessDenied', 'This key cannot read files.');
        const object = state.objects.get(key);
        if (!object) return fail(404, 'NoSuchKey', 'The specified key does not exist.');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': object.body.length });
        return res.end(object.body);
      }

      if (req.method === 'DELETE') return fail(403, 'AccessDenied', 'No key may delete a backup.');
      return fail(405, 'MethodNotAllowed', 'Not supported by the fake.');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {
    endpoint,
    state,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
