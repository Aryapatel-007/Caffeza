# P31 Compression and request latency

**Model:** Sonnet, medium effort. Switch to Opus, high, if the compression change turns out to interact with the webhook or logo routes in a way the tests do not cover.
**Branch:** none. Commit directly to `main`.
**Depends on:** P30. Its baseline is what this prompt is measured against.

---

## 1. What to build, in one sentence

Compress API responses, stop `authenticate` making its two database reads one after the other, and confirm whether an unchanged poll already answers 304.

## 2. Module

None. Phase 2 work. It touches `server/server.js` and `server/middleware/authenticate.js` and nothing else.

## 3. Why

Three findings from reading the code at `0be8cb6`.

There is no `compression` package anywhere in `server/`, and `createApp` installs no compression middleware. Vercel's rewrite proxies `/api` to Render and passes the response through rather than recompressing it, so JSON very likely reaches the restaurant's tablets uncompressed. JSON compresses to roughly a fifth of its size. The reads that gain most are the ones a cafe makes constantly: `GET /menu` across 97 dishes and 14 categories, the bills ledger, every report, and the floor read on a 34-table plan. On a 4G line this is the largest bandwidth change available in the whole codebase.

`middleware/authenticate.js` runs `User.findOne` and then `Restaurant.findById`, one after the other. Neither depends on the other. With the server in Singapore and a restaurant in Gandhinagar, that is two serial round trips on the front of every authenticated request, and the device makes between 4 and 22 of them a minute.

Most polls return exactly what the previous poll returned: a kitchen with no new tickets, a floor with nobody seated. Express generates weak ETags for JSON by default and browsers send `If-None-Match` automatically, so some of this may work already. Nobody has checked.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P31-compression-and-request-latency.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count. If anything fails before you start, stop and tell me.
4. Read `docs/PERFORMANCE-BASELINE.md` from P30. If it does not exist, stop: this prompt has nothing to be measured against.

## 5. Files to read first

1. `server/server.js`, all of `createApp`, and the comments above the webhook and Tally bridge mounts. Understand why those two sit before the JSON parser before you add anything.
2. `server/middleware/authenticate.js`, the whole file, including the comment above the user read that says not to add a cache.
3. `server/services/settingsService.js`, `getSettings`, and how it reads `req.currentRestaurant`.
4. `server/controllers/brandController.js` and `server/services/menuPhotoService.js`, for the two routes that return image bytes.
5. `server/tests/app.test.js`, for how a test drives `createApp` without a database.

---

## 6. Compress API responses

Add `compression` to `server/package.json` dependencies.

In `createApp`, mount it immediately after `app.use(helmet())` and before the CORS line, so it covers every route including the webhook and bridge mounts.

Compression is response-side only. It cannot disturb the raw request bodies that the Razorpay, platform and Pine Labs webhooks keep for signature checking, and it cannot disturb the larger bodies the logo and photo uploads parse for themselves. Say so in a comment above the line, because the next reader will wonder, exactly as I did.

Leave the defaults alone except for one thing: confirm that an already-compressed response is not compressed again. `GET /restaurant/logo/:slot` returns PNG, WebP or JPEG bytes, and `GET /menu-items/:itemId/photo` does the same. The `compression` package skips these by content type on its own; add a test that proves it rather than trusting it, because a re-compressed image is slower and bigger and nothing would fail.

Tests to add:

1. A JSON read over 1 kB, requested with `Accept-Encoding: gzip`, comes back with `content-encoding: gzip`.
2. The same read with no `Accept-Encoding` comes back uncompressed and identical.
3. An image response does not carry `content-encoding`.
4. A webhook with a signature over its raw body still verifies. Extend the existing webhook test rather than writing a new one.

## 7. Make `authenticate`'s two reads concurrent

The user read and the restaurant read are independent. Run them in one `Promise.all` instead of one after the other.

Everything after them stays exactly as it is, in the same order:

1. The user missing or inactive is still `UnauthenticatedError`, before anything else is checked.
2. The `passwordChangedAt` comparison still uses `<=` on whole seconds, and still fails closed. Do not touch it.
3. The restaurant missing or inactive is still `UnauthenticatedError`.
4. The role still comes from the database document, never the token claim.
5. `req.currentUser` and `req.currentRestaurant` are still handed on.
6. `userLimiter` still runs last.

This is a latency change with no behavioural change. Write one test that proves the order of the checks is unchanged: a request whose user is inactive **and** whose restaurant is inactive still fails on the user, with the same message as before. That is the test that would catch a careless rewrite.

Do not add a cache. The comment in the file is right, and the role being read live is what stops a demoted user keeping their permissions for the rest of a fifteen-minute token.

## 8. Do not trim the restaurant document

Noted here because it looks like the obvious next optimisation and it is a trap.

