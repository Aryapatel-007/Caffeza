# P01 Production safety

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P00.

---

## 1. What to build, in one sentence

Make the existing code safe to run on a fresh production database behind a cloud host's proxy, and fix the time and date display bugs the audit found, without changing any endpoint or any model.

## 2. Module

Phase 2 production safety, from `docs/BUILD-PLAN.md` section 7.
It touches M0 (startup, environment, proxy), M2 (kitchen screen), M3 (bills list), M5 (attendance register) and M6 (hourly report).

---

## 3. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P01-production-safety.md`.
2. Run `git status` and `git pull`. You should be on `main` with nothing uncommitted except the file you just saved. If anything else is uncommitted, stop and list it.
3. If `server/.env.test` does not exist, copy `server/.env.test.example` to it.

## 4. Files to read first

`CLAUDE.md` is already loaded. Then read:

1. `docs/CURRENT-STATE-AUDIT.md` sections 8 and 10.
2. `docs/CONVENTIONS.md` sections 4, 6, 11 and 13.
3. `server/server.js`, `server/config/env.js`, `server/config/database.js`.
4. Every file in `server/models/`.
5. `server/scripts/seedDemo.js` lines 40 to 70 and 676 to 700, and `server/scripts/provisionRestaurant.js` for the script pattern.
6. `server/tests/helpers/testDatabase.js` and `server/tests/app.test.js`.
7. `server/middleware/rateLimit.js`.
8. `server/services/salesReportService.js` around line 195, and `server/utils/time.js`.
9. `client/vite.config.js`, `client/src/utils/formatDate.js`, `client/src/features/reports/ReportShell.jsx` from line 115, `client/src/features/kitchen/KitchenDisplayPage.jsx` around line 221, `client/src/features/billing/BillsListPage.jsx`, `client/src/features/attendance/AttendanceRegisterPage.jsx`.

## 5. Endpoints

None added, none changed.
`GET /api/v1/health` stays exactly as it is.

## 6. Database fields

None added, none changed.
This change is additive in the sense that matters for rollback: it adds a script and a startup check, and builds indexes the models already declare.
Rolling back to the previous version leaves the built indexes in place, which is harmless.

## 7. Permissions

No endpoint, so no role checks.
The new script is run by a developer from a terminal, like `provision:restaurant`.

---

## 8. The work

There are five parts. Do them in this order. Each part ends with its own tests passing.

### Part A. Build indexes deliberately, and refuse to start without them

**The problem.**
`server/config/database.js` turns `autoIndex` off when `NODE_ENV=production`, on purpose, so a live server never builds an index in the middle of service.
But nothing else builds them.
On a fresh production database, the unique indexes that stop duplicate bill numbers, two open orders on one table, duplicate KOT numbers and double stock deductions would simply not exist.
Every one of those guards would be silently off.

**A1. A model registry.**
Create `server/models/index.js`.
It imports every model from the 16 model files and exports one frozen array, `ALL_MODELS`, in alphabetical order of model name.
Use each file's existing export name. Do not rename anything.
The 16 are: AttendanceEntry, AuditLog, Bill, Branch, Category, Counter, Ingredient, Kot, MenuItem, Order, Recipe, RefreshToken, Restaurant, StockMovement, Table, User.
A header comment says: every new model file must be added here, and a test enforces it.

**A2. The index service.**
Create `server/services/indexService.js` with two exported functions.

`findMissingIndexes(models = ALL_MODELS)` returns:

```js
{
  missing: [{ model: 'Bill', collection: 'bills', key: { restaurantId: 1, billNumber: 1 }, options: { unique: true } }],
  extra:   [{ model: 'Table', collection: 'tables', name: 'restaurantId_1_foo_1' }],
}
```

`missing` is every index a schema declares that the database does not have.
`extra` is every index the database has that no schema declares, apart from `_id_`.
Use Mongoose's `Model.diffIndexes()`. First confirm in `node_modules/mongoose` that it exists in the installed 8.x version and what it returns. If it behaves differently from what this prompt assumes, compare `Model.schema.indexes()` against `Model.listIndexes()` yourself, by key and by the options that matter: `unique`, `partialFilterExpression`, `expireAfterSeconds`, `sparse`.
If a collection does not exist yet, MongoDB answers with error code 26, NamespaceNotFound. Treat that as "every index this schema declares is missing". Never let it throw.

