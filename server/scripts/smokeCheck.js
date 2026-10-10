/**
 * The smoke check, run after every deploy. P12.
 *
 *   npm run smoke -- --url https://staging.example.com
 *
 * Reads only and never signs in, so it is safe against production: it creates
 * no order, no bill and no session. One line per check, pass or fail, and an
 * exit code of 1 if any check failed.
 */
import { pathToFileURL } from 'node:url';

/** Follows nothing: a redirect is an answer the checks want to see. */
async function get(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}

const ROOT_DIV = '<div id="root">';

/**
 * Every check, in order, against `baseUrl`. Each returns `{ name, status:
 * 'pass'|'fail'|'skip', detail }`.
 */
export async function runSmokeChecks(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  const results = [];
  const check = async (name, run) => {
    try {
      const outcome = await run();
      results.push({ name, ...outcome });
    } catch (error) {
      results.push({ name, status: 'fail', detail: error.message });
    }
  };

  let html = '';

  await check('health answers, the database is connected, the release is shown', async () => {
    const response = await get(`${base}/api/v1/health`);
    const data = response.json?.data;
    if (response.status !== 200) return { status: 'fail', detail: `status ${response.status}` };
    if (data?.database !== 'connected') return { status: 'fail', detail: `database ${data?.database}` };
    if (!('release' in (data ?? {}))) return { status: 'fail', detail: 'no release field' };
    return { status: 'pass', detail: `release ${data.release ?? 'not set'}` };
  });

  // P30. What the pingers call: it must answer, and never from a cache.
  await check('the wake address answers, never cached', async () => {
    const response = await get(`${base}/api/v1/wake`);
    if (response.status !== 200 || response.json?.data?.ok !== true) return { status: 'fail', detail: `status ${response.status}` };
    const cache = response.headers?.get?.('cache-control') ?? null;
    if (cache !== null && cache !== 'no-store') return { status: 'fail', detail: `Cache-Control ${cache}` };
    return { status: 'pass', detail: `up ${response.json.data.uptimeSeconds} s` };
  });

  await check('the home page is the app', async () => {
    const response = await get(`${base}/`);
    html = response.text;
    return response.status === 200 && html.includes(ROOT_DIV)
      ? { status: 'pass' }
      : { status: 'fail', detail: `status ${response.status}, root element ${html.includes(ROOT_DIV) ? 'found' : 'missing'}` };
  });

  await check('a page address like /day-close reloads into the app', async () => {
    const response = await get(`${base}/day-close`);
    return response.status === 200 && response.text.includes(ROOT_DIV)
      ? { status: 'pass' }
      : { status: 'fail', detail: `status ${response.status}` };
  });

  await check('an unknown API address is a JSON 404, not the app', async () => {
    const response = await get(`${base}/api/v1/no-such-route`);
    const isJson = response.json?.success === false && response.json?.error?.code === 'NOT_FOUND';
    return response.status === 404 && isJson && !response.text.includes(ROOT_DIV)
      ? { status: 'pass' }
      : { status: 'fail', detail: `status ${response.status}, ${isJson ? 'JSON' : 'not JSON'}` };
  });

  await check('a built asset is served with the long cache header', async () => {
    const asset = /(?:src|href)="(\/assets\/[^"]+)"/.exec(html)?.[1];
    if (!asset) return { status: 'fail', detail: 'no /assets/ file named in the HTML' };
    const response = await get(`${base}${asset}`);
    const cache = response.headers.get('cache-control') ?? '';
    return response.status === 200 && cache.includes('immutable') && cache.includes('max-age=31536000')
      ? { status: 'pass', detail: asset }
      : { status: 'fail', detail: `status ${response.status}, cache-control "${cache}"` };
  });

  await check('security headers: Strict-Transport-Security and a content security policy', async () => {
    const response = await get(`${base}/api/v1/health`);
    const hsts = response.headers.get('strict-transport-security');
    const csp = response.headers.get('content-security-policy');
    return hsts && csp ? { status: 'pass' } : { status: 'fail', detail: `hsts ${hsts ? 'yes' : 'no'}, csp ${csp ? 'yes' : 'no'}` };
  });

  await check('plain http is refused or sent to https', async () => {
    if (!base.startsWith('https://')) return { status: 'skip', detail: 'skipped for http' };
    const plain = base.replace(/^https:\/\//, 'http://');
    try {
      const response = await get(`${plain}/api/v1/health`);
      const location = response.headers.get('location') ?? '';
      return response.status >= 300 && response.status < 400 && location.startsWith('https://')
        ? { status: 'pass', detail: `redirects to ${location}` }
        : { status: 'fail', detail: `http answered ${response.status} without moving to https` };
    } catch {
      return { status: 'pass', detail: 'http refused' };
    }
  });

  await check('the API answers a login with no body with 400, without signing in', async () => {
    const response = await get(`${base}/api/v1/auth/login`, { method: 'POST', body: {} });
    return response.status === 400 ? { status: 'pass' } : { status: 'fail', detail: `status ${response.status}` };
  });

  return results;
}

export function formatResults(results) {
  return results
    .map((result) => `${result.status.toUpperCase().padEnd(4)}  ${result.name}${result.detail ? `  (${result.detail})` : ''}`)
    .join('\n');
}

async function main() {
  const index = process.argv.indexOf('--url');
  const url = index === -1 ? null : process.argv[index + 1];
  if (!url) {
    console.error('Give the address to check with --url, for example --url https://staging.example.com');
    process.exitCode = 1;
    return;
  }
  const results = await runSmokeChecks(url);
  console.log(formatResults(results));
  const failed = results.filter((result) => result.status === 'fail').length;
  console.log(failed === 0 ? '\nEvery check passed.' : `\n${failed} check${failed === 1 ? '' : 's'} failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
