# P30 Keep the free server awake

**Model:** Sonnet, high effort.
**Branch:** none. Commit directly to `main`.
**Repository:** https://github.com/Aryapatel-007/Caffeza
**Depends on:** the Render and Vercel deploy in `render.yaml`, `client/vercel.json` and `docs/DEPLOYMENT.md` section 14.

---

## 1. What to build, in one sentence

Stop Z Chaat's staff from waiting for Render's free server to wake up, at no cost: a light wake address that outside pingers call, a heartbeat from every open screen, a backup pinger in GitHub Actions, a friendly "starting" screen with safe retries when it is asleep anyway, and a record of every time the server started, so we can see whether it worked.

## 2. Why

Render's free plan stops the server after 15 minutes without a request, and waking it takes about a minute. The first person to open the app after a quiet spell waits, or sees an error.
Render gives 750 free hours a month per account. If they run out, every free service on the account stops until next month. So we keep it awake only during working hours, plus a margin.
The owner does not want a paid plan.

---

## 3. You are a new session. Do this first

1. **Pull first.** If the repository is not on this machine, `git clone https://github.com/Aryapatel-007/Caffeza.git` and work inside it. If it is, `git checkout main` and `git pull`.
2. `npm ci` at the root.
3. If there is no `.env`, copy `.env.example` to `.env` and **stop and ask me for the values**. Never guess them.
4. If there is no `server/.env.test`, copy `server/.env.test.example` to it.
5. Read `CLAUDE.md`, and `docs/DEPLOYMENT.md` sections 13 and 14.
6. Save this entire prompt, exactly as given, to `docs/prompts/P30-keep-the-free-server-awake.md`.
7. Run `npm test` once and record the count.

## 4. Files to read first

1. `render.yaml`, `client/vercel.json`, `Dockerfile`.
2. `server/server.js`, `server/routes/healthRoutes.js`, `server/controllers/healthController.js`, `server/middleware/rateLimit.js`, `server/config/logger.js`, `server/models/index.js`.
3. `server/services/openingHoursService.js` and the online settings it reads, from P23.
4. `server/scripts/smokeCheck.js`.
5. `client/src/api/client.js` (or wherever the shared fetch wrapper lives), `client/src/context/AuthContext.jsx`, `client/src/App.jsx`, `client/src/main.jsx`.
6. `docs/DESIGN-SYSTEM.md`, for the two small screens.

---

## 5. Part A. The server

### A1. A wake address

`GET /api/v1/wake`, no sign-in, answering `{ success: true, data: { ok: true, startedAt, uptimeSeconds } }`.

1. It touches no database, so it is as cheap as a request can be.
2. It has its own rate limiter: 60 requests a minute per address. It never counts towards the sign-in or general limiters.
3. It is logged at `debug`, never `info`, so pings every few minutes do not fill the logs.
4. `Cache-Control: no-store`, so nothing between the pinger and the server answers it from a cache. A cached answer would not keep the server awake.

`GET /api/v1/health` stays as it is, and gains `startedAt` and `uptimeSeconds`. Additive.

### A2. A record of every start

New collection `serverstarts`, not tied to a restaurant because it is about the server itself:
`{ startedAt, release, nodeEnv, reason }`, written once when the server starts listening, with a TTL index removing documents after 60 days.
Register the model. Add it to whatever list the tenant guard and the "every collection has `restaurantId`" checks keep for collections that legitimately have none, and say in the model's comment why it has none.

`GET /api/v1/system/starts?days=7`, OWNER only: each start, newest first, and per day how many starts there were and the longest gap between two starts.
A day with many starts during working hours means the pingers are not working.

### A3. Tests

1. `/wake` answers without a database connection.
2. `/wake` is not rate limited by the sign-in limiter, and its own limit refuses the 61st request in a minute.
3. `/wake` responses carry `Cache-Control: no-store`.
4. Starting the app writes one `serverstarts` document.
5. `/system/starts` refuses every role but OWNER, and works out the per-day counts correctly from made-up starts.

Commit: `add a wake address and a record of server starts`.

---

## 6. Part B. The screens

### B1. A heartbeat from every open screen

While a person is signed in, the app calls `/api/v1/wake` every **5 minutes**:
1. Only while the browser tab is visible. Use the Page Visibility API. A tab in the background on a phone does not keep the server awake for nothing.
2. Only within the restaurant's working hours plus 30 minutes either side, read from the opening hours P23 built. If the restaurant has no hours set, always.
3. One timer for the whole app, started in one place, stopped on sign-out.
4. A failed ping is ignored silently. It is a hint, not a feature.

### B2. When the server is asleep anyway

When Render is waking, a request through Vercel's forwarding can fail with a 502, 503 or 504, can return Render's HTML waiting page instead of JSON, or can time out.

1. In the shared fetch wrapper, recognise these: a 502, 503 or 504, a response that should be JSON but is HTML, or a network timeout.
2. **Read requests, GET only, are retried automatically**: after 3, 6, 12, 20 and 30 seconds, about 70 seconds in all, which covers a cold start.
3. **Write requests, POST, PUT, PATCH and DELETE, are never retried automatically.** A write that timed out may have reached the server: retrying could make a second bill or record a payment twice. Show instead: "The server was starting and we could not confirm this went through. Check the bill before trying again." with a button that reloads the screen's data.
4. While any retry is waiting, show a calm full-width bar at the top, "Starting the server. This takes about a minute the first time in the morning.", with a progress line, in the design system's `open` state. It disappears on its own once a request succeeds.
5. On first load of the app, before the sign-in screen, call `/api/v1/wake` once. If it does not answer within 2 seconds, show the same message on the sign-in screen and keep trying, so the person knows to wait.

