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

---

## P31, 2026-10-10

### 1. Compression

The server now compresses its own answers (`compression`, mounted straight
after `helmet()`). Measured, live data, through this code on Rishi's Mac:

| Request | P30, bytes sent | P31, `gzip` | P31, `br` | Brotli at its best, for comparison |
|---|---|---|---|---|
| `GET /api/v1/menu` | 46,022 | 5,457 | 5,159 | 4,292 |
| `GET /api/v1/tables` | 8,974 | 1,068 | 931 | 789 |
| `GET /api/v1/bills?limit=50` | 6,481 | 1,758 | 1,680 | 1,428 |
| `GET /api/v1/categories` | 4,010 | 572 | 505 | 455 |
| `GET /api/v1/auth/me` | 2,495 | 1,139 | 1,150 | 941 |

(`/tables` and `/bills` changed size between the two runs because Z Chaat was
seating tables and billing while they ran.)

What a Z Chaat tablet receives changes little: Render's Cloudflare edge was
already Brotli-compressing every answer (P30 section 2), and the last column
is roughly what it sends. The change matters on any host without such an
edge. The deployed figure is in section 4 below.

### 2. `authenticate`'s two reads

Measured, live data, from Rishi's Mac, 25 rounds of exactly the two queries
`authenticate` makes, against Z Chaat's owner and restaurant:

| | Median |
|---|---|
| One after the other (before P31) | 193 ms |
| Together, `Promise.all` (P31) | 77 ms |

The whole `GET /auth/me` timed from the Mac (P30: median 307 ms) was 352 ms
after P31, inside the noise of a home connection; the reads on their own are
the fair comparison. From Render in Singapore to Mumbai the saving is one
database round trip on every authenticated request.

### 3. Do 304s already work

Measured, live data: `GET /api/v1/tables`, then again with the first answer's
`ETag` as `If-None-Match`: **200 with 8,839 bytes, then 304 with no body.**

Yes, at the app. Express's weak ETags answer a repeated poll with 304. Through
Vercel, answers carry `cache-control: public, max-age=0, must-revalidate`
(measured on `/api/v1/health`), which tells a browser it may keep the answer
and must check it every time, and the client's `fetch` leaves the HTTP cache
on, so the browser should send `If-None-Match` by itself. That last step was
not watched in a device's network tab; it is the one thing to look at there.
No change made.

A 304 saves bandwidth, not database work: the server still runs every query
to build the answer it compares against. Cutting the queries is P33's job.

### 4. Deployed

Measured, live, 2026-10-10, after `main` was pushed and Render rebuilt (the
health check's uptime started after the push):

- Render's edge passes our own compression through rather than redoing it. A
  request for the main script asking `br` got `br` (221,534 bytes), asking
  `gzip` got `gzip` (224,286), and a browser's usual `gzip, deflate, br` got
  `br`. So compressing at the app downgrades nobody from Brotli to gzip.
- Not checked live: a signed-in JSON read such as `GET /menu`, and a logo or
  dish photo, both of which need a staff session this session did not have.
  The tests cover both (`compression.test.js`); on a device, the network tab
  should show `content-encoding: br` on `/api/v1/menu` and none on a photo.

---

## P32, 2026-10-10

### 1. The build

Built on Rishi's Mac:

| Asset | P30 as built here (development React) | P30, production | P32 | 
|---|---|---|---|
| Main chunk `index-*.js` | 1,491.35 kB, gzip 325.47 kB | 782.41 kB, gzip 225.50 kB | **416.98 kB, gzip 126.44 kB** |
| `PublicSite-*.js` | 87.49 kB, gzip 14.64 kB | 41.25 kB, gzip 11.72 kB | 41.31 kB, gzip 11.76 kB |
| `index-*.css` | 59.89 kB, gzip 11.41 kB | 59.89 kB, gzip 11.41 kB | 58.31 kB, gzip 11.35 kB |

What changed:

1. **The build is production again.** `client/vite.config.js` no longer lets
   the root `.env`'s `NODE_ENV=development` turn the build into a development
   build, and a production build now fails if React's development code is in
   it (tried on purpose: it fails, naming the chunk).
2. **The back office is lazy.** Ten groups load on first use, from
   `client/src/routes/`. The largest: settings 24.40 kB gzip, settlement
   15.64 kB, reports 14.27 kB, integrations 9.65 kB. The service screens
   (sign-in, home, floor, order, takeaway, kitchen, bill) stay in the main chunk.
3. **The QR code library loads when a bill with a review link prints**
   (10.13 kB gzip), not with the app.

The main chunk is 44% smaller than P30's production build, not "well under
half" as P32 hoped. What is left is mostly what every screen needs: React DOM
alone is 131 kB of it before compression, React Query 42 kB, the router 23 kB,
and the service screens themselves. Vite no longer warns about chunk size.

Against what Z Chaat was actually downloading, the live development build of
1,453,593 bytes, the main chunk is 417 kB: less than a third.

### 2. The fonts

| Font | Before | P32 subset |
|---|---|---|
| Anek Gujarati, Gujarati | 450.19 kB | **38.24 kB** (63 words) |
| Anek Devanagari, Devanagari | 726.16 kB | **47.33 kB** (74 words) |

The subsets are made from every Gujarati and Devanagari word in `client/src`:
the labels in `gu.js` and `hi.js`, and the attendance clock's two Hindi
lines. A subset of their characters alone was 326 kB and 547 kB, because the
virama pulls in every conjunct the characters could form; so each word is
shaped with HarfBuzz and the subset keeps exactly the glyphs shaping used.
Every word is then shaped again with the subset and compared with the full
font at nine weight and width settings; any difference fails the build
(tried on purpose: it fails, naming the words).

Measured, local, in Chromium, after signing in:

| What was on screen | Font files fetched |
|---|---|
| The floor, the takeaway start and an empty order, Gujarati on | Anek Latin only. None of these screens shows a Gujarati word. |
| The app's Gujarati words drawn | `anek-gujarati-subset` only |
| The clock screen's Hindi line drawn | `anek-devanagari-subset` only |

**Devanagari was not being fetched for a Gujarati restaurant** before P32
either: nothing outside the attendance clock writes Devanagari, and
attendance is off at Z Chaat.

### 3. The first lazy screen

Measured, local, at 380 and 1280 wide, the network slowed to 1.5 s latency and
50 kB/s: going from the floor to Reports fetched the reports chunk only then,
and while it arrived the frame stayed and the screen showed its still shape
("Opening the screen"). No sideways scroll on the floor or on Reports at
either width.
