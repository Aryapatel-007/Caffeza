# P33 The live channel

**Model:** Opus, high effort. This adds a second delivery path to screens a restaurant runs its service on, and it partly reverses a decision made on purpose in M2. Do not run it on Sonnet.
**Branch:** none. Commit directly to `main`.
**Depends on:** P30 and P31. Do not start before P30: on Render's free plan the instance sleeps and a socket spends most of its life reconnecting, which would make this look broken when it is not.

---

## 1. What to build, in one sentence

Add a WebSocket that tells a screen *something changed, read again*, let each screen's poll back off to 60 seconds while that socket is proving itself, and send the poll straight back to its current interval the moment the socket stops being trustworthy.

## 2. Module

A new concern, cutting across M2, M18 and M14. It adds no collection, no field and no business rule. Give it its own section in `docs/API-CONTRACT.md` before writing any code, as every module here does.

## 3. Why, and the decision this partly reverses

Measured per device per minute at commit `0be8cb6`: a kitchen tablet makes 6 requests, a floor screen 4, a dashboard 5, and `AppShell.jsx` adds 4 for online alerts and 12 for the captain bill printer on a counter computer with that setting on. A counter computer sitting on the dashboard with online orders enabled makes about 22 requests a minute while nobody touches it. That is why the general rate limit had to go from 600 to 5,000 per fifteen minutes on 8 October. The limit was raised; the traffic that caused it was not reduced, and it grows with every device Z Chaat adds.

**The decision log, 2026-08-29, says the kitchen display polls every ten seconds rather than using WebSockets, because *a dropped socket that silently stops delivering tickets is a far worse failure than a ten second delay, because nobody notices it.*** That reasoning is correct and this prompt does not overturn it. A kitchen tablet on restaurant wifi that quietly stops receiving tickets at 8pm is the worst failure this system can have.

So the socket is added **as a fast path over the polling**, never instead of it. What changes is the poll's interval while the socket is healthy, and that is all. Record this explicitly in the decision log as a partial reversal with the original reason preserved.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P33-live-channel.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count. Confirm P30 and P31 are merged; if the server is still on Render's free plan, stop and say so.

## 5. Files to read first

1. `docs/PROJECT-STATE.md`, the 2026-08-29 decision about the kitchen display, in full.
2. `server/server.js`, `createApp` and the listen path, and how `scripts/e2eServer.js` reuses it.
3. `server/middleware/authenticate.js`, all of it. The socket handshake has to make the same checks.
4. `server/middleware/rateLimit.js`, both limiters.
5. `server/utils/scopedQuery.js` and `server/models/plugins/tenantGuard.js`. The tenant rule applies to a room exactly as it applies to a query.
6. `client/src/main.jsx`, the `QueryClient` defaults.
7. Every screen with a `refetchInterval`: `KitchenDisplayPage.jsx`, `FloorViewPage.jsx`, `DashboardPage.jsx`, `OnlineAlerts.jsx`, `OnlineInboxPage.jsx`, `BookingsPage.jsx`, `PlatformOrdersSection.jsx`, `CaptainBillPrinter.jsx`, `BillScreenPage.jsx`, `TerminalWaiting.jsx`, `ClockScreen.jsx`.
8. `server/services/integrations/jobRunner.js`, for how this project already runs a background loop inside the server process.

---

## 6. The rule that makes this safe

**The socket carries no data. It carries the name of what changed.**

A message is a topic and a restaurant, nothing more: `{ topic: 'kots', restaurantId, branchId }`. The client's only reaction is to invalidate the matching React Query key, which triggers the ordinary authenticated HTTP read that exists today.

This is the whole design and it is not negotiable inside this prompt. A socket that pushes payloads has to be correct about ordering, retries, reconnection gaps and partial delivery, and getting any of those wrong shows a cashier a wrong number. A socket that only says *refetch* can drop any number of messages, and the worst outcome is that the screen updates on its next poll — which is exactly what happens today.

It also means the socket can never leak data. A topic name is not tenant data; the HTTP read behind it is still scoped, still permission-checked, still goes through `authenticate`.

## 7. Topics

Start with the five that cover the measured traffic. Do not add more in this prompt.