### B3. Owner's view

In Settings, a small **Server** card for the OWNER, from `/system/starts`: "Started 1 time today, at 8:31 AM. Last 7 days: 1, 1, 2, 1, 1, 1, 1." If any day had more than 2 starts inside working hours, it says, in plain words, "The server went to sleep during working hours on Thu 9 Oct. Check the pingers in docs/DEPLOYMENT.md section 14."

### B4. Tests

The client has no test runner. Keep the retry logic in one small pure function, `shouldRetry({ method, status, contentType, isTimeout, attempt })`, returning the delay or null, and test it from the server suite the way P01 tested the client's business date mirror:
1. A GET with 502, 503, 504, HTML, or a timeout is retried at 3, 6, 12, 20 and 30 seconds, then gives up.
2. A POST, PUT, PATCH or DELETE is never retried, whatever the error.
3. A 400, 401, 403, 404, 409 or 422 is never retried.

Commit: `keep the server awake from open screens, and wait for it calmly`.

---

## 7. Part C. A backup pinger in GitHub Actions

`.github/workflows/keep-awake.yml`:

1. On a schedule, every 10 minutes during working hours. GitHub's schedule is in UTC: India time is UTC plus 5:30. Default window 8:30 AM to 2:30 AM India time, which is `*/10 3-20 * * *` in UTC, 3:00 to 20:59 UTC. Put the window in a comment, in India time and UTC, so it can be changed safely.
2. Also `workflow_dispatch`, to run by hand.
3. One step: `curl` the address in the repository variable `KEEP_AWAKE_URL`, with up to 3 tries and a 90-second timeout each, so a cold start does not count as a failure. Fail the run only when all tries fail.
4. No secrets are needed. The address is public anyway.
5. A comment in the file says: GitHub may delay or skip scheduled runs when it is busy, so this is a backup, not the main pinger; and GitHub turns off scheduled workflows in a public repository after 60 days with no commits, so check it in the Actions tab if the repository goes quiet.

Commit: `add a backup keep-awake workflow`.

---

## 8. Part D. The runbook

Add to `docs/DEPLOYMENT.md` section 14 a subsection, **"Keeping the free server awake"**:

1. Why: the 15-minute sleep, the one-minute wake, and the 750 free hours a month for the whole Render account.
2. The hours budget, as a table: always on is at most 744 hours in a 31-day month and leaves no room for any other free service; the default window of 8:30 AM to 2:30 AM is about 18 hours a day, about 560 a month. Change the window to Z Chaat's real hours once confirmed, and keep the total under 700.
3. **cron-job.org, the main pinger**, step by step: sign up; create a job; address `https://zchaat-pos-api.onrender.com/api/v1/wake`; every 10 minutes; hours 8 AM to 2 AM; time zone Asia/Kolkata; turn on "notify me when it fails".
4. **StatusCake, the second pinger and the alarm**, step by step: sign up for the free plan; add an uptime test for `https://zchaat-pos-api.onrender.com/api/v1/health` every 5 minutes; add an email alert contact. Explain that it pings around the clock, so it uses all 744 hours on its own; either pause it outside working hours, or accept the hours if this is the only free service on the account. Say why not UptimeRobot: its free plan is now for personal, non-commercial use only, and Z Chaat is a business.
5. **GitHub Actions, the backup**: set the repository variable `KEEP_AWAKE_URL` in Settings, Secrets and variables, Actions, Variables. Check the Actions tab once a week.
6. **The heartbeat**: every open screen pings every 5 minutes in working hours, so the counter computer left open keeps the server awake on its own.
7. **How to tell it works**: the Server card in Settings, and Render's logs.
8. **What this does not fix**: Render says the free plan is not for production; the server is small; anything due while it sleeps waits until it wakes, including platform webhooks and the background job runner. The day Z Chaat pays, move to Render's cheapest paid plan, and switch the pingers off.

Also update `docs/GO-LIVE-READINESS.md`, if it lists the uptime monitor, with the state of each pinger.

Commit: `write the keep-awake runbook`.

---

## 9. Part E. Check

1. `npm test`, the whole suite, with counts before and after.
2. `npm run lint` and `npm run build`.
3. Locally with `NODE_ENV=production` and a built client: `/api/v1/wake` answers, and stopping the database still lets it answer.
4. `npm run smoke` gains one line checking `/api/v1/wake`.
5. By hand in the browser: stop the local server, reload a report screen, see the "Starting the server" bar, start the server, and see the screen load by itself. Try to take a payment while it is stopped, and see the "could not confirm" message, with nothing retried.

---

## 10. Non-negotiable rules that apply

"Check permissions on the server for every endpoint." `/wake` is public on purpose and returns nothing private. `/system/starts` is OWNER only.
"Store timestamps in UTC. Convert to India time only for display."
"Never create a bill in production to test something." Never retry a write automatically.
"Schema changes are additive."

## 11. Out of scope

Paying for any plan.
Moving off Render.
A server that pings itself.
Making background jobs run while the server sleeps.

## 12. Docs and done

1. `docs/PROJECT-STATE.md`: the date line; a P30 entry at the top of "What changed recently"; decision log rows, dated today, for: the free server kept awake by outside pingers in working hours, a heartbeat from open screens, and a GitHub Actions backup; reads retried during a cold start and writes never retried; and the 750-hour budget.
2. `docs/prompts/README.md`: add P30, marked Done.
3. Push `main`.
4. Print a short summary: commits; test counts before and after; and the exact steps left for Arya to do by hand on cron-job.org, StatusCake and GitHub, with the addresses filled in.