`buildIndexes(models = ALL_MODELS)` builds what is missing and returns a per-model report:

```js
[{ model: 'Bill', collection: 'bills', created: ['restaurantId_1_billNumber_1'], alreadyPresent: 3, extra: [], error: null }]
```

Rules for `buildIndexes`:

1. Use `Model.createIndexes()`. It builds missing indexes and never drops anything.
2. **Never drop an index.** Not `syncIndexes`, not `dropIndex`, not for any reason. An extra index is reported and left alone.
3. One model failing does not stop the others. Record the error on that model's row and carry on.
4. Error code 11000, duplicate key: the data already breaks the unique rule. The row's `error` says which model and which key, and that the duplicates must be found and fixed by hand before the index can be built.
5. Error codes 85 or 86, IndexOptionsConflict or IndexKeySpecsConflict: an index with that name already exists with different options. The row's `error` says so, names the index, and says to review it and drop it by hand only after checking nothing depends on it.
6. Any other error: its code and message, as they came.

**A3. The script.**
Create `server/scripts/buildIndexes.js`, following the same shape as `provisionRestaurant.js`: connect with `connectDatabase`, do the work, disconnect, and only run when executed directly.
It calls `buildIndexes()` and prints one plain line per model, then a summary:

```
bills: created restaurantId_1_billNumber_1. 3 already present.
tables: nothing to do. 2 already present. Extra index left alone: restaurantId_1_foo_1.
users: FAILED. Duplicate key on { phone: 1 }. Find and fix the duplicates by hand, then run this again.

16 collections checked. 1 index created. 41 already present. 1 extra left alone. 1 failure.
```

Exit code 0 when there are no failures, 1 when there is at least one.
It prints which database host it is running against before it starts, the same way `seedDemo.js` does, so nobody builds indexes on the wrong cluster by accident.

Add the script to both package files:
`server/package.json`: `"db:indexes": "node scripts/buildIndexes.js"`.
Root `package.json`: `"db:indexes": "npm run db:indexes --workspace=server"`.

**A4. The boot check.**
In `startServer()` in `server/server.js`, after `connectDatabase()` and before `listen`:
when `config.isProduction` is true, call `findMissingIndexes()`.

If `missing` is not empty:
log with `logger.fatal` one line per missing index, naming the collection and the key,
then the line "Indexes are missing. Run npm run db:indexes against this database, then start again.",
then `process.exit(1)`.
There is no setting or flag that skips this check.

If `extra` is not empty, log each with `logger.warn` and continue.

When `NODE_ENV` is development or test, skip the check. `autoIndex` builds indexes there already.

**A5. Tests.** In a new file `server/tests/indexes.test.js`, using the in-memory replica set from `tests/helpers/testDatabase.js`:

1. Every `.js` file directly in `server/models/`, except `index.js`, has its model in `ALL_MODELS`, and `ALL_MODELS` has nothing else. Read the folder to check, so a model added later without registering fails this test.
2. After `await Promise.all(ALL_MODELS.map((m) => m.init()))`, `findMissingIndexes()` returns empty `missing` and empty `extra`. If this fails because of option differences Mongoose reports between a freshly built index and its schema, fix the comparison, not the test.
3. Drop the unique `{ restaurantId: 1, billNumber: 1 }` index on `bills`. `findMissingIndexes()` reports exactly that index. `buildIndexes()` creates it. `findMissingIndexes()` is empty again.
4. Drop the `kots` collection entirely. `findMissingIndexes()` reports every index the Kot schema declares, and does not throw. `buildIndexes()` creates them all.
5. Drop the unique `{ phone: 1 }` index on `users`, then insert two raw documents with the same phone straight into the collection. `buildIndexes()` returns a failure row for User that mentions the duplicate, and still returns rows for the other 15 models. Clean up afterwards and rebuild the index.
6. Create an extra index `{ restaurantId: 1, foo: 1 }` on `tables`. `buildIndexes()` leaves it in place and reports it as extra.

Restore every index a test removes, so later tests in the same file start clean.

---

### Part B. Trust the host's proxy, explicitly

