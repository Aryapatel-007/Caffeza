# Performance baseline

The numbers P31 to P34 are checked against. Each later prompt re-measures the
same things the same way and adds its figures beside these.

Every figure says how it was taken:

- **Measured, live**: against the deployed system, `zchaat-pos-api.onrender.com`
  or `zchaat-pos.vercel.app`, from Rishi's Mac.
- **Measured, live data**: this repository's code running on Rishi's Mac against
  the live Atlas database, with an access token signed locally for Z Chaat's
  owner. GET requests only: no sign-in, no session, nothing written. The
  response bodies are the bytes the deployed server builds from the same data.
- **Measured, local**: the e2e server (`server/scripts/e2eServer.js`) with the
  golden day, in Playwright's Chromium.
- **Built**: `npm run build` on Rishi's Mac.

---

## P30, 2026-10-10, at commit `bfc909d`

### 1. Cold and warm start (section 6a)

Measured, live, 2026-10-10 13:25 UTC (6:55 PM in India, during Z Chaat's service):

| Request | Time to first byte | Total |
|---|---|---|
| First request | 0.532 s | 0.532 s |
| Warm 1 to 5 | 0.237, 0.339, 0.731, 0.218, 0.376 s | the same |

**The first request was not cold.** The service had been used within the last
fifteen minutes, almost certainly by Z Chaat's own devices, so it had not gone
to sleep. A true cold start cannot be taken while the restaurant is open.

Rishi chose to stay on Render's free plan (section 7 of P30), so the cold start
stays. Render's documentation says a free instance spins down after 15 minutes
with no request and takes about a minute to start again; `docs/DEPLOYMENT.md`
section 14 already says the same. To measure it, run this the first thing in
the morning, before anyone at Z Chaat opens a screen, and add the figure here:

```
curl -s -o /dev/null -w "cold ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
  https://zchaat-pos-api.onrender.com/api/v1/health
```

### 2. Compression (section 6b)

Measured, live:

| URL | `content-encoding` |
|---|---|
| `zchaat-pos-api.onrender.com/api/v1/health` | `br` |
| `zchaat-pos.vercel.app/api/v1/health`, through Vercel's rewrite | `br` |
| `zchaat-pos-api.onrender.com/` and its main script | `br` |

**Responses already reach devices compressed, but not by our server.** Render
puts Cloudflare in front of every service (`server: cloudflare`), and
Cloudflare compresses with Brotli on the way out, even a 125-byte health
answer. Vercel's rewrite passes the Brotli answer through unchanged.

Our own Express app compresses nothing. Measured, live data, bytes the app sends:

| Request | Bytes, no `Accept-Encoding` | Bytes, `Accept-Encoding: gzip` |
|---|---|---|
| `GET /api/v1/menu` (Z Chaat, 97 dishes, 14 categories) | 46,022 | 46,022, not compressed |
| `GET /api/v1/tables` (14 tables) | 8,974 | 8,974 |
| `GET /api/v1/bills?limit=50` | 6,481 | 6,481 |
| `GET /api/v1/categories` | 4,010 | 4,010 |
| `GET /api/v1/auth/me` | 2,495 | 2,495 |

So P31's compression is not the bandwidth win on the device leg its prompt
expected while the server is on Render. It would be on any host without an
edge that compresses, which the container in `docs/DEPLOYMENT.md` section 13
is written to allow.

### 3. Where the database is (section 6c)

Read from the cluster itself: `hello` returns Atlas's node tags.

| Part | Region |
|---|---|
| Render service `zchaat-pos-api` | `singapore` (`render.yaml`) |
| Atlas `cluster0.dkcsfcz` | **AWS `AP_SOUTH_1`, Mumbai** (`availabilityZone: aps1-az3`), 3 nodes |

**They differ. That is a finding.** Every database query the server makes
crosses Singapore to Mumbai and back. `authenticate` makes two, one after the
other, before any route handler runs. The written plan is in
`docs/DEPLOYMENT.md` section 15.

Measured from Rishi's Mac to the Mumbai cluster: `ping` 30 to 65 ms,
median about 40 ms. The Singapore to Mumbai round trip itself was not measured,
because nothing of ours runs in Singapore that can time it without a code change.

Measured, live data, from the Mac: `GET /api/v1/auth/me`, which does only
`authenticate`'s two reads plus building the answer, took 266 to 453 ms over
15 requests, median 307 ms. This is the Mac's own distance from Mumbai, not
Render's; it is the figure P31's concurrent reads are compared against, measured
the same way.

### 4. What a device asks for (section 6d)

Measured, local, two minutes per screen, counting every request to `/api/`
after the screen had settled:

| Screen | Device | Request | In 2 minutes | Per minute | Expected |
|---|---|---|---|---|---|
| Kitchen display | tablet, as the manager | `GET /kots` | 12 | 6 | 6 |
| Floor view | computer, as the owner | `GET /tables` | 8 | 4 | 4 |
| Dashboard | computer, as the owner | `GET /tables` | 8 | 4 | 4 |
| Dashboard | computer, as the owner | `GET /reports/dashboard` | 2 | 1 | 1 |
| Bills | computer, as the manager | nothing | 0 | 0 | |

Every screen polls exactly as often as its code says. Two notes:

1. The dashboard's 60-second read is `GET /reports/dashboard`, not
   `/reports/v2/dashboard` as the P30 table names it.
2. The online alerts, the captain bill printer, the attendance board and the
   integration alerts did not poll in this run because they were off: the
   golden restaurant has online orders off, This device had "Print bills sent
   by captains" off, and attendance is off. They add to these counts only on a
   device or restaurant that turns them on.

Not measured on a real device at Z Chaat: that needs a staff login on the live
system, which this session did not have.

### 5. The build (section 6e)

Built at `bfc909d`:

| Asset | Raw | Gzip |
|---|---|---|
| `index-*.js` | 1,491.35 kB | 325.47 kB |
| `PublicSite-*.js` | 87.49 kB | 14.64 kB |
| `index-*.css` | 59.89 kB | 11.41 kB |

**This is React's development build, and so is the live site.** P30 expected
225.24 kB for the main chunk. The difference: `client/vite.config.js` calls
Vite's `loadEnv` on the repository's root `.env`, which says
`NODE_ENV=development` on every developer machine, and `loadEnv` copies that
into `process.env.VITE_USER_NODE_ENV`, which Vite then uses to make the whole
build a development build. Built again with `NODE_ENV=production` forced, the
same commit gives `index-*.js` 782.41 kB, gzip 225.50 kB.

Measured, live: the main script on `zchaat-pos.vercel.app` is 1,453,593 bytes
and contains React's development-only code (`validateDOMNesting`). Z Chaat's
screens have been running React in development mode since the first Vercel
deploy: about twice the JavaScript, plus React's extra checks on every render.
The copy Render serves at its own address, built inside Docker where there is no
`.env`, is the production build (229,046 bytes Brotli).

P32 fixes the build. The fonts, measured from the build:

| Font file | Size |
|---|---|
| `anek-gujarati-gujarati-*.woff2` | 450.19 kB |
| `anek-devanagari-devanagari-*.woff2` | 726.16 kB |

### 6. The Vercel hop (section 9)

`client/vercel.json` sends every `/api` request through Vercel's edge to Render,
which then reaches Atlas: browser, Vercel, Render (Cloudflare, then the
container in Singapore), Atlas in Mumbai. Pointing the browser straight at
Render would save the Vercel hop, but the rewrite is what makes the app and
the API one address, and the httpOnly refresh cookie on `Path=/api/v1/auth` and
the `X-Requested-With` check in `middleware/requireCsrfHeader.js` both depend
on that. A known, accepted cost.

### 7. Conditional requests, found while measuring

Measured, live data: `GET /api/v1/tables` twice, the second sending the first's
`ETag` as `If-None-Match`: 200 with 8,974 bytes, then **304 with 0 bytes**.
Express's weak ETags already work at the app. Through Vercel, API answers carry
`cache-control: public, max-age=0, must-revalidate` (measured, live, on
`/api/v1/health`), which lets a browser keep the answer and revalidate it, and
the client's `fetch` does not turn the HTTP cache off. P31 section 9 records
the decision.