| Topic | Published when | Screens that listen |
|---|---|---|
| `kots` | A line is fired, marked ready, undone, or a ticket is cancelled | Kitchen display |
| `tables` | An order opens, closes, changes status, or a bill is printed or paid | Floor view, dashboard |
| `online` | An online order or booking arrives, is accepted, declined or expires | Online alerts, inbox, bookings |
| `platform-orders` | A platform order arrives or changes state | Platform orders section |
| `print-queue` | A captain requests a bill print | Captain bill printer |

Publish from the service that already writes the change, after its transaction commits, never inside it. A publish that happens inside a transaction that then rolls back tells every screen to read a change that did not happen; they would read the old value and recover, but it is noise and it is avoidable. A publish must never be able to fail the write it follows: wrap it so a socket error is logged and swallowed.

## 8. The back-off, on the client

One hook, used by every polling screen, so the rule exists once.

1. Each screen keeps its current `refetchInterval` value, but reads it from the hook instead of a constant. Today's numbers stay as the fallback: 10 seconds for the kitchen, 15 for the floor, and so on.
2. The hook returns the slow interval — 60 seconds — only while **all** of these are true: the socket is connected, it has delivered a heartbeat within the last 30 seconds, and the tab is visible or the query is one that already polls in the background.
3. The moment any of those stops being true — a disconnect, an error, a missed heartbeat, a reconnect in progress — the hook returns the screen's normal fast interval, immediately, without waiting for the current timer.
4. On receiving a message, the hook invalidates that topic's query key. It does not set data.

The heartbeat is the load-bearing part. A socket that believes it is connected while delivering nothing is the exact failure the 2026-08-29 decision feared, and only a heartbeat catches it. Send one from the server every 20 seconds; treat 30 seconds of silence as dead.

Nothing about this should be visible to staff. No "reconnecting" banner, no connection indicator. The screen either updates fast or updates in ten seconds, and both are fine. A banner would invite someone to worry about something they cannot fix mid-service.

## 9. The handshake

The socket is authenticated, scoped and short-lived, with the same rules as a request.

1. The access token is presented on connect and verified exactly as `authenticate` verifies it, including the `passwordChangedAt` check with `<=` on whole seconds, fail closed.
2. The user and restaurant are loaded and checked for `isActive`, as in the middleware. A deactivated user's socket is refused.
3. Rooms are `restaurantId` and `branchId` taken from the **verified token**, never from anything the client sends. A client naming its own room is the tenant leak this whole codebase is built to prevent.
4. The connection is dropped when the access token expires, so a demoted or deactivated user cannot keep a live channel for the rest of their fifteen minutes. The client reconnects after its next refresh. This is the socket's version of the 2026-08-29 decision that `authenticate` takes the role from the database.
5. Connections are counted per user and capped at a small number, so a reload loop cannot open hundreds.

Tests, and these are the ones that matter most:

- A socket connecting with restaurant A's token never receives a message published for restaurant B. Write it so that it fails if the room is built from a client-sent value.
- A socket with an expired token is refused.
- A socket whose user is deactivated mid-connection is dropped on its next heartbeat.
- A publish for a topic nobody is listening to does nothing and throws nothing.

## 10. What must still be true with the socket switched off

Add a setting or an environment flag that disables the socket entirely, defaulting to on, and run the whole suite with it off. Every screen must behave exactly as it does today, at today's intervals. This is not a nicety: it is the rollback, and Z Chaat is live. If something goes wrong at 8pm on a Saturday, the fix must be a flag and a restart, not a deploy.

## 11. Practical notes

- One Render instance means an in-process `socket.io` works with no Redis adapter. Write a comment saying so, and saying that a second instance needs one. Do not add an adapter now for a second instance that does not exist.
- `scripts/e2eServer.js` runs the integration job loop as production does. It must run the socket too, or the e2e specs will test a path real users do not have.
- Sockets and the per-user rate limiter: a socket is not an API call and must not be counted by `userLimiter`. Check that it is not, and write a test.
- Vercel's rewrite forwards `/api`. Confirm the WebSocket upgrade survives it before building anything on top; if it does not, the socket needs its own path and that changes section 9's origin handling. **Find this out in the first hour, not the last.**

---

## 12. Rules this must not break