**The problem.**
`trust proxy` is off. A cloud host puts its own proxy in front of Node, so every device in the cafe arrives from the proxy's address.
`server/middleware/rateLimit.js` keys both limiters on `req.ip`.
One captain mistyping a password a few times would lock every device out of signing in.

The opposite mistake is just as bad.
`trust proxy` set to `true` believes any `X-Forwarded-For` header, so anyone can send a fake one and get unlimited login attempts.

**B1. A parser.**
Create `server/config/trustProxy.js` exporting a pure function `parseTrustProxy(text)`.
It does not read `process.env`. `env.js` stays the only file that does.

| Input | Result |
|---|---|
| empty, or `false` | `false` |
| a whole number from 1 to 10 | that number. It means "this many proxies sit in front of the server". |
| a comma-separated list where each item is `loopback`, `linklocal`, `uniquelocal`, an IPv4 or IPv6 address, or an address with a `/prefix` | an array of the trimmed items |
| `true` | an error: "TRUST_PROXY=true trusts a forwarded address from anyone, which lets any client bypass the login rate limit. Use the number of proxies in front of the server, usually 1." |
| anything else | an error naming the value and listing the accepted forms |

Check addresses with `node:net` `isIP`. A prefix must be within range for its address family: 0 to 32 for IPv4, 0 to 128 for IPv6.

**B2. The environment variable.**
In `server/config/env.js`, add `TRUST_PROXY`, parsed with `parseTrustProxy`, in the same style as the other variables, so a bad value produces one clear line in the existing startup error report.
`config.TRUST_PROXY` holds the parsed value: `false`, a number, or an array.

In production it must be set explicitly, even if only to `false`.
If `NODE_ENV=production` and `TRUST_PROXY` is absent or empty, startup fails with:
"TRUST_PROXY must be set in production. Use 1 when the host puts one proxy in front of the server, or false when nothing sits in front of it."
This means you need to tell "absent" apart from "set to false". The existing `optionalVar` helper replaces absent with its fallback, so it cannot be used as it is for this variable.

In development and test, absent means `false`, which is today's behaviour.

**B3. Use it.**
In `createApp()` in `server/server.js`, replace the `TODO(deploy)` comment block with `app.set('trust proxy', config.TRUST_PROXY)` and a short comment saying why it is explicit and why `true` is refused.
In `startServer()`, log the setting once at startup, in plain words: "Trusting 1 proxy in front of the server." or "Not trusting any proxy."

**B4. `.env.example`.**
Add, under the Server section:

```
# How many proxies sit in front of the server, so the rate limiter sees each
# device's real address. Leave empty on your laptop. In production it must be
# set: 1 on a host with one proxy in front, false if nothing sits in front.
# Never true: that lets anyone fake their address and skip the login limit.
TRUST_PROXY=
```

**B5. Tests.**
New file `server/tests/trustProxy.test.js`: every row of the table in B1, including the exact message for `true`, an IPv4 prefix of 33, and an IPv6 prefix of 129.
In `server/tests/app.test.js`, add one test: `createApp().get('trust proxy')` equals `config.TRUST_PROXY`, which is `false` under the test environment.

---

### Part C. Time display and business dates

**C1. The kitchen screen.**
`client/src/features/kitchen/KitchenDisplayPage.jsx` line 221 shows a ticket's fire time with `new Date(firedAt).toLocaleTimeString()`.
That uses the tablet's own time zone and format, so a tablet set to the wrong zone shows the wrong time.
Replace it with `formatTimeIst(firedAt)` from `client/src/utils/formatDate.js`.

**C2. The hourly report.**
`server/services/salesReportService.js` line 195 hardcodes `timezone: 'Asia/Kolkata'`.
Use `config.DISPLAY_TIMEZONE` from `server/config/env.js` instead.
Business dates still use the fixed IST offset in `server/utils/time.js`. Do not change that.

**C3. The default date on the bills list and the attendance register.**
`BillsListPage.jsx` and `AttendanceRegisterPage.jsx` default their date filter to `todayIso()`, which is today's calendar date in India.
Both lists filter by business date.
Caffeza bills until after midnight. At 12:30 AM the calendar date is already tomorrow, but the business date is still today, so the cashier's bills list shows nothing while the cafe is still billing.

Fix it:

1. In `client/src/utils/formatDate.js`, add `DEFAULT_BUSINESS_DAY_START_MINUTES = 300` and `businessDateForIst(instant, startMinutes = DEFAULT_BUSINESS_DAY_START_MINUTES)`, a line-for-line mirror of `businessDateFor` in `server/utils/time.js`. Add `businessDateToday(startMinutes)`, which is `businessDateForIst(new Date(), startMinutes)`. The header comment says it mirrors the server and must stay identical.
2. Both pages default to `businessDateToday()`.
3. Rewrite `lastNDays` in `client/src/features/reports/ReportShell.jsx` on top of `businessDateForIst`, keeping its signature and its output exactly the same. It already uses the 5:00 AM boundary correctly. This removes its private copy of the arithmetic.
4. If nothing uses `todayIso` after this, remove it.

The client assumes the 5:00 AM start, because cashiers cannot read `GET /settings`, which is owner and manager only.
Caffeza uses 5:00 AM.
Record this as a known problem, described in section 9 of this prompt.

**C4. Tests.**
New file `server/tests/timeDisplay.test.js`:

1. Import `businessDateForIst` from `../../client/src/utils/formatDate.js` and `businessDateFor` from `../utils/time.js`. For each of these India times, both functions return the same business date: 26 Sep 2026 at 12:00 PM, 11:59 PM, 12:30 AM on 27 Sep, 4:59 AM on 27 Sep, and 5:00 AM on 27 Sep. The expected values are 2026-09-26 for the first four and 2026-09-27 for the last. Also check with a start of 0 minutes.
2. No file under `client/src/` except `utils/formatDate.js` contains `toLocaleTimeString(`, `toLocaleDateString(`, `toLocaleString(` or `Asia/Kolkata`. Read the files from disk to check.
3. No file under `server/`, outside `node_modules` and `tests`, contains `Asia/Kolkata` except `config/env.js`.

The last two tests stop the same bug from coming back in a new screen.

---

### Part D. The client builds without a `.env` file

`client/vite.config.js` runs `new URL(env.CLIENT_ORIGIN ?? '')`, which throws "Invalid URL" when `CLIENT_ORIGIN` is missing.
A host that builds the client usually has no `.env` file at build time, so the production build would fail.

Add a small function in `vite.config.js` that returns the port from an origin, or the default port when the origin is missing or not a valid URL. Use it for `clientPort`.
Nothing else in the file changes.

Verify both of these succeed:

```
npm run build
CLIENT_ORIGIN= npm run build
```

On Windows PowerShell, the second one is:

```
$env:CLIENT_ORIGIN=""; npm run build; Remove-Item Env:CLIENT_ORIGIN
```

---

### Part E. Confirm the demo seed script cannot touch production

The audit said `seedDemo.js` could run against production. That was wrong.
`assertSafeToSeed()` already refuses unless `NODE_ENV` is development or test, and refuses any host other than localhost unless it is listed in `SEED_DEMO_ALLOWED_HOSTS`. It runs before any connection is made.

Do not change the script. Prove it:

```
NODE_ENV=production TRUST_PROXY=false DEMO_PASSWORD=x node server/scripts/seedDemo.js
```

It must exit with a non-zero code and print the "Refusing to run: NODE_ENV is "production"" message, without attempting a database connection.
`TRUST_PROXY=false` is needed only because Part B now makes it required in production, and the environment is checked before the script's own guard.

---

## 9. Docs to update

1. `docs/CONVENTIONS.md` section 4, under "Indexes", add:
   "Indexes are built by `npm run db:indexes`, on every deploy. In production the server refuses to start while any declared index is missing. A new model file is added to `server/models/index.js`, and a test enforces it. Indexes are never dropped by a script."
2. `docs/CONVENTIONS.md` section 11, add:
   "`TRUST_PROXY` must be set explicitly in production. Never `true`."
3. `docs/DEPLOYMENT.md` section 3: replace the line that says P01 makes the seed script refuse to run in production with:
   "The script already refuses to run unless `NODE_ENV` is development or test, and refuses any host but localhost unless it is listed in `SEED_DEMO_ALLOWED_HOSTS`."