`Restaurant.findById` loads the whole `settings` subdocument when `authenticate` only needs `isActive`. Leave it. The heavy fields — logo bytes, the sealed Razorpay and partner secrets — are already `select: false`. And `settingsService.getSettings` deliberately reads `req.currentRestaurant` instead of querying, checking only that the `_id` matches. Trim `settings` off and that check still passes, `presentSettings` receives a document with no settings, and every caller silently gets schema defaults: the wrong tax rate, the wrong business day boundary, the wrong invoice series, with nothing failing anywhere.

If a later prompt ever does want to trim it, `getSettings` has to start checking for the settings themselves, not the id. Add a comment in `authenticate.js` saying so, so the next person finds the reason instead of the opportunity.

## 9. Find out whether 304s already work

Not a change yet. A measurement with a decision at the end.

Against the live system with a real token, request `GET /api/v1/tables` twice with nothing happening in between, sending the first response's `ETag` back as `If-None-Match` on the second. Record whether you get a 304 and how many bytes each answer cost.

If 304s already work, write that in `docs/PERFORMANCE-BASELINE.md` and do nothing else. If they do not, find out why — most likely `Cache-Control` is absent so the browser never stores a validator — and write down what it would take, as a finding for a later prompt. Do not build conditional-request handling inside this prompt; it is a bigger change than it looks and this prompt is already two changes.

Either way, be clear in the write-up that a 304 saves bandwidth and not database work: the queries still run to build the response that gets compared. Cutting the queries is P33's job.

---

## 10. Rules this must not break

From `CLAUDE.md`: "Check permissions on the server for every endpoint." Nothing here changes a permission. The order of the checks in `authenticate` is itself a permission rule; section 7's test is what protects it.
From the decision log, 2026-08-29: "`authenticate` takes the role from the database, not from the token claim." Unchanged.
From the decision log, 2026-08-29: the `passwordChangedAt` comparison is `<=`, fail closed. Unchanged, and do not tidy it.
From `docs/CONVENTIONS.md` section 11: a new dependency is named to the other developer in the same commit. `compression` is the first new server dependency since P24's `qrcode` on the client.
From `CLAUDE.md`: "Schema changes are additive." There are no schema changes here at all.

## 11. Checks and golden day

No arithmetic changes, so every figure in `docs/TEST-DATA.md` must come out identical. Run the golden day tests specifically and say so in the summary.

`npm run e2e` must still pass all thirteen specs. Compression in front of the e2e server is a real change to how responses arrive, and that suite is the thing most likely to notice if something is wrong.

---

## 12. Docs to update

1. `docs/PERFORMANCE-BASELINE.md`: a second column or a second dated block, with the response sizes for `GET /menu` before and after compression, and the 304 finding from section 9.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P32, the client's weight."
   3. Decision log, dated today:
      "API responses are compressed, mounted straight after `helmet()` so it covers the webhook and bridge routes too. | JSON reaches a tablet at about a fifth of its size, and compression is response-side so it cannot disturb a raw body a partner signature was computed over."
      "`authenticate`'s user and restaurant reads run together, not one after the other. | They do not depend on each other, and two serial round trips to Singapore sat on the front of every authenticated request. No cache was added: the role is still read live."
      "The restaurant document stays fully loaded in `authenticate`. | `settingsService` reads it from `req.currentRestaurant` and checks only the `_id`, so trimming `settings` would hand every caller schema defaults with nothing failing."
   3. "What changed recently": a P31 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
3. `docs/DEPLOYMENT.md`: note the new dependency in whichever section lists what the server runs.
4. `docs/prompts/README.md`: add the P31 row and mark it Done.
5. `docs/CAFFEZA-BUILD-PLAN.md` section 3: add the P31 row.

---

## 13. Out of scope

Caching the user or the restaurant. Section 7 says why.
Trimming the restaurant document. Section 8 says why.
Building conditional-request handling. Section 9 measures; a later prompt may build.
Any client change. P32.
WebSockets, and any change to a poll interval. P33.
Touching the floor read's query count. It is already bounded at five or six queries whatever the size of the floor, and it is not the problem.

## 14. Done when

1. `npm test` passes, with before and after counts recorded, including the four new compression tests and the one new `authenticate` ordering test.
2. `npm run lint` and `npm run build` pass.
3. `npm run e2e` passes all thirteen specs.
4. Against the deployed server: `GET /api/v1/menu` returns `content-encoding: gzip`, and the byte count beside P30's figure is in `docs/PERFORMANCE-BASELINE.md`.
5. A logo or dish photo response carries no `content-encoding`.
6. Every doc in section 12 is updated.
7. Commits on `main`, one line each, for example:
   `compress api responses`
   `read user and restaurant together in authenticate`
   `record the 304 finding`
   `update docs for p31`
8. Push `main`.
9. Print a short summary: test counts before and after, the `GET /menu` size before and after, whether 304s already work, and anything that surprised you.
