# P30 Performance baseline and hosting

**Model:** Sonnet, medium effort. No application code changes.
**Branch:** none. Commit directly to `main`.
**Depends on:** P29.

---

## 1. What to build, in one sentence

Measure how slow the live system actually is, write the numbers down where the next four prompts can be checked against them, and remove the two causes that are configuration rather than code: the sleeping free instance and a database that may be in a different region from the server.

## 2. Module

None. This is Phase 2 hosting work from `docs/BUILD-PLAN.md` section 7, not a module.

## 3. Why

Z Chaat is live. `render.yaml` sets `plan: free`, and a free Render instance sleeps after about fifteen minutes with no traffic. The first person to open a till in the morning, and anyone who touches it after a quiet afternoon, waits for a container to boot, connect to Atlas and pass its index check. Nothing in the code causes that and nothing in the code can fix it.

The second cause is placement. Render has five regions — Oregon, Ohio, Virginia, Frankfurt and Singapore — and no India region, so `region: singapore` is already as close to Gandhinagar as Render gets. That makes Singapore the fixed point, and the Atlas cluster should be there too. `middleware/authenticate.js` makes two database round trips before any route handler runs, so a cluster in another region is paid for twice on every single request.

This prompt is also where the baseline is recorded. P31 to P33 each claim to make something faster. Without numbers taken before they start, none of those claims can be checked, and P34 has nothing to compare against.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P30-performance-baseline-and-hosting.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count. If anything fails before you start, stop and tell me.

## 5. Files to read first

1. `render.yaml`, the whole file.
2. `client/vercel.json`.
3. `docs/DEPLOYMENT.md`, sections 2 and 14.
4. `server/middleware/authenticate.js`, the two reads near the end.
5. `server/server.js`, `createApp`, to see the middleware order you will be adding to in P31.
6. `docs/GO-LIVE-READINESS.md`.

---

## 6. Take the baseline

Record every number in a new file, `docs/PERFORMANCE-BASELINE.md`, dated, with the commit hash it was taken at. Every later prompt re-measures the same things in the same way.

### 6a. Cold and warm start

The service must have had no traffic for at least twenty minutes. Do not warm it up first.

```
curl -s -o /dev/null -w "cold ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
  https://zchaat-pos-api.onrender.com/api/v1/health
```

Then immediately, five times in a row, the same command, and record the warm figures. The gap between the cold number and the warm ones is the cold-start cost, and it is the headline of this prompt.

### 6b. Is anything compressed

```
curl -s -D - -o /dev/null -H "Accept-Encoding: gzip, br" \
  https://zchaat-pos-api.onrender.com/api/v1/health
```

Record whether `content-encoding` comes back. Then do the same for an authenticated read with real bulk — `GET /api/v1/menu` with an owner's access token — and record the response size in bytes both ways. If there is no `content-encoding`, say so plainly in the file: P31's first item is then worth more than everything else in P31.

### 6c. Where the database is

In Atlas, read the region of the `cluster0.dkcsfcz` cluster and write it down beside `region: singapore` from `render.yaml`. If they differ, that is a finding, not a note.

### 6d. What a device actually asks for

On the live system, open a kitchen tablet and a floor screen, leave each alone for exactly two minutes with the browser network tab recording, and count the requests. Compare against what the code says it should be:

| Screen | Request | Interval | Expected per minute |
|---|---|---|---|
| Kitchen display | `GET /kots` | 10s, also in background | 6 |
| Floor view | `GET /tables` | 15s | 4 |
| Dashboard | `GET /tables` | 15s | 4 |
| Dashboard | `GET /reports/v2/dashboard` | 60s | 1 |
| Online alerts, from `AppShell.jsx` | inbox | 15s | 4 |
| Captain bill printer, from `AppShell.jsx` | `GET /bills/print-queue` | 5s, background | 12 |
| Attendance clock | board | 30s | 2 |
| Integration alerts | `GET /integrations/alerts` | 60s | 1 |

If a real count is higher than the expected one, find out why before moving on. A screen polling faster than its code says is the kind of thing that only shows up on a device.

### 6e. The build

```
npm run build
```