From `CLAUDE.md`: "Every database record has a `restaurantId`. Every query filters by it." A room is scoped the same way, from the token.
From `CLAUDE.md`: "Check permissions on the server for every endpoint." The socket adds no read. Every piece of data still arrives through an endpoint that checks.
From the decision log, 2026-08-29: the kitchen must never silently stop receiving tickets. Section 8's heartbeat and fallback are what honour that. If you find yourself removing the poll, stop.
From `docs/CONVENTIONS.md` section 10: components do not call `fetch`. They do not open sockets either — the connection lives in one place, beside `/src/api`.
From `CLAUDE.md`: "Do not add anything that assumes a machine inside the restaurant." A socket is still cloud to browser.

## 13. Checks and golden day

Every figure in `docs/TEST-DATA.md` must be unchanged. This prompt moves no money and derives nothing.

`npm run e2e` must pass all thirteen specs twice: once with the socket on, once with it off per section 10. Both runs go in the summary. The kitchen and floor specs are the ones that will find a real bug here.

Add one e2e spec of its own: two browser contexts on the kitchen board, one marks a ticket ready, the other shows it within two seconds without a reload. Then kill the socket on the second context and prove it still catches up within its fast interval. That second half is the test that proves the safety net works, and it is the one worth writing first.

---

## 14. Docs to update

1. `docs/API-CONTRACT.md`: a new section for the live channel — the handshake, the topics, the message shape, the heartbeat, and the statement that it carries no data.
2. `docs/PERFORMANCE-BASELINE.md`: requests per device per minute, before and after, for a kitchen tablet and a counter computer, both idle for two minutes.
3. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P34, re-measure."
   3. Known problems: the row about two tablets on the availability board not seeing each other live, OPEN since 29 August, and the row about the kitchen display's ten-second delay. Update both to say what the socket now does and that the poll remains as the safety net.
   4. Decision log, dated today:
      "A WebSocket delivers *something changed* and the polls back off to 60 seconds while it is healthy. It carries no data and never replaces a poll. | This partly reverses the 2026-08-29 decision against WebSockets on the kitchen display. That decision's reason still stands and is what shaped this one: a socket that silently stops delivering is worse than a ten-second delay, so a missed heartbeat sends the poll straight back to ten seconds and a dropped message costs at most one interval."
      "The socket's rooms come from the verified token, and the connection is dropped when the access token expires. | Same reasoning as `authenticate` reading the role from the database: a demoted user must not keep a live channel for fifteen minutes."
   5. "What changed recently": a P33 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
4. `docs/DEPLOYMENT.md`: the new dependency, the flag from section 10, and the note that a second instance needs an adapter.
5. `docs/prompts/README.md`: add the P33 row and mark it Done.
6. `docs/CAFFEZA-BUILD-PLAN.md` section 3: add the P33 row.

---

## 15. Out of scope

Sending any data over the socket. Section 6.
Removing any poll. Section 8.
A connection indicator on screen. Section 8.
A Redis adapter. Section 11.
New topics beyond the five in section 7.
Anything about printing, or a socket to a device inside the restaurant. The server never talks to a printer.

## 16. Done when

1. The contract section is committed before the first line of code, as every module here does.
2. `npm test` passes, counts recorded, including every test in section 9.
3. `npm run lint` and `npm run build` pass.
4. `npm run e2e` passes all thirteen specs plus the new one, twice: socket on, socket off.
5. Measured on the live system: a kitchen tablet idle for two minutes makes about 1 request a minute instead of 6, and a counter computer about 4 instead of 22. Both figures in `docs/PERFORMANCE-BASELINE.md` beside P30's.
6. Measured by hand: a ticket marked ready on one tablet appears on a second within two seconds.
7. Measured by hand: with wifi switched off and back on, the second tablet recovers on its own and nobody had to reload.
8. Every doc in section 14 is updated.
9. Commits on `main`, one line each, for example:
   `add the live channel spec`
   `add the socket and its handshake`
   `publish topics from the services that write them`
   `back the polls off while the socket is healthy`
   `update docs for p33`
10. Push `main`.
11. Print a short summary: request counts before and after, both e2e runs, what happened when you pulled the wifi, and anything that surprised you.