4. `docs/CURRENT-STATE-AUDIT.md` section 10, the "Separation from demo data" row: change its status to "Partly done" and its last sentence to "`seedDemo.js` already refuses to run in production. P01 confirmed it."
5. `docs/PROJECT-STATE.md`:
   1. The date line: today, by Arya.
   2. "Current stage": change the "Next:" line to "Next: P02, settings for feature switches and the invoice series."
   3. Known problems, the seven rows dated "Audit, 2026-09-29": set each status. Five become "FIXED in P01." The seed script row becomes "NOT A PROBLEM. `assertSafeToSeed` already refuses outside development and test, before connecting. Confirmed in P01." The test row becomes "DONE in P01: N passing, M failing.", with the real numbers.
   4. Add a known problem: "Client date filters assume the business day starts at 5:00 AM, because cashiers cannot read `GET /settings`. If a restaurant changes `businessDayStartsAtMinutes`, default dates on the bills list, attendance register and report screens will be off. Caffeza uses 5:00 AM." Found by Arya, P01. Status OPEN.
   5. Decision log, three rows dated today:
      "Indexes are built by an explicit script on every deploy, never on boot and never by `syncIndexes`. The production server refuses to start while a declared index is missing. | `autoIndex` stays off in production so a live server never builds an index mid-service, and the boot check makes a missing guard impossible to miss. `syncIndexes` drops indexes it does not know about, so it is never used."
      "`TRUST_PROXY` must be set explicitly in production, and `true` is refused. | Off behind a proxy makes one failed login lock out every device. `true` lets any client fake its address and skip the login limit."
      "Client default dates use the business date, mirrored from `server/utils/time.js` in `client/src/utils/formatDate.js`. | The bills list showed nothing after midnight while the cafe was still billing the same business day."
   6. "What changed recently": add a P01 entry at the top in the usual shape, and move the oldest entry to `docs/archive/SESSION-LOG.md` at the top, so ten plus this one remain.
6. `docs/prompts/README.md`: mark P01 as Done.

---

## 10. Non-negotiable rules that apply

"Store timestamps in UTC. Convert to India time only for display."
"Bill numbers are generated on the server, are sequential, and are never reused." The unique index on `{ restaurantId, billNumber }` is part of how that holds, which is why Part A exists.
"Secrets live in `.env`. `.env` is in `.gitignore`. Never commit a real secret."
"Which business day a moment belongs to is decided only by `businessDateFor` in `server/utils/time.js`." The client mirror in C3 is a copy of that function, tested to agree with it. It is not a second rule.
From `docs/CONVENTIONS.md` section 11: "If you add a variable, add it to `.env.example` in the same commit."

---

## 11. Checks and golden day

No money, tax, bill or report arithmetic changes in this prompt, so no check from `docs/RECONCILIATION-RULES.md` applies yet, and the golden day is not built yet.
Instead: the whole existing test suite must pass after the change, exactly as before it, plus the new tests.

Run `npm test` once **before** changing anything, and record the count.
If anything already fails before your change, do not fix it here. Record it in known problems, and tell me.
Run it again at the end. Every test that passed before must still pass.

---

## 12. Out of scope

Serving the built client from Express. That is P12.
Choosing a host, a domain, or any Atlas setting. That is P12 and `docs/DEPLOYMENT.md`.
Any change to models, schemas, endpoints, validators or permissions.
Changing `businessDateFor` or the fixed IST offset.
Making client screens read the business day start from settings.
Any change to `seedDemo.js` or `provisionRestaurant.js`.
Dropping, renaming or changing any existing index.

---

## 13. Done when

1. `npm test` passes, with the before and after counts recorded in `docs/PROJECT-STATE.md`.
2. `npm run lint` passes.
3. `npm run build` passes, with and without `CLIENT_ORIGIN` set.
4. `npm run db:indexes` against your local development database prints one line per collection, a summary, and exits 0. Run it twice. The second run creates nothing.
5. Starting the server with `NODE_ENV=production` and `TRUST_PROXY` unset fails with the TRUST_PROXY message.
6. The seed script check in Part E refuses as described.
7. Every doc in section 9 is updated.
8. Commit on `main` in a few small commits, one line each, present tense, for example:
   `add index build script and production index check`
   `set trust proxy from TRUST_PROXY`
   `fix kitchen time and business date defaults`
   `fix client build without env`
   `update docs for p01`
9. Push `main`.
10. Print a short summary: commits made, files added and changed, test counts before and after, the output of the second `db:indexes` run, and anything that surprised you.