Record the gzip size of the main chunk, of `PublicSite`, and of the CSS, exactly as Vite prints them. At commit `0be8cb6` these were 225.24 kB, 11.72 kB and 11.41 kB. If yours differ, use yours; the point is that P32 can show a number going down.

---

## 7. Leave the free plan

In `render.yaml`, change `plan: free` to `plan: starter`.

Confirm in the Render dashboard that the instance no longer sleeps, then re-run section 6a after twenty minutes of quiet. The cold figure should now be close to the warm ones. Record both runs in `docs/PERFORMANCE-BASELINE.md`, before and after.

This costs money every month. It is not a decision to make inside a session: get Rishi's agreement first, and if the answer is no, stop here, write the measured cold-start cost into the readiness document, and say plainly that the morning wait is the price of the free plan.

## 8. Co-locate the database

Only if section 6c found them in different regions.

Moving an Atlas cluster is a migration, not a setting, and Z Chaat has live bills. Do not do it inside this session. Write a short section in `docs/DEPLOYMENT.md` setting out: the current regions, the measured round-trip difference, what the move involves, and when it can happen — which is outside service hours, with a backup taken first and `npm run db:indexes` run against the new cluster before traffic moves.

If they are already both in Singapore, write one line in the baseline file saying so, so nobody checks again.

## 9. Leave the Vercel rewrite alone

You will notice that `client/vercel.json` adds a hop: browser, Vercel edge, Render Singapore, Atlas. Removing it and pointing the browser straight at the Render host would save a few milliseconds.

Do not. That rewrite is what makes the app and the API one origin, and the httpOnly refresh cookie on `Path=/api/v1/auth` and the `X-Requested-With` check in `middleware/requireCsrfHeader.js` both depend on that. Record the hop in the baseline file as a known, accepted cost.

---

## 10. Rules this must not break

From `CLAUDE.md`: "The server runs in the cloud, next to a separate Atlas cluster." This prompt is what makes "next to" true.
From `CLAUDE.md`: "Never create a bill in production to test something." Every measurement here is a read. `GET /api/v1/menu` and `GET /api/v1/health` change nothing.
From `docs/CONVENTIONS.md` section 11: `TRUST_PROXY` stays explicit, and stays `2`. Changing the plan does not change the number of proxies in front of the server.

## 11. Checks and golden day

Nothing in this prompt touches arithmetic, so the golden day cannot move. Run `npm test` and `npm run e2e` anyway at the end: a changed `render.yaml` is a deploy, and a deploy is when you want to know the suite is green.

---

## 12. Docs to update

1. New file `docs/PERFORMANCE-BASELINE.md`, as section 6 describes. Date it, name the commit, and say which numbers were measured on the live system and which came from a local build.
2. `docs/DEPLOYMENT.md`: the plan change in section 14, and the region section from section 8 of this prompt if it applies.
3. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P31, the cheap server wins."
   3. Decision log, dated today: "The API runs on Render's Starter plan, not free. | A free instance sleeps after fifteen minutes, so the first till of the morning waited for a container to boot. Measured before and after in `docs/PERFORMANCE-BASELINE.md`." Add a second line for the region if section 8 applied.
   4. Known problems: a row for the Render free plan, marked FIXED today, or marked OPEN with the measured cost if Rishi said no.
   5. "What changed recently": a P30 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
4. `docs/prompts/README.md`: add the P30 row and mark it Done.
5. `docs/CAFFEZA-BUILD-PLAN.md` section 3: add the P30 row.

---

## 13. Out of scope

Any change to `server/` or `client/`. P31 and P32 do that.
WebSockets. P33.
Moving the Atlas cluster. This prompt writes the plan; the move is its own scheduled job.
Caching anything.

## 14. Done when

1. `docs/PERFORMANCE-BASELINE.md` exists and every number in section 6 is in it, each marked as measured or built.
2. The cold-start figure is recorded both before and after the plan change, or the plan change is recorded as refused with the cost written down.
3. `npm test`, `npm run lint`, `npm run build` and `npm run e2e` all pass.
4. Every doc in section 12 is updated.
5. Commits on `main`, one line each, for example:
   `record the performance baseline`
   `move the api to render starter`
   `update docs for p30`
6. Push `main`.
7. Print a short summary: the cold and warm figures, whether responses were compressed, the two regions, and anything that surprised you.
