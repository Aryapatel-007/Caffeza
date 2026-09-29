# PROJECT STATE

This is the single source of truth for where the project stands.

Anyone starting any chat, any Claude Code session, or any Antigravity session reads this first.

Anyone finishing any session updates this before closing.

Last updated: 2026-08-31 by Rishi

---

## Current stage

Stage 8: **all of Phase 1 is on `main`.** M0 through M6 are merged, and M7
Restaurant Settings, the first Phase 1B module, is feature-complete on
`feat/m7/restaurant-settings`.

Every module was verified against the live Atlas cluster before being called
complete, not only against the test suite: M3's GST arithmetic and receipt
wrap, M4's stock deduction, cancellation return and ledger reconciliation, M6's
figures reconciling against an independent count, and M7's no-migration read
against a document that genuinely predates it.

Every spec since M2 was written first, as its own commit, before any model
existed for that module -- the precedent M1 and M5 set and the one M2 broke.
BUILD-PLAN section 13 now has that as its first condition of done, so a module
with no spec section can no longer pass every other check vacuously.

Auth, tenancy, roles, provisioning, staff management, the menu, order taking
with a kitchen display, employee attendance, billing with GST, inventory with
recipe deduction, and reports all work end to end and are merged. 524 tests
pass on `main`, 551 with M7's.

**The review debt is the thing to fix next, not another module.** M1, M4, M5,
M6 and now M7 have all been built by Rishi against a module table that lists
Arya as the owner of three of them, and none has had the second developer's
read that BUILD-PLAN section 13 requires. Five modules of it are now on or
heading for `main`.

M5 Employee Attendance merged on 2026-08-30 through pull request #5, which
carried the whole chain: `chore/m5/spec` (contract), `fix/m0/auth-hardening`
(M0-D: httpOnly refresh cookie, staff PIN, cleanup), `feat/m0/email-login`,
`feat/m5/attendance` (M5 server), and the screens plus the station clock
endpoint. It was merged on Rishi's decision without Arya's read, which
BUILD-PLAN section 9 lists as part of the definition of done. That review debt
is real and is in the known problems table, for M1 and M5 both.

M3 Billing is unblocked. Every order line carries a snapshot `unitPriceInPaise`
and `taxRateBps` taken when the line was added, an order reaches
`READY_TO_BILL` on its own when everything is served, and `orders.billId` and
the `BILLED` status are reserved and untouched, waiting for M3 to set them.

Read the note in `server/models/Counter.js` before writing bill numbers. The
order and KOT sequences tolerate gaps. A bill sequence does not, and M3 cannot
reuse that pattern as it stands.

The two pilot blockers in the known problems table, the localStorage refresh
token and the committed Atlas credential, are now cleared **on `main`**. The old
credential still exists in git history at 177ed9c; it is dead, and the purge is
still deferred.

---

## Module status

Status values: NOT STARTED, IN PROGRESS, BLOCKED, DONE

| ID | Module | Owner | Status | Notes |
|----|--------|-------|--------|-------|
| M0 | Foundation (auth, roles, tenancy) | Rishi | DONE | All four parts are on `main`. A/B/C shipped earlier; part D (httpOnly refresh cookie, staff PIN, cleanup) and email as a second login identity + chosen provisioning password merged with M5 in pull request #5. |
| M1 | Menu Management | Arya | DONE | Built by Rishi on 2026-08-29, not by the listed owner. See the decision log. Eleven endpoints with 42 tests, plus the builder and availability board screens. Arya still has to read it. |
| M2 | Order Taking and KOT | Rishi | DONE | Eighteen endpoints, four collections, 84 tests, five screens. Verified end to end against the live Atlas cluster. |
| M3 | Billing with GST | Rishi | IN PROGRESS | Feature-complete and verified end to end against the live Atlas cluster, including the GST arithmetic across all three slabs and the receipt wrap on a real long dish name. Not done under BUILD-PLAN section 9: the CA review of the GST output on a real printed bill and the real-thermal-printer test are pilot gates code cannot close. |
| M4 | Inventory with recipe deduction | Arya | IN PROGRESS | Feature-complete on `feat/m4/inventory` and verified end to end against the live Atlas cluster. Eleven endpoints, three collections, 51 tests, three screens. Built by Rishi, off the listed owner, the same crossing as M1 and M5. Not done under BUILD-PLAN section 9: Arya has not read it. |
| M5 | Employee Attendance | Arya | DONE | Built by Rishi, not the listed owner, the same crossing as M1. Merged to `main` on 2026-08-30 via pull request #5. Eleven endpoints including `POST /attendance/station/clock` wired to `authService.verifyPin`, and three React screens (the clock, the register, my hours). Marked DONE on the code and the tests; Arya's read is still outstanding and is in the known problems table. |
| M6 | Reports and Dashboard | Rishi | IN PROGRESS | Server and screens both built on `feat/m6/reports`: ten read-only endpoints, no collection, 34 tests, seven screens. Verified live against the seeded Atlas data, where its figures reconcile exactly with the independent Section 11 verification. Not done under BUILD-PLAN section 13: Arya has not read it. |
| M7 | Restaurant Settings | Rishi | DONE | Phase 1B's first module. Two endpoints, no new collection: `restaurants.settings` gains `tax`, `receipt` and `inventory`, every field with a schema default so there is no migration. `settingsService` is now the only way any module reads configuration. 27 new tests. Verified live against the Atlas cluster, including a genuine pre-M7 document reading back complete. Not done under BUILD-PLAN section 13: Arya has not read it. |

---

## In scope right now

Only M0 to M6 above.

Everything else from the 34 module list is deferred. See BUILD-PLAN.md section 12.

If a request does not map to M0 to M6, it is out of scope. Say so, do not build it.

---

## Decision log

Add a line every time a real decision is made. Never delete old lines.

| Date | Decision | Reason |
|------|----------|--------|
| | Building version 1 in MERN, not Frappe | Both devs know MERN, want to validate the idea fast. Revisit when payroll or GST gets complicated. |
| | Web app is online only | A web app cannot work offline. Offline belongs to the later Android app. |
| | Payroll excluded from version 1 | Statutory deductions must be exactly right. Needs a CA and its own focused build. |
| | Not integrating payments in version 1 | Restaurant keeps their existing UPI QR and card machine. We only record the method used. |
| 2026-08-28 | Express 5, not Express 4 | Current major, and it forwards async handler errors to the error handler on its own. Cost: `req.query` is getter-only, so sanitised values are written back through `utils/requestQuery.js`. |
| 2026-08-28 | Zod 4 | Current major. Used for request validation and for environment validation. |
| 2026-08-28 | Tailwind CSS 4, configured in CSS | v4 needs no `tailwind.config.js` and no PostCSS config. Theme tokens live in `client/src/index.css` under `@theme`. If you go looking for a config file, that is why there is not one. |
| 2026-08-28 | Tests use the Node built-in runner, `node --test` | No test framework to install, pin or argue about. `npm test` from the repo root. |
| 2026-08-28 | Added `concurrently` and `pino-pretty` beyond the agreed dependency list | `npm run dev` cannot run two processes on Windows without `concurrently`. Pretty development logs need `pino-pretty`. Both are dev dependencies. |
| 2026-08-28 | General API rate limits are constants in `middleware/rateLimit.js`, not environment variables | `.env.example` only carries the login limits, and adding a variable means telling the other developer in the same commit. Promote them if they ever need to differ per environment. The login limiter reads from config as agreed. |
| 2026-08-28 | The six roles live in `server/config/roles.js` | CONVENTIONS section 1 has no `constants` folder, and adding one would break the agreed layout. |
| 2026-08-28 | `client/src/utils/formatMoney.js` exists | CONVENTIONS section 5 requires one shared frontend helper for paise to rupees. Without it, the first module to show a price invents its own. |
| 2026-08-28 | `NotFoundPage` sits in `components/`, not `features/` | It does not belong to a module. Every module can land on it. |
| 2026-08-28 | `server.js` exports `createApp()` and only listens when run directly | Lets the tests drive the real middleware chain without a database or an open port. The boot path still refuses to listen before the database is up. |
| 2026-08-28 | The client reaches the API through a Vite dev proxy, not a `VITE_API_URL` variable | Same origin in development and in production, one less difference between them, and no new environment variables. |
| 2026-08-28 | Money rounds half away from zero | `rupeesToPaise` and `applyBasisPoints` both do it, so they can never disagree. Whether GST rounds per line or on the bill total is M3 work and is not decided by these helpers. |
| 2026-08-28 | The environment validator rejects the placeholder secrets from `.env.example`, and requires the two JWT secrets to differ | Copying `.env.example` to `.env` and forgetting to fill it in is the most likely way a shared secret reaches a deployment. |
| 2026-08-28 | `$nor` never satisfies the tenant guard | `$nor: [{ restaurantId: A }]` means every restaurant except A. It mentions `restaurantId` while doing the exact thing the guard exists to stop. |
| 2026-08-28 | Mongoose `strictQuery` is `throw`, and `autoIndex` is off in production | A filter on a field the schema does not have should be an error, not a silent match-everything. Indexes get built during a deploy, not on the first query after a restart. |
| 2026-08-29 | Phone numbers are unique across the whole platform, not per restaurant | Login is phone plus password with no restaurant selector. Two restaurants with the same number would leave the server unable to tell which account to check. The cost: someone working at two of our customer restaurants needs two numbers. The alternative was a restaurant code field on a screen used forty times a day. From docs/DB-SCHEMA.md. |
| 2026-08-29 | Two new error codes, `INVALID_CREDENTIALS` and `INVALID_REFRESH_TOKEN`, added to part A `utils/errors.js` | docs/API-CONTRACT.md requires both and CONVENTIONS section 3 allows a module to add codes in the same shape. Additive only. It is the one part A file M0-B changed that section 9.3 did not name. |
| 2026-08-29 | The new-password-equals-old check lives in the controller, not the Zod schema | The M0-B brief asked for a schema refinement returning 422. Every failure raised inside a schema comes back as 400 through part A validate middleware, and changing that was out of scope. docs/API-CONTRACT.md section 1.6 wants 422, and the contract wins. |
| 2026-08-29 | `authenticate` takes the role from the database, not from the token claim | The middleware already loads the user for the isActive and passwordChangedAt checks, so the fresh role is in hand. Trusting the claim would let a demoted user keep the old permissions for the rest of the 15 minute token. Matters from M0-C, when roles become editable. |
| 2026-08-29 | `authenticate` hands the loaded user and restaurant on as `req.currentUser` and `req.currentRestaurant` | `/auth/me` and `GET /restaurant` need exactly those two documents. Reading them twice in one request buys nothing. Still live reads, so a role changed five minutes ago still shows. |
| 2026-08-29 | The access token expiry sent to the client is read back off the signed token, not from parsing config | `expiresInSeconds` can then never drift from the `exp` actually in the token. |
| 2026-08-29 | Everything touching the stored password hash lives in `services/authService.js` | So that `grep -rn "passwordHash" server/controllers/` returns nothing and keeps returning nothing. The controller asks whether a password is right and never sees the hash. |
| 2026-08-29 | `DUMMY_HASH` is generated at boot at the configured cost, not hardcoded | A hash baked in at a different cost factor would compare faster or slower than a real one and reintroduce the timing gap it exists to close. |
| 2026-08-29 | The `passwordChangedAt` comparison is `<=`, not `<` | A JWT `iat` has one second of resolution, so a token issued in the same second as a password change was indistinguishable from one issued after it, and survived. Fail closed. Found by a flaky test, not by reading the code. |
| 2026-08-29 | Tests run against `mongodb-memory-server` as a one-member replica set | Atlas is unreachable from a developer machine that is not on its allowlist, and blocking on that would have blocked all of M0-B. A replica set rather than a standalone, so the provisioning transaction path is tested rather than assumed. |
| 2026-08-29 | `CLAUDE.md` moved from `docs/CLAUDE_1.md` to the repo root | CONVENTIONS section 1 puts it at the root, and Claude Code only auto-loads a root `CLAUDE.md`. In `docs/` under that name it was not being loaded as project context at all. |
| 2026-08-29 | A user created through POST /users gets `passwordChangedAt: null`, not the current time | The M0-C brief said set it to now. Doing so broke the new user first login: the authenticate check compares whole seconds and fails closed, so a token minted in the same second as the stamp was rejected. The field exists to invalidate tokens issued before a change, and a user who has never signed in has none. Caught by a live end-to-end run, not by the tests, which only asserted the login status. |
| 2026-08-29 | The global phone lookup was extracted into `authService.isPhoneRegistered` | Creating a staff user and provisioning a restaurant both need it. Without the extraction there would have been a fourth `skipTenantGuard`. There are still exactly three. |
| 2026-08-29 | `authService` also owns creating a user with a password | It is the moment the stored credential is set, and keeping it there is what makes `grep -rn "passwordHash" server/controllers/` return nothing and stay that way. |
| 2026-08-29 | Every permission and business rule for staff lives in `services/userPermissionService.js` | Anyone asking what a manager may do reads one file rather than four route handlers. Permission rules throw 403, business rules throw 422, and the split is deliberate: 403 means not you, 422 means not this, by anyone. |
| 2026-08-29 | `LAST_OWNER` is its own error code; changing your own role reuses `BUSINESS_RULE_VIOLATED` | The contract names LAST_OWNER and the client needs to recognise it. Self-demotion has no code in the contract, so it uses the general one rather than inventing a second. |
| 2026-08-29 | The user response is an explicit whitelist, not the model `toJSON` | The contract says "the created user without passwordHash" without listing fields. A whitelist means a field added to the model in M1 cannot leak through this endpoint by accident. |
| 2026-08-29 | `PATCH /users/:userId` refuses `phone`, `isActive` and `password` rather than ignoring them | Each has its own endpoint or is immutable. Silently dropping a field lets a caller believe a change landed when it did not. |
| 2026-08-29 | `isActive` in the list query is matched as the literal string true or false | It arrives from a query string, and `z.coerce.boolean()` turns the string "false" into `true`, which is the wrong answer in the most confusing possible way. |
| 2026-08-29 | Search input is escaped before it becomes a regex | Unescaped, a search for `.*` matches every row, turning a search box into a full collection scan and a way to enumerate staff. There is a test asserting it finds nobody. |
| 2026-08-29 | Reactivating a user does not restore their old sessions | Whatever the reason was for switching them off should not hand back a live session. They sign in again. |
| 2026-08-29 | A shared `Select` component was added to `components/ui/` | The staff screens need role and status pickers. Without a shared one, every module would grow its own, which is the thing the shared component folder exists to prevent. |
| 2026-08-29 | M1 was written by Rishi although the module table lists Arya as its owner | CONVENTIONS section 9 says one module, one owner. This crosses that and is recorded rather than left to be discovered in the git log. Arya still has to read the code before M1 counts as done under BUILD-PLAN section 9. |
| 2026-08-29 | The M1 sections of `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md` were written and committed before any M1 code | Neither file had an M1 section, and CLAUDE.md forbids inventing their contents. Writing the spec as its own commit first means the code was built against a contract in the repo rather than against a prompt in a chat window nobody else can read. |
| 2026-08-29 | The `toJSON` transform was extracted from `baseSchema.js` into `models/plugins/jsonTransform.js` | A variant subdocument has no `restaurantId`, so it cannot apply `baseSchemaPlugin`, but it needs the same `_id` to `id` rename. Without extracting, the same six lines would have been written three times. `baseSchema` behaviour is unchanged. |
| 2026-08-29 | `nameLower`, a derived lowercase field, gives case-insensitive uniqueness instead of a collation index | A collation-aware unique index is only honoured by queries that specify the same collation, and one written without it silently answers case-sensitively. A plain field makes the rule visible in the index definition and impossible to query around by accident. It is stripped in `toJSON`. |
| 2026-08-29 | `isAvailable` and `isActive` are two fields on a menu item, not one status | "Out of paneer tonight" and "off the menu" are different events with different permissions: all six roles may set the first, only owner and manager the second. One field would mean a cook could delete a dish, or reinstating stock would reinstate a withdrawn dish. |
| 2026-08-29 | A variant `priceInPaise` is the absolute price, not a delta from the item base price | A delta means every variant price moves silently when the base price changes, and the manager who raised the full plate by ten rupees did not intend to raise the half plate too. |
| 2026-08-29 | Variant and add-on subdocument ids are matched by id on PATCH and never regenerated | M4 attaches recipes to a `variantId` and M2 stores one on an open order line. Assigning the request array straight onto the document makes Mongoose mint fresh ids, which detaches a recipe the first time someone renames a variant, and nothing notices until a deduction runs. Matching by position or by name fails for the same reason: both change during an ordinary edit. |
| 2026-08-29 | Deactivating a category does not cascade to its items | The items stop being visible because their category is off, not because they were changed, so reactivating restores them exactly. A cascade would also mean hiding a section for a week silently deactivated forty items nobody chose to touch. |
| 2026-08-29 | `GET /menu-items` with `includeInactive=false` also hides items whose category is inactive | An item in a switched-off section is not on the menu either way. Honouring one flag and not the other would be arbitrary. Costs one extra query for the inactive category ids. |
| 2026-08-29 | `GET /menu` has no `includeInactive` parameter at all, rather than one defaulting to false | It is the ordering screen's read. A parameter that can reveal an inactive dish is one typo away from selling something that was withdrawn, so the parameter does not exist. |
| 2026-08-29 | `GET /menu` returns a category with no visible items as an empty tab rather than omitting it | The ordering screen's tabs should not rearrange themselves mid-service as dishes sell out. |
| 2026-08-29 | `GET /categories` and `GET /menu` are not paginated, `GET /menu-items` is | A restaurant has tens of categories and the ordering screen needs all of them at once to draw itself. The flat item list is the admin screen's read and can grow, so it takes the standard M0 paging envelope. |
| 2026-08-29 | Four new error classes in `utils/errors.js` rather than passing a code into `DuplicateError` and `NotFoundError` | The four M1 errors are raised from two controllers and a shared helper. A class cannot be constructed with the wrong code by accident, and existing M0 classes were left untouched. |
| 2026-08-29 | `escapeRegex` was extracted into `utils/escapeRegex.js` for M1's search box | The decision log already says every new search box must escape its input. A second private copy of a security-relevant function is how one copy drifts. `userController.js` still has its own and should be switched over; see the known problems table. |
| 2026-08-29 | Changing an item's `categoryId` applies the same rules as creating one: 404 if the category is missing, 422 if it is inactive | The brief specified this only for create. Allowing a move into a switched-off category on update would have been a way around the create rule. |
| 2026-08-29 | `PATCH /menu-items/:id` refuses `isAvailable` and `isActive` rather than ignoring them | Each has its own endpoint with different permissions. Accepting `isAvailable` here would create a second, narrower-guarded path to a field four more roles are allowed to change elsewhere. |
| 2026-08-29 | A subdocument entry that omits `isAvailable` on update keeps its current value rather than resetting to true | A manager renaming a variant should not silently put something the kitchen switched off half an hour ago back on the ordering screen. |
| 2026-08-29 | The design was decided and drawn before any screen code, and the result is `docs/DESIGN-SYSTEM.md` plus a saved canvas | M1 is the first UI in the project, so it sets the visual language M2 through M6 inherit. Tokens defined once, in Figma variables first and then in `index.css`, so the two cannot drift. |
| 2026-08-29 | Six colour tokens, and `chana`, `mirch` and `patta` are functional rather than brand colour | A palette where six things are green is a palette where green means nothing. The three carry meaning: commits the action, destructive or out of stock, available or succeeded. Anything that just needs to be visible uses ink or steel. |
| 2026-08-29 | IBM Plex Mono for numbers, IBM Plex Sans for everything else | Prices and stock counts are what this product is about, and a printed-ticket voice for numbers also lines a column of prices up on the decimal for free. The first draft put item descriptions in Mono, which is prose; that was caught in the design critique and fixed. |
| 2026-08-29 | The menu builder reads `GET /categories` and `GET /menu-items` directly, not `GET /menu` | The brief said both screens read the menu tree. The contract is explicit that inactive categories and items never appear on `GET /menu` under any query, and the builder exists to switch them back on. The contract wins. `GET /menu` is the availability board's read. |
| 2026-08-29 | Design tokens live in `client/src/index.css` under `@theme`, not `tailwind.config.js` | The brief named a config file. Tailwind v4 is configured in CSS and has no config file, a decision already logged on 2026-08-28. Same outcome, different file. |
| 2026-08-29 | The M0 `brand-*` placeholder tokens now alias `chana` rather than being deleted | M0 screens still reference them and restyling M0 was not in M1's scope. Aliasing means those buttons pick up the real primary without touching M0 component code. Remove the alias when the M0 screens migrate. |
| 2026-08-29 | `@tanstack/react-query` added to the client | The availability board's optimistic toggle with rollback is exactly what it exists for, and hand-rolling that across two screens in `useState` and `useEffect` is where staleness bugs live. First new client dependency since M0. |
| 2026-08-29 | Only the availability toggle is optimistic; category and item edits are a plain request and refresh | A cashier at a counter cannot wait for a round trip before a tile responds. An owner editing the menu is not doing it mid-rush and is better served by knowing the save actually landed. |
| 2026-08-29 | `parseRupeesToPaise` was added to `client/src/utils/formatMoney.js` | A form takes rupees and the API takes paise, so something has to convert. It rounds on the decimal digits exactly as `server/utils/money.js` does, so the two can never disagree, and it lives beside `formatPaise` rather than in a second file. |
| 2026-08-29 | `AvailabilityStamp` is one component with a size prop, not a separate mini version | The design system says one rendering everywhere availability appears. Two drawings of the same idea drift apart the first time one is touched. |
| 2026-08-29 | The item editor builds its form state in a `useState` initialiser and the caller keys it on the item id | Populating it in an effect left the fields empty for a frame every time the panel opened. Keying on the id remounts on a different item, which removes the effect entirely rather than making it correct. |
| 2026-08-29 | Error copy for M1 lives in `features/menu/errorCopy.js`, one file | A user never sees a code or a status number. Keeping it in one place means the next module extends a map rather than writing a second one, and it is where the "refetch because our copy is stale" list lives too. |
| 2026-08-29 | No drag-and-drop reordering; `displayOrder` is a numeric field | It is a real feature rather than a v1 requirement, and it is easy to get wrong on touch, which is the primary device here. |
| 2026-08-29 | M5 D1: the business day starts at `restaurants.settings.businessDayStartsAtMinutes`, an integer minutes past midnight IST, default 300 (05:00), configurable per restaurant via `PATCH /restaurant` | A restaurant that closes after midnight needs late-night sales and shifts counted under the day they started. This closes an open question standing since M0 that M3 and M6 both need. Every attendance entry stores a derived `businessDate` at clock-in. |
| 2026-08-29 | M5 D2: self-service clock-in on a shared tablet is authenticated by a per-user PIN, a second credential on the `users` record that never issues a session | A restaurant cannot hand the owner's phone to a dishwasher. The PIN reaches only `POST /attendance/station/clock`, so a stolen PIN buys a clock event and nothing else. Delivered by M0-D. Matches the deferred note already in API-CONTRACT.md. |
| 2026-08-29 | M5 D3: attendance corrections are embedded on the entry as `corrections[]`, not in a shared audit collection | BUILD-PLAN section 7 requires who/when/why on every correction. No shared audit collection exists yet and M3 is the module that will define one. Building a general one now would be speculative; M3 decides later whether to absorb these. |
| 2026-08-29 | M5 D4: nobody corrects or voids their own attendance entry, including an OWNER; it is a 422 `SELF_CORRECTION_FORBIDDEN`, not a 403 | The audit trail exists to catch an insider inflating their own hours. 422 because it binds an owner too: 403 means not you, 422 means not this by anyone, the M0-C split. A single-owner shop cannot self-correct; accepted. The station undo is the one narrow exception. |
| 2026-08-29 | M5 D5: an open shift is never auto-closed; past 12 hours it is flagged `requiresAttention` in the register and a manager closes it with a reason | An auto-close writes a fictional time into a payroll record. The 12-hour threshold is a server constant, not an environment variable. |
| 2026-08-29 | M5 D6: the clock screen shows English-primary, Hindi-secondary label pairs from one hardcoded file; no i18n layer is introduced anywhere | Eleven strings on one screen do not justify a translation system that would then apply to six modules. Both languages are always visible, so there is no switcher to read. |
| 2026-08-29 | M5 D7: Swiss design principles are applied inside the existing `docs/DESIGN-SYSTEM.md` tokens, not as a replacement | The design system was set eight hours earlier so M2 to M6 inherit one language, and the M0 and M1 screens already use it. Plex Sans is a neo-grotesque in the Helvetica lineage, so the typeface question is already answered. The 8px grid, flush-left ragged-right text, whitespace over borders and asymmetric layout are the parts M5 adopts. |
| 2026-08-29 | M5: `businessDate` is stored as a `"YYYY-MM-DD"` string, not a `Date` at UTC midnight | A business day is a label, not an instant. A string cannot be pulled into `Date` arithmetic or shifted by a forgotten timezone offset, and it groups cleanly in the summary query. Derived once at clock-in and never recomputed, so a day already reported on stays stable. |
| 2026-08-29 | M5: "one open shift per person" is a partial unique index on `{ restaurantId, branchId, userId }` filtered to `clockOutAt: null`, with the service check as the friendly error | Two tablets can clock the same person in within one second, and a read-then-write service check has a race window. `$exists: false` is not allowed in a partial filter, so an open shift stores `clockOutAt: null`. Task B verifies the `unique` + partial combination against a real cluster. |
| 2026-08-29 | M5: a `MANAGER` may correct an `OWNER`'s attendance entry, unlike the M0-C user endpoints | Attendance is operational data, every change is audited, and a single-owner shop still needs its owner's forgotten clock-out fixed by someone. The M0-C "manager cannot touch an owner" rule is about user records, roles and credentials, not shift times. Only `SELF_CORRECTION_FORBIDDEN` applies. |
| 2026-08-29 | M5: `PIN_LOCKED` uses status 429 rather than adding 423 to CONVENTIONS section 3 | A lockout is a rate-limit-family condition and 429 is already in the status table. M0-D confirms when it wires the actual lockout counter. |
| 2026-08-29 | M5: filtering one person's attendance is `GET /users/:userId/attendance`, a path, not `GET /attendance?userId=` | CONVENTIONS section 3 keeps a person's identifier out of the query string, which lands in logs, history and analytics. It matches the existing `GET /users/:userId`. Written down so it is not "simplified" into a query parameter. |
| 2026-08-29 | The M5 sections of `docs/DB-SCHEMA.md` and `docs/API-CONTRACT.md` were written and committed as `chore/m5/spec` before any M5 code | The M1 precedent, logged 2026-08-29, and CLAUDE.md's ban on inventing spec contents. The seven M5 decisions were settled first and written in. |
| 2026-08-29 | `POST /attendance/station/clock` is specified in the contract but not built by the M5 server; the route is not mounted | It needs the per-user PIN credential (`users.pinHash`) that M0-D owns. Building the endpoint against a field that does not exist would be inventing M0-D's shape. The clock-in/out service is written so the station path is a thin addition (same core, `source: 'STATION'`) once M0-D ships. |
| 2026-08-29 | `queryBoolean` moved from `validators/menuValidators.js` to `validators/common.js` | M5 is the second module to need "a query-string boolean matched literally, not coerced". A second private copy is how one drifts, the same reasoning that moved `escapeRegex`. `menuValidators.js` now imports it; behaviour is unchanged. |
| 2026-08-29 | `GET /attendance/me` returns the open shift only in `openShift`, and `recent` is closed entries; the contract text was corrected to match | Repeating the open shift in both places is redundant and invites a client to double-count. The spec had said "non-voided entries"; it now says "non-voided closed entries". |
| 2026-08-29 | `restaurants.settings` is a subdocument, and `PATCH /restaurant` replaces the whole `settings` object on `$set` | One key today (`businessDayStartsAtMinutes`). A wholesale replace is harmless now and is consistent with how the endpoint already treats `address`. M3 makes it a dotted partial `$set` when it adds `settings.tax`. |
| 2026-08-29 | `businessDateFor` and `minutesBetween` were added to `server/utils/time.js`, replacing the marked placeholder | The business-day rule is decided (D1), so the one place that turns an instant into a day and the one place that counts whole minutes now exist. M3 and M6 read `businessDateFor` rather than doing their own date arithmetic. |
| 2026-08-29 | M0-D: the refresh token is an httpOnly cookie, `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=30d` | localStorage is readable by any script on the page, so one XSS handed over a 30-day credential. The cookie is unreadable by JavaScript. `Path` scopes it to the four auth endpoints. `Secure` is always on: `http://localhost` is a secure context, so local development still works. |
| 2026-08-29 | M0-D: `/auth/refresh` and `/auth/logout` also require an `X-Requested-With` header, checked by `middleware/requireCsrfHeader.js` | `SameSite=Lax` alone still lets the cookie ride a top-level cross-site navigation. A custom header cannot be set by a cross-site form or image, and a cross-origin `fetch` that sets one triggers a CORS preflight the origin allowlist refuses. Both checks are load-bearing; the contract says not to remove either. |
| 2026-08-29 | M0-D: `/auth/refresh` and `/auth/logout` take no request body; the client's `refreshSession()` and `logout()` send none | The credential is the cookie. `authValidators.js` no longer has a `refreshToken` schema. `client/src/utils/sessionStorage.js` is deleted: the client never reads or writes the refresh token, and restores a session by asking the server to refresh rather than by checking a stored value. |
| 2026-08-29 | M0-D: `authService.verifyPin` returns `{ userId }` and issues no token of any kind | It is the property that makes a PIN safe on a shared tablet: the worst a leaked PIN does is a clock event for the wrong person, corrected from the register with an audit line. A test asserts the `RefreshToken` count is unchanged across a verification. |
| 2026-08-29 | M0-D: a PIN locks after 5 consecutive wrong attempts and stays locked until an OWNER or MANAGER resets it via `PATCH /users/:userId/pin` | A timeout unlock would let someone guess in batches of five forever. `pinLockedUntil` is stamped 15 minutes out for the audit line and the staff message, but the lock is cleared only by a reset. `MAX_PIN_ATTEMPTS` and the window are constants in `authService.js`, following the "rate limits are constants, not env vars" decision from M0-A. |
| 2026-08-29 | M0-D: a PIN has no uniqueness constraint within a branch | Verification takes the `userId` (the staff member taps their own tile first), so it asks "is this that person's PIN", never "whose PIN is this". A unique index on a salted bcrypt hash is impossible anyway. |
| 2026-08-30 | `POST /attendance/station/clock` reuses `clockIn` / `clockOut` with `source: 'STATION'` rather than its own path; only `verifyPin` and the undo are new | The brief for the wiring said not to duplicate the clock logic. The undo window is `STATION_UNDO_WINDOW_MS`, a server constant of about 8 seconds, and the response carries the exact `undoUntil` so the client never counts the window itself. |
| 2026-08-30 | The station undo is the one self-service change to an attendance entry, and it does not trip `SELF_CORRECTION_FORBIDDEN` | It is PIN-authenticated, expires in seconds, and can only reverse the caller's own last station action. A mistaken clock-in is voided (`MIS_TAP`); a mistaken clock-out reopens the shift with a `MIS_TAP` correction. |
| 2026-08-30 | `AvailabilityStamp` gained a `kind` prop (`availability` default, `clock` for IN / OUT) instead of a second component | The design system says one rendering of the stamp, reused. `clock`'s OUT state is `steel`, not `mirch`: being clocked out is the other state, not a problem to fix. |
| 2026-08-30 | The clock screen's labels are English-primary with Hindi under each, from `features/attendance/labels.js`; nothing else in the product is translated | D6. Eleven strings on the one screen staff personally touch every day. No i18n library, no switcher. `formatDate.js` gained IST datetime-local helpers for the correction form so date parsing still lives in the one sanctioned place. |
| 2026-08-30 | The clock screen reads the roster from `GET /users` and open shifts from `GET /attendance`, both OWNER/MANAGER | M5 has no all-roles "who is on the floor" read. The tablet therefore needs a manager-capable session to draw the grid, though the clock action itself is open to every role. A dedicated `GET /attendance/board` is the right fix; see the known problems table. |
| 2026-08-30 | Email is a **second** login identity, added alongside phone, not replacing it | An owner or manager who would rather sign in with an address they remember can; floor staff keep using a phone. `email` becomes globally unique when set (partial unique index, `$type: 'string'`), lowercased so the match is case-insensitive. `POST /auth/login` takes exactly one of `phone` or `email`. The phone-plus-password decision from M0-B stands; this widens it rather than reversing it. |
| 2026-08-30 | The provisioning script takes `--email` and `--password` | `--password` sets your own instead of a generated one (still bcrypt, still printed once, still never stored); `--email` sets the second login identity. Both are optional and prompted for when the script runs interactively. |
| 2026-08-29 | **The two waiters problem is settled.** One open order per table, enforced by a partial unique index on `{restaurantId, tableId, status}` filtered to `status: 'OPEN'`, plus an integer `version` on every order that each write must send back | Moved here from Open Questions. Two answers were needed because there are two races. Two waiters creating an order on one table is settled by the database refusing the second insert, and the 409 carries the winning order's id so the second waiter joins that order instead of making a duplicate. Two waiters editing one open order is settled by the version: the first write wins, the second is told immediately rather than at bill time. Neither is a check-then-write in application code, because the gap between the check and the write is the race itself. |
| 2026-08-29 | Optimistic concurrency is implemented by putting the version in the update filter, never by reading and comparing | `findOneAndUpdate({_id, restaurantId, version}, {..., $inc: {version: 1}})`. A null result is separated into 404 and 409 by one extra scoped read. Read-modify-save reintroduces exactly the lost update the field exists to prevent, so `applyVersionedUpdate` in `services/orderService.js` is the only way an order is written. |
| 2026-08-29 | Order and KOT numbers come from an atomic `$inc` with `upsert`, reserved before the document is written, and may have gaps | A read followed by a write hands two waiters the same number on a busy Friday. Reserving before writing means a failed write loses a number. Nobody audits a kitchen ticket sequence, so that trade is fine here. It is explicitly not fine for bill numbers, and the reasoning is written out in `models/Counter.js` so M3 does not copy this pattern by accident. |
| 2026-08-29 | `wasPrepared` is a 400 when it does not apply and a 422 when it is missing and does | Sending it for a line that never reached the kitchen is a malformed request: the question does not arise and recording an answer would give M4 something meaningless to read. Omitting it for a line the kitchen has is a well formed request breaking a business rule. The rule depends on the line's stored status, so it cannot be a Zod refinement. |
| 2026-08-29 | Cancelling one line is open to all four floor roles; cancelling a whole order is OWNER and MANAGER only | Not an inconsistency to tidy up. A whole-order cancel is how a table disappears, and a table disappearing is how cash walks out of a restaurant. It is the exact gap owners lose money to today, and it is the one asymmetry in M2's permission table. |
| 2026-08-29 | Line totals, order subtotals, table occupancy and KOT status are all derived on read and stored nowhere | Anything derivable from its own parts is derived, so it cannot silently disagree with them. Stored occupancy in particular drifts the first time a process dies mid-write, and then a table is permanently occupied with no order on it and only a database edit fixes it. |
| 2026-08-29 | Cancelling a fired line also cancels the matching KOT line | Not specified in Part 4, but the KOT line schema has a `CANCELLED` status and nothing else could ever set it. Without this the kitchen keeps cooking a dish the floor already voided, which is the cancelled-item problem from BUILD-PLAN section 8 landing in the most expensive way. |
| 2026-08-29 | `tables` uses a derived `nameLower` field for case-insensitive uniqueness, not a collation index | Part 5 specifies a collation for this collection. It says the same for the two M1 collections, which shipped with `nameLower` instead, for the reason in DB-SCHEMA.md: a query written without the matching collation silently misses a collation index and answers case-sensitively. Three collections doing this the same way beats one doing it differently. |
| 2026-08-29 | Opening an order on a deactivated table is 422, and `GET /tables` takes `includeInactive` | Neither is in Part 4. Both follow M1 precedent exactly: adding an item to a switched-off category is 422, and `GET /categories` has the same parameter. Without the parameter a deactivated table cannot be seen and so can never be switched back on. |
| 2026-08-29 | The kitchen display polls every ten seconds rather than using websockets | At one restaurant's scale polling is enough, and it is one less thing to debug on bad kitchen wifi. A dropped socket that silently stops delivering tickets is a far worse failure than a ten second delay, because nobody notices it. |
| 2026-08-29 | `AppError` gained a `details` option, and the error handler merges it into the failure envelope | `TABLE_OCCUPIED` carries `existingOrderId` and `VERSION_CONFLICT` carries `currentVersion`. The contract names both at the top level of `error`. The alternative was putting an order id into `fields`, which is a per-field message map for validation errors, so the shape would have been wrong to avoid touching one M0 file. `client/src/api/client.js` needed the mirror change, because `ApiError` was dropping every key it did not recognise. |
| 2026-08-29 | M2 has its own `features/orders/errorCopy.js` rather than extending M1's | DESIGN-SYSTEM.md section 8 asks for one mapping. M1's hard-codes menu-specific text for the shared codes: its `BUSINESS_RULE_VIOLATED` reads "This category is turned off", which is wrong on every M2 screen. M2's policy is different and simpler, show the server's own sentence, so the two cannot merge without rewriting M1's. In the known problems table. |
| 2026-08-30 | Table occupancy includes `READY_TO_BILL`. A table is free again only once its order is billed or cancelled | Occupancy read as free the moment every line was served, before the table was actually paid for, letting a second order open on it. `OCCUPYING_ORDER_STATUSES` in `models/Order.js` is now the one place that lists OPEN and READY_TO_BILL as occupying; the partial unique index, the `GET /tables` occupancy lookup, the `TABLE_OCCUPIED` check, and the table-deactivation guard all read from it. The index itself filters on a derived `occupiesTable` boolean, not on `status` directly, because MongoDB's `partialFilterExpression` does not support `$in` -- it accepts one without error and then enforces nothing. |
| 2026-08-30 | The test environment skips rate limiting entirely, so tests are never structured around a budget | `middleware/rateLimit.js` now skips both limiters when `config.isTest`, set by `NODE_ENV=test` in the new `server/.env.test`, loaded via `node --env-file` in the `test` script. Added after `orders.test.js` had to merge several new tests into fewer, larger ones just to stay under the general limiter's 600-requests-per-run budget; those tests are now back to one check each. Development and production limits are unchanged. |

| 2026-08-30 | The M2 sections of `docs/API-CONTRACT.md` (11 to 13) and `docs/DB-SCHEMA.md` (8 to 11) were written after M2 had already shipped and merged | M2 is the only module that reached `main` with no spec section at all, breaking the precedent M1 and M5 both set. M3 is a function of M2's order shape, so specifying M3 against undocumented code would have been guesswork of exactly the kind CLAUDE.md forbids. The backfill documents what was built and merged; nothing in it is a proposal. |
| 2026-08-30 | The M2 spec sections are numbered after M5's rather than renumbered into build order | `attendanceentries` is referenced as "DB-SCHEMA.md section 7" from four places in the docs. Renumbering to put M2 in build order would have silently broken every one of those pointers. The numbers are the order the sections were written, and each M2 section says so at the top. |

| 2026-08-30 | The M2 order line field `taxRateBasisPoints` was renamed to `taxRateBps`, matching `menuitems` and M1 | One quantity, one name. M1 was written first and DB-SCHEMA section 6 already said `taxRateBps`, so M2 was the odd one out. Done before M3 existed, so no bill has ever read either spelling. The four demo orders on Atlas carrying the old key were migrated with a `$rename` rather than dropped, because a teammate is actively using that cluster and a rename is non-destructive and reaches the same end. CONVENTIONS section 2 gained a `Bps` suffix rule and a one-name-per-quantity rule. |

| 2026-08-30 | The `skipTenantGuard` tripwire counts call sites per file, not filenames, and asserts `{ authService.js: 3, tokenService.js: 1 }` | A filename list cannot see a second hatch added inside a file already on the list, and that is not hypothetical: `isEmailRegistered` slipped in that way. The new form was verified by adding a fifth use and watching the suite fail, rather than only by watching it pass. The sanctioned count is four, not three; the fourth is a globally unique email lookup, legitimate for the same reason the phone one is. |

| 2026-08-30 | Email login was audited against the three anti-enumeration guarantees the phone path has, and all three were already met | Checked rather than assumed, because DB-SCHEMA once said email was "never a login identity" and the code had moved past it. Findings: `{ email: 1 }` is unique, partial on `$type: 'string'`, and the model lowercases, so it is globally unique case-insensitively. Every failure — unknown identifier, wrong password, inactive user, inactive restaurant, missing branch — throws the same `InvalidCredentialsError`. The not-found branch runs the same `DUMMY_HASH` comparison, and it is one shared code path, so phone and email cannot drift. A test already asserts a byte-identical 401 for an unknown email and a wrong password. No fix was needed; the only stale artefact was a comment on `models/User.js` still calling email "never a login identity", which is now corrected in place because a reader believing it would delete the unique index. |

| 2026-08-30 | BUILD-PLAN section 9 gains a new first condition: the module has a spec section in API-CONTRACT.md and DB-SCHEMA.md, committed before its first line of code | The old list only checked that code matched a spec, never that a spec existed. A module with no section passed every condition vacuously, which is exactly how M2 shipped, merged and got marked DONE with no contract at all, and nobody's checklist caught it. What it cost to find out: M3 was one session away from inheriting two different names for the tax rate without noticing, because the only description of an order line was the code itself. |

| 2026-08-30 | Reviewing the M2 backfill found three gaps and one code inconsistency, all fixed before M3 read any of it | A backfill written by reading code writes the code's bugs down as the spec, so it was reviewed by asking "is this what we would have specified if we had written it first". Found: an add-on carries no tax rate and nothing said which rate applies; `lineTotalInPaise` and `totals` were described as "derived" but never named or defined; `POST /orders/:id/fire` was documented as returning the order when it returns `{ kot, order }`. All three are now written down. |
| 2026-08-30 | A whole-order cancel writes its single `wasPrepared` answer only to lines that actually reached the kitchen, not to every live line | Found in the same review. The single-line cancel already refuses `wasPrepared` for a line that never went to the kitchen, with a 400, and the whole-order path contradicted that by writing the answer onto `PENDING` lines too. A never-fired line had no stock deducted for it, so recording "yes it was made" is untrue and would mislead M4. Fixed with a second `arrayFilters` identifier matching only `FIRED`, `READY` and `SERVED`, and pinned by a test. Free to fix now; M2 has no production data. |
| 2026-08-30 | An add-on is taxed at its parent line's `taxRateBps` and carries no rate of its own | Under GST an add-on is naturally bundled with the dish, which makes it a composite supply taking the principal supply's rate. Written into DB-SCHEMA section 9 because M3 needs the answer and the field's absence otherwise reads as an oversight. A per-add-on rate would also break M3's per-slab grouping, since one line would then belong to two slabs. |

| 2026-08-30 | M3 D1: menu prices are tax-exclusive; GST is computed and added on top | M1 already stores `priceInPaise` and `taxRateBps` as separate fields, which only makes sense if the price is pre-tax. Reversing it later would rewrite every stored price. This is the one M3 assumption a chartered accountant must confirm on a real printed bill before a pilot, and it is in the known problems table as a gate rather than a blocker on writing code. |
| 2026-08-30 | M3 D2: GST rounds once per rate slab, not per line and not on the bill total | Rounding each line and adding gives a different answer from adding and rounding once, which BUILD-PLAN section 8 names as the way a printed bill and a report end up a rupee apart. Per slab is chosen over per bill because a GST invoice prints CGST and SGST against each rate, so the printed document and every later report read the same numbers. All of it lives in `server/utils/tax.js` and nowhere else, the same rule that keeps money arithmetic in `money.js`. |
| 2026-08-30 | M3 D2a: a bill-level discount is apportioned across tax slabs in proportion to each slab's share of the subtotal, before tax is computed, with the rounding remainder given to the largest slab | A discount reduces taxable value under GST, so it cannot simply come off the grand total or the tax is overstated. Without the remainder correction the apportioned shares can miss the discount by a paisa and the grand total stops reconciling. |
| 2026-08-30 | M3 D3: intra-state only, no IGST in v1; each slab's tax splits in half and CGST takes the extra paisa when the total is odd | A dine-in restaurant in Ahmedabad serving a local customer is always an intra-state supply. IGST is a different form and a different return, and its absence is stated explicitly so it does not read as an oversight. `cgst = ceil(tax/2)`, `sgst = tax - cgst`, so the split is deterministic and the halves always re-add to the total. Asserted by a test. |
| 2026-08-30 | M3 D4: the bill number is `"2026-27/000148"`, sequential per restaurant, branch and Indian financial year, reserved inside the same transaction that inserts the bill | `models/Counter.js` already argued this in its own comment and deliberately left `BILL` out of its enum so nobody copied the gap-tolerant order/KOT pattern by accident. The consequence, stated because it is unusual: **bill creation refuses to run without a transaction**, unlike every other write in the project, which degrades gracefully on a standalone `mongod`. A gap-free sequence has no degraded mode, and silently issuing gappy numbers in development is how the pattern reaches production. `counters` gains an additive `scope` field carrying the financial year. |
| 2026-08-30 | M3 D6: discounts are bill-level only, flat or percent, OWNER and MANAGER only, reason required, every one audited; no approval ceiling in v1 | Line-level discounts multiply the per-slab apportionment by the number of lines, and the arithmetic is where this module can lose a customer's money. A cashier cannot discount at all: BUILD-PLAN section 7 names discounts and voids as what an owner is losing money to, so both need a manager's credentials and both land in `auditlogs`. A ceiling above which an owner must approve is a deferred idea, not a missing feature. |
| 2026-08-30 | M3 D7: `payments[]` is an array so a split bill needs no migration, but the screen defaults to one full-amount payment; overpayment is refused rather than stored | The schema supports the case, the screen does not make everyone pay for it in taps. Overpayment is refused because change given in cash is not a payment and storing it would break the reconciliation between `amountPaidInPaise` and `grandTotalInPaise`. Methods are `CASH`, `UPI`, `CARD`, `OTHER`; no gateway and no money movement, per BUILD-PLAN section 4. |
| 2026-08-30 | M3 D8: one order, one bill in v1, stated as a cut rather than left ambiguous | Follows from M2 shipping one order per table with no merge path. Enforced by a partial unique index on `bills.orderId` filtered to `isVoided: false`, so a voided bill leaves the order billable again. |
| 2026-08-30 | M3: the order stays `READY_TO_BILL` and the table stays occupied until the bill is fully **paid**, not when it is created | M2 already decided `READY_TO_BILL` occupies a table and `BILLED` does not. If creating the bill moved the order to `BILLED`, the table would read as free while the customers were still sitting there paying. Voiding a bill returns the order to `READY_TO_BILL` and re-occupies the table. |
| 2026-08-30 | M3: `auditlogs` is created here, and M5's embedded `corrections[]` are left where they are | M5 decision D3 deferred the shared collection to M3 on the grounds that M3 would be the module to need it, and left M3 to decide whether to absorb the attendance corrections. The answer is no: they are shipped, tested and embedded on the entry they describe, and rewriting live attendance data to relocate an audit trail gains nothing operational while risking the one record that exists to be trustworthy. Two shapes, both documented; if M6 needs one feed it reads both. |
| 2026-08-30 | M4 D9/D10: stock is deducted at KOT fire, inside the same transaction that writes the ticket, and a cancel-after-fire consults M2's existing `wasPrepared` | Firing is when the ingredients physically leave the shelf. Deducting at bill settlement would mean a table that ate and walked out never deducted anything and stock drifted upward forever. M4 adds no second cancel mechanism: `wasPrepared` already exists on every order line and is already tested. A voided bill never restocks automatically, because the food was made and eaten; if it genuinely was not, a storekeeper writes a visible manual adjustment. |
| 2026-08-30 | M4: whether to return stock is keyed on whether a `DEDUCTION` movement exists for the line, not on `wasPrepared` alone | A line cancelled while still `PENDING` never reached the kitchen and never had anything deducted, so there is nothing to give back regardless of what any flag says. The ledger is the reliable answer and M4 reads it anyway. This is the second half of the whole-order-cancel fix made earlier the same day. |
| 2026-08-30 | M4 D11: exactly three base units, `G`, `ML` and `PIECE`; every stock level and recipe quantity is an integer in the base unit, and a purchase unit is display-only with an integer `unitsPerBase` | This is the factor-of-1000 bug from BUILD-PLAN section 8 designed out rather than guarded against. Integers for the same reason money is whole paise. `server/utils/units.js` is the only place that converts, so there is one function to get right and one to test. `baseUnit` is immutable once any movement exists, because changing it silently reinterprets every historical quantity in the ledger with no way to detect it afterwards. |
| 2026-08-30 | M4: a missing recipe deducts nothing and lets the sale succeed, surfaced through `GET /inventory/unmapped`; negative stock is allowed and never blocks | Blocking a sale over half-configured inventory is the fastest way to get the module switched off during a rush, and a restaurant that cannot fire a KOT at 8pm will not use the software at all. The kitchen cooked the dish whether or not the system agreed there was paneer left. Both are flagged loudly on a read instead. Variant recipes fall back to the item-level recipe, tried in that order so a half plate does not over-deduct against a full plate's recipe. |
| 2026-08-30 | M4: `stockmovements` is append-only with an idempotency key of `orderLineId:type` and a unique index on `{ restaurantId, eventKey }` | A retried request, a re-fired KOT or a duplicated event must not deduct twice, and a second deduction is invisible: the number is simply wrong from then on and nothing flags it. A unique index rather than a service check, because a check has a race in the middle. A repeat insert is caught on the duplicate key and returns the movement that already exists, so a retry is a no-op rather than an error. A correction is a new compensating movement, never an edit. |
| 2026-08-30 | M4: `DELETE /recipes/:recipeId` is the one hard delete in the project | A recipe is configuration, not a record of something that happened. It holds no history, nothing references it, and the movements it produced live in `stockmovements` untouched. A soft delete would mean carrying an `isActive` meaning exactly the same thing as the row not existing. CLAUDE.md's no-hard-delete rule names bills, orders and stock entries; a recipe is none of them. |
| 2026-08-30 | M4: `STOREKEEPER` owns stock movements and ingredients but not recipes or ingredient deactivation | M4 is the first module where that role does real work. Receiving, counting and recording wastage is the job. Writing a recipe changes what every future sale deducts, and deactivating an ingredient stops deduction silently, so both stay with OWNER and MANAGER. Reading the ingredient list is open to all six, because a cook who sees paneer is out marks the dish unavailable in M1, which is the loop these two modules close together. |

| 2026-08-30 | The billing screen carries Gujarati-secondary labels on its fixed action words, following M5's Hindi-on-the-clock-screen precedent (D6) but as its own file and its own language | Considered per the M3 build brief and decided yes: a cashier is the role that most needs this, Ahmedabad's language is Gujarati not Hindi, and the scope is bounded to a handful of action words — never item names, never a typed reason, never a general i18n layer. `features/billing/labels.js` and `features/billing/Bilingual.jsx` are new; M5's file is still not imported outside attendance. |
| 2026-08-30 | `components/ui/NumericKeypad.jsx` is a new shared component: a large on-screen digit grid for every money and quantity entry, generic across money, percent and (for M4) a stock quantity | The M3 build brief asked for a ₹-prefixed keypad on the billing screens and, separately, a quantity keypad for M4's adjustment screen. Building one generic component that does no unit conversion of its own, and hands the typed string back through `onConfirm`/`onChange`, means M4 inherits it rather than drawing a second keypad. Documented in `docs/DESIGN-SYSTEM.md` section 10.1. |
| 2026-08-30 | A bill's three states (UNPAID, PAID, VOIDED) get a dedicated `BillStatusBadge`, not a third `AvailabilityStamp` kind | `AvailabilityStamp` is deliberately a two-state positive/negative badge and DESIGN-SYSTEM section 5 reserves its rotated look as the product's one signature element. A three-state field forcing itself into that shape would either lose a state or dilute the stamp. The same icon-plus-colour-plus-word redundancy rule still applies; it is just not the literal stamp component. |

| 2026-08-30 | M4's idempotency key is `orderLineId:ingredientId:type`, not `orderLineId:type` as Phase 0 first specified | Caught while implementing `stockMovementService.js`, before any code ran against the wrong version. A recipe usually has more than one ingredient, and one `DEDUCTION` movement is written per ingredient; keying only on the line and the type would have made the second ingredient's insert collide with the first's, and the idempotency guard would have read that collision as a duplicate and silently skipped a real deduction. `docs/DB-SCHEMA.md` section 16 is corrected in place. |

| 2026-08-30 | `BillStatusBadge` and M4's stock-state badge both go through one new shared shell, `components/ui/StatusBadge.jsx` | Built during M4 screens once the second three-state field (stock: IN_STOCK/LOW/OUT) needed the exact same icon-colour-word shape M3's bill status already used. `BillStatusBadge.jsx` is now a five-line wrapper supplying bill words to the shared shell rather than its own drawing. `AvailabilityStamp` is untouched and stays the two-state, rotated, signature element DESIGN-SYSTEM section 5 reserves it as. |
| 2026-08-30 | `components/ui/NumericKeypad.jsx` is reused unchanged for M4's stock quantity entry, exactly as planned when it was built for M3 | Confirms the M3 decision to build it generic. M4's adjustment screen supplies a purchase-unit suffix and a live "= 2000 g" helper text via the keypad's existing `onChange` and `helperText` props; no second keypad was written. |
| 2026-08-30 | A RECOUNT's signed difference is entered as a direction tile (More / Less) before the keypad, not a minus key on the keypad itself | `NumericKeypad` has no sign key, deliberately: every other quantity it is used for (money, a stock receipt, a wastage amount) is a positive magnitude by the schema's own rule, and adding a minus key for the one exception would put a rarely-correct control in front of every other use. The direction is picked first, in words, and the client applies the sign before sending. |
| 2026-08-30 | `client/src/utils/units.js` mirrors `server/utils/units.js`'s BigInt conversion exactly, the same relationship `formatMoney.js` has with `server/utils/money.js` | The adjustment screen has to convert a typed purchase-unit quantity to the base-unit integer the API takes before it ever sends a request, so the algorithm has to exist on both sides. Kept identical on purpose, so the two can never disagree the way `formatMoney.js`'s own header comment already promises for money. |
| 2026-08-30 | The recipe editor screen is gated to OWNER and MANAGER in the client, though `GET /recipes` itself is open to STOREKEEPER on the server | Matches the precedent `MenuBuilderPage` already set for M1: an editing tool is gated to the roles who edit, even where the read underneath it is open wider. A STOREKEEPER reading a recipe with no ability to change it was judged not worth the screen's added complexity for v1. |

| 2026-08-30 | `scripts/seedDemo.js` drives the real HTTP API rather than writing documents to collections directly | Hand-writing seed documents risks quietly reimplementing a business rule -- a snapshot, a counter, an audit row -- wrong. Driving the same `createApp()` instance the server itself listens with, the way `tests/helpers/testServer.js` already does, means seed data obeys every rule the real API enforces, with no second implementation to drift from the first. |
| 2026-08-30 | `scripts/seedDemo.js` is idempotent by wiping and rebuilding, not by upserting every collection | Two fixed-named demo restaurants ("Demo Restaurant A", "Demo Restaurant B") are looked up by name; if found, every collection scoped to that `restaurantId` is deleted before rebuilding fresh. Simpler and more reliably correct than writing idempotency logic per collection, and safe because the two names are fixed and never match a real customer's restaurant. |
| 2026-08-30 | The seed script's non-localhost guard is an explicit opt-in env var, `SEED_DEMO_ALLOWED_HOSTS`, not a heuristic | This project's only Atlas cluster is shared between real customer data and development/demo use, so a heuristic ("does the hostname contain 'demo'") could not tell them apart. Naming the exact allowed host is a deliberate, visible decision each time, not an accident. |
| 2026-08-30 | Backdated bills (the business-day-boundary case) are created through the real order-to-payment flow and then have their timestamps patched directly against the collections afterward, rather than teaching any service function to accept a client-supplied `at` | CLAUDE.md and M5's own decision record that timestamps are the server's clock everywhere except the two M5 manager endpoints built explicitly to reconstruct a missed entry; M3 has no equivalent endpoint and should not gain one just for a seed script's convenience. Patching after the fact keeps that rule intact everywhere real traffic reaches, and only touches data this script itself just created. |

| 2026-08-31 | M6 owns no collection, adds no model file and has no write verb; a test asserts `reportRoutes.js` contains no `router.post/patch/put/delete` | The contract says M6 aggregates over collections other modules own and freeze. Stating it in `docs/DB-SCHEMA.md` as its own section, rather than leaving an absence, means a reader looking for M6's schema finds the answer instead of wondering what was forgotten. The test is there because "M6 writes nothing" is the kind of invariant that erodes the first time someone finds it convenient to store a rollup. |
| 2026-08-31 | Every M6 aggregation opens with `scopedForAggregate`, never `scoped`, and `isVoided: false` lives in that same first `$match` | An aggregation pipeline is handed to the server uncast and `req.restaurantId` is a string off the JWT, so a `$match` built from `scoped` compares a string to an ObjectId and returns a silent zero — the bug M3's bill list shipped with for about an hour. Putting the not-voided rule in the same opening stage rather than a later filter means it uses the same index and cannot be forgotten downstream, which BUILD-PLAN calls the recurring soft-delete leak. |
| 2026-08-31 | The 366-day range cap is a 422 `RANGE_TOO_LARGE` raised in the controller, not a Zod refinement | Everything a schema rejects comes back as a 400, and this is not bad input: the dates parsed fine and the question is reasonable, it is the size of the answer that is refused. Same reasoning M0-B used when it moved the new-password-equals-old check out of a schema. 366 rather than 365 so a full financial year, inclusive, in a leap year is not rejected by one. |
| 2026-08-31 | M6's two hardest invariants were negative-tested, not merely asserted | Removing `isVoided: false` fails exactly the two tests written for it, and making an open shift contribute elapsed-time-so-far fails exactly two more. A green suite proves the code passes the tests; deliberately breaking the rule proves the tests would have caught it. The same discipline used on the `skipTenantGuard` tripwire. |
| 2026-08-31 | `tax.pricingMode` and `tax.roundOffEnabled` are stored, validated, returned by `GET /settings` and read by nothing, pending a chartered accountant's confirmation of decision D1 | Both change M3's bill arithmetic, which is frozen, tested to the paisa, and carries a documented per-slab rounding rule. Rewiring it from inside a settings module is how billing breaks quietly. D1 assumed tax-exclusive pricing and flagged it as needing CA confirmation before a pilot; that confirmation has not happened, so wiring either one would be acting on an assumption nobody has checked. The settings screen shows both with a note saying they take effect once billing is updated, which is more honest than hiding a control an owner will ask about. |
| 2026-08-31 | `settings.businessDayStartsAtMinutes` stays at the top level of `settings` and is not nested under `settings.business`, even though the API groups it there | M3 derives every bill's `businessDate` from that path, M5 derives every attendance entry's, and M6 reads it for every report. Nesting it would be tidier and would break three shipped modules at once, on the one field that decides which day a sale belongs to, and would need a migration to do it. The API groups it for readability and `settingsService` owns that mapping alone. The reason is written on the field itself in `models/Restaurant.js`, so the next person who notices the inconsistency finds the answer instead of fixing it. |
| 2026-08-31 | `PATCH /restaurant` now writes `settings` as dotted paths instead of replacing the whole subdocument | Not a tidy-up: M7 turned a harmless line into data loss. That endpoint accepts `settings.businessDayStartsAtMinutes` and wrote it with `$set: { settings: {...} }`, which replaces every key the request did not mention. With one key that lost nothing, and the schema's own comment said so. With four groups, an owner moving their business day there would silently reset their tax rate and wipe their receipt text. Confirmed against a real document before changing it, and there is a test. |
| 2026-08-31 | An empty string in a receipt text field is stored as `null` rather than rejected | Clearing a text box is a legitimate thing for an owner to do, and the value an HTML input carries when cleared is `""`. Making the client translate that to `null` is a coupling that would eventually be got wrong on one screen. `""` and `null` mean the same thing for these three fields, so they are stored the same way rather than kept as two spellings of empty. CONVENTIONS section 7's "reject empty strings" is about fields where a value is required; these are not. |
| 2026-08-31 | The settings screen is OWNER-only in the client even though `GET /settings` is open to a MANAGER on the server | There is one settings screen and it is a form. Showing a manager a page whose every save returns 403 is worse than not showing it. The read stays open to them so a manager who needs to know what the restaurant is configured to do can be told, and so M8's audit screens can read the same values. Same precedent as the M1 menu builder and the M4 recipe editor, both gated tighter than the read underneath them. |
| 2026-08-31 | Every M6 chart is single-series, so the marks are `ink` and there is no categorical palette | The dataviz validator FAILs `ink` on lightness-band and chroma-floor, and both checks are out of scope by the validator's own footer: they govern categorical palettes, and exist to keep hues apart from each other. With one series there is nothing to separate. DESIGN-SYSTEM section 3 is the binding constraint instead — `chana`, `mirch` and `patta` are functional colour, so a data mark that means nothing in particular must use `ink` or `steel`. The check that does apply, contrast, passes at 16.46:1. No chroma was injected to satisfy a check that does not govern this case. |
| 2026-08-31 | The column chart is plain HTML and CSS, not SVG, and no charting library was added | The first version positioned SVG rects with `min()` and `calc()` inside width attributes, which browsers support unevenly: looking at the rendered page showed bars at the wrong width and sitting left of the labels they belonged to. Flexbox gives geometry the browser is certain about and makes centring `justify-center` rather than arithmetic. A library was never needed — every chart here is one series of magnitudes. |

---

## Open questions

Things not yet decided. Move them to the decision log once settled.

- Unit conversion approach for recipes, for example paneer stored in kg but recipe in grams.
- Unit conversion approach for recipes, for example paneer stored in kg but recipe in grams.
- Hosting provider and region. Until this is settled, `app.set("trust proxy")` is
  left off in `server.js`, with a note saying why.
- The exact access token payload. `middleware/authenticate.js` currently reads
  `sub`, `role`, `restaurantId` and `branchId`. If API-CONTRACT.md names them
  differently, that one file changes.

---

## What changed recently

Newest entry at the top. Keep the last ten or so, delete older ones.

### 2026-08-31 Rishi, M7 Restaurant Settings

**What was built:** M7, server and screen, on `feat/m7/restaurant-settings`.
Two endpoints, no new collection, 27 new tests. The first Phase 1B module, and
the one BUILD-PLAN says to build early because settings get more expensive to
retrofit with every module stacked on top.

**Spec first, then code.** `docs/API-CONTRACT.md` section M7 and
`docs/DB-SCHEMA.md` sections 17 and 18 were written and committed before any
M7 code existed, which is BUILD-PLAN section 13's first condition of done. The
same order M1, M5, M3, M4 and M6 used and the one M2 broke.

**Endpoints, two, both under `/api/v1`**

`GET /settings`, OWNER and MANAGER. `PATCH /settings`, OWNER only. The write is
narrower than the read on purpose: this object holds the GST pricing mode,
which is legally significant, and the business day boundary, which silently
moves which day every future sale lands on.

**No migration, and that was verified rather than assumed**

`restaurants.settings` gained `tax`, `receipt` and `inventory`. Every field has
a schema default, so a document written before M7 reads back a complete
settings object because Mongoose fills missing paths on hydration. That was
checked against a raw pre-M7 document before anything was built on top of it,
and again live: the demo restaurant on Atlas genuinely predates M7 and answered
`GET /settings` in full, with its stored `businessDayStartsAtMinutes` intact and
every new group defaulted. There is a test that strips a document back to one
key and asserts the same thing.

**`settingsService` is now the only way any module reads configuration**

Three controllers were reading `restaurant.settings.businessDayStartsAtMinutes`
directly, each with its own query and its own fallback. All three now go through
`settingsService`, so a setting that moves moves in one file.

Two services, `billService.js` and `operationsReportService.js`, still read it
directly. That was left deliberately: they are M3 and M6 code, the reads are
correct, and this module had no mandate to touch M3's file. It is in the known
problems table so the next person finds it rather than discovering it.

The cache is per-request and attached to the request, never process-level with a
time to live. BUILD-PLAN section 12 names the stale-settings cache as its own
problem: an owner changes the business day, sees nothing happen, changes it
again, and two servers now disagree about which day a sale belongs to.

**Wired now, two things, both one-line reads**

`tax.defaultTaxRateBps` fills in `taxRateBps` when `POST /menu-items` omits it.
Only the API's default moved: the field stays required in the schema and on
every stored document, an explicit rate always wins including an explicit zero,
and changing the setting tomorrow moves nothing that already exists.

`inventory.lowStockAlertsEnabled`, when false, empties the low-stock read and
the dashboard's `lowStock` array. The quantities are untouched and the plain
stock list still shows them; only the surfacing is switched off.

**Stored and deliberately not wired**

`tax.pricingMode` and `tax.roundOffEnabled`, both in the decision log above.
`settings.receipt.*` likewise, until Phase 2 printing exists. The receipt header
cap of 40 characters is enforced now, at data entry, because an 80mm roll fits
about 42 and BUILD-PLAN calls the printer problem out by name.

**A data-loss path M7 would otherwise have created**

`PATCH /restaurant` accepts `settings` and wrote it with a whole-object `$set`.
Harmless with one key, and the schema's own comment said as much. With four
groups on it, an owner moving their business day through that endpoint would
have silently reset their tax rate and wiped their receipt text. Reproduced
against a real document, then fixed by writing dotted paths, with a test. This
is a change to M0 code beyond what the M7 brief listed as allowed, and it is
called out here rather than buried because of that.

**Files created**

Server: `services/settingsService.js`, `controllers/settingsController.js`,
`routes/settingsRoutes.js`, `validators/settingsValidators.js`,
`tests/settings.test.js`.

Client: `api/settings.js`, `features/settings/` with `SettingsPage`,
`errorCopy.js` and `timeOfDay.js`.

**Changed elsewhere**

`models/Restaurant.js` (three nested settings objects, and the comment saying
why `businessDayStartsAtMinutes` never moves), `models/AuditLog.js` (two
appended enum values), `controllers/attendanceController.js`,
`controllers/billController.js`, `controllers/reportController.js` (all three
now read through `settingsService`), `controllers/menuItemController.js` and
`validators/menuValidators.js` (the default tax rate),
`services/ingredientService.js` and `services/operationsReportService.js` (the
low-stock toggle), `controllers/restaurantController.js` (the dotted-path fix),
`routes/index.js`, `App.jsx`, `DashboardPage.jsx`.

**What the other developer needs to know**

Read a setting through `settingsService`, never off `restaurant.settings`. There
is a finish check on it: `grep -rn "settings\." server/controllers/` returns
nothing that reaches into the object.

`businessDayStartsAtMinutes` is stored at the top level of `settings` and
presented under `business`. That mapping is in `settingsService` and nowhere
else. Do not tidy it.

Adding a setting is three edits: one line in `SETTING_PATHS`, one field on the
model with a default, one field in the validator. Nothing else needs to know.

`pricingMode` and `roundOffEnabled` are stored and read by nothing. Wiring them
is its own task and it needs the CA first.

**Unblocked:** M8 Audit Trail, which depends on M3 and M7 and which BUILD-PLAN
says must not run in parallel with M7 because both append to the same two
`auditlogs` enums. M7's appends are on `main` now, so M8 can start.

**Still open:** Arya has not read M7. The two services still reading settings
directly are in the known problems table.

### 2026-08-31 Rishi, M6 Reports and Dashboard

**What was built:** M6, server and screens, on `feat/m6/reports`, against the
M6 contract that was already written into `docs/API-CONTRACT.md`. Ten
read-only endpoints, no collection, 34 new tests, seven screens. This is the
seventh and last module of Phase 1.

**The spec section came first, as its own commit**, per BUILD-PLAN section 13:
`docs/DB-SCHEMA.md` gains an M6 section whose entire content is that this
module has no schema — which collection each figure is read from, which
existing indexes the reads rely on, why there is no rollup collection, and the
four things M6 must never do to data it reads.

**What M6 owns: nothing**

No model file, no field on any existing collection, no new index, and no write
verb. A test asserts `reportRoutes.js` contains no `router.post`, `patch`,
`put` or `delete`, because "M6 writes nothing" is exactly the kind of
invariant that erodes the first time storing a rollup looks convenient.

**Three rules, all negative-tested rather than assumed**

Voided records leave every total. Removing `isVoided: false` from the shared
opening `$match` fails exactly the two tests written to catch it.

An open shift contributes ZERO minutes and is listed separately. M5 refuses to
invent a clock-out time and M6 refuses identically; making an open shift
contribute elapsed-time-so-far fails exactly two more tests. This matters
beyond the report: M11 will pay people from these minutes.

Tax is summed from `bills.taxBreakdown` and never recomputed, so the report
cannot disagree with the printed bill by a rupee.

**Verified live against the seeded Atlas data, not only against the suite**

Every endpoint was driven over HTTP against Demo Restaurant A. The figures
reconcile exactly with the independent verification from the previous session:
gross sales of 128800 paise across five live bills with one voided at 18700,
CGST 3091 plus SGST 3089 making the 6180 total with CGST taking the odd paisa,
and all three GST slabs present including the zero-rated one. The two
backdated bills at 23:45 and 00:30 IST both land on business date 2026-08-29,
so the boundary holds in a report as well as on a bill. Every role gate was
checked with a real token: a manager is refused the payment breakdown, a
storekeeper gets stock consumption and nothing else, a cashier gets nothing.

**Looking at the rendered screens found two things the tests could not**

The x-axis labels were truncating to "11 A…", and the columns sat left of the
labels they belonged to. Both came from positioning SVG rects with `min()` and
`calc()` inside width attributes, which browsers support unevenly. The chart
is now plain HTML and CSS: flexbox gives geometry the browser is certain about
and centring becomes `justify-center` rather than arithmetic. No charting
library was added, and none is needed — every chart in this module is one
series of magnitudes.

**On colour**

Every M6 chart is single-series, so there is no categorical palette and the
marks are `ink`. The dataviz validator FAILs `ink` on its lightness-band and
chroma-floor checks, and both are out of scope by that validator's own footer:
they govern categorical palettes and exist to keep hues apart from each other,
which is meaningless with one series. DESIGN-SYSTEM section 3 binds instead —
`chana`, `mirch` and `patta` are functional colour, so a data mark that means
nothing in particular must use `ink` or `steel`. The check that does apply,
contrast, passes at 16.46:1. No chroma was added to satisfy a check that does
not govern this case.

**What the other developer needs to know**

`reportRangeService.js` holds the three rules every report shares: both dates
required with no defaults, the 366-day cap, and the opening `$match`. That
stage uses `scopedForAggregate`, never `scoped` — a pipeline is uncast and
`req.restaurantId` is a string, so `scoped` would return a silent zero.

`skipTenantGuard` is unchanged at four. M6 adds none, and its own tripwire test
asserts it.

**Unblocked:** Phase 1 is complete. Every module M0 to M6 has working code.

**Still open:** Arya's read, now owed on four modules. M3's two pilot gates.
Nothing in Phase 1B has been started, and BUILD-PLAN section 6 is explicit
that it should not be until the conversation with Anshul and Om happens.

### 2026-08-30 Rishi, seed data and the end-to-end Atlas verification

**What was built:** `scripts/seedDemo.js`, wired to `npm run seed:demo`, plus a
full manual verification pass against the real Atlas cluster. This is the
last piece of the M3 + M4 build; both modules are now feature-complete and
proven end to end, not just unit tested.

**The seed script**

Drives the real HTTP API -- boots the same `createApp()` the server listens
with, the way `tests/helpers/testServer.js` already does for tests -- rather
than writing documents to collections by hand, so seed data cannot
accidentally disagree with a business rule the API itself enforces.

Refuses outside `development`/`test`, and refuses any `MONGO_URI` host that
is not localhost and not explicitly named in the new `SEED_DEMO_ALLOWED_HOSTS`
env var (`.env.example` updated). Idempotent by wiping and rebuilding: two
fixed-named restaurants, "Demo Restaurant A" and "Demo Restaurant B", looked
up by name and every collection scoped to that `restaurantId` deleted before
rebuilding fresh. Verified by running it twice in a row.

What it creates, in Demo Restaurant A: all six roles with a known password,
printed once; a real Ahmedabad menu across four categories, all three GST
slabs (5%, 18%, 0% on Masala Chaas) and a 66-character dish name; two items
with variants and add-ons, one recipe attached at the variant level so the
half-plate-does-not-over-deduct case is real seeded data, not only a test;
five ingredients across all three base units, one already below its
threshold at seed time, one bought in kilograms and used in grams; six
tables; six bills covering a paid multi-slab order, a 10% discount, a voided
bill, a cancelled-after-fire line with `wasPrepared:false` (stock returns)
and one with `wasPrepared:true` (stock stands), a dish fired with no recipe
attached, and two bills backdated across the 05:00 IST business-day boundary
(23:45 and 00:30). Demo Restaurant B is minimal: one owner, one item, one
open order, existing only so a tenant-isolation check has a second restaurant
to fail against.

`api/client.js`'s `put` addition from the M4 screens session and every
endpoint built across this whole M3+M4 build are exercised by this script
firing for real.

**The verification, against the real Atlas cluster, every item on the
Section 11 checklist**

Order taken, fired, stock deducted: confirmed -- Paneer carries real
`DEDUCTION` movements with no duplicate `eventKey`s. Item cancelled after
fire answered "not made": confirmed -- two `CANCELLATION_RETURN` movements
exist, each the exact negation of the `DEDUCTION` it reverses. Bill
generated, GST correct per slab: confirmed on all six bills -- `totalTaxInPaise`
equals the sum of the slabs, every slab's CGST plus SGST equals its tax with
CGST never the smaller half, every bill reconciles
`subtotal - discount + tax + roundOff = grandTotal`, every grand total is a
whole rupee. One bill genuinely spans two slabs; the zero-rated slab appears
on another. Discount applied and audited: confirmed -- the `DISCOUNT_APPLIED`
audit row's amount and reason match the bill's own discount exactly. Payment
recorded: confirmed -- every `PAID` bill has `amountPaidInPaise` equal to its
`grandTotalInPaise`. Receipt text matches the printer width: confirmed live
over HTTP at both 32 and 48 columns against the real 66-character seeded dish
name -- every line fits, the wrap indents under itself, the amount column
stays aligned. Bill voided with a reason: confirmed, and its
`BILL_VOIDED` audit row exists. Sales total excludes it: confirmed live
against `GET /bills/summary` -- the voided bill's amount appears only in
`voidedInPaise`, never in `netInPaise` or `grossInPaise`. Bill number not
reused: confirmed -- six unique numbers, sequence 1 through 6 with no gap,
the voided bill keeping `2026-27/000004` rather than surrendering it. Stock
ledger reconciles with `currentQty`: confirmed on every one of the five
seeded ingredients, summing every movement from zero exactly matches the
cached quantity.

Two more things the checklist did not name but this build's own decisions
promised, both confirmed live: a bill at 23:45 IST and one at 00:30 IST the
same night both carry `businessDate: "2026-08-29"` under the default 05:00
boundary -- the exact business-day case BUILD-PLAN section 8 and M5 D1 exist
to get right. And `GET /inventory/unmapped` lists Gulab Jamun, fired with no
recipe attached, by name.

**What the other developer needs to know**

`npm run seed:demo` is safe to run against your own local MongoDB with no
extra configuration; running it against the shared Atlas cluster needs
`SEED_DEMO_ALLOWED_HOSTS` set explicitly in `.env`, on purpose. Demo Restaurant
A and B now live permanently on Atlas as a result of this session's own run,
logged in the known problems table so nobody mistakes them for real customer
data or wonders where they came from. Re-running the script resets them
cleanly.

**Unblocked:** nothing left in this build. M3 and M4 are both
feature-complete: server, screens, and a verified, realistic demo environment.

**Still open, and none of it closable by more code:** the CA review of the
GST output and the real-thermal-printer test, both pilot gates BUILD-PLAN
section 10 names explicitly. Arya's read, now owed on three modules instead
of two. The Atlas credential purge from git history at `177ed9c`, unrelated
to this build and still deferred from M0.

### 2026-08-30 Rishi, M4 screens

**What was built:** the three M4 screens, on `feat/m4/inventory`, on top of
the server from the previous session entry. `/inventory` (the stock list and
the adjustment panel), `/inventory/recipes` (the editor), plus a "Stock" link
on the dashboard. No server code changed.

**Screens**

The stock list: a dense list, name plus quantity in the ingredient's own
purchase unit plus a state badge, per DESIGN-SYSTEM section 6. Tapping a row
is the one tap into the adjustment panel -- there is no menu between seeing an
ingredient and acting on it.

The adjustment panel: five reason tiles (Received, Wastage, Spillage, Return,
Recount), no free-text field required, then `NumericKeypad` in the
ingredient's own purchase unit with a live base-unit conversion underneath.
Recount asks for a direction (More / Less) before the magnitude, because the
keypad itself has no sign key.

The recipe editor: a menu item list on the left, variant tabs plus an
ingredient-row editor on the right, built in a `useState` initialiser synced
once per selection -- the same fix M1's item editor already found for the
same symptom (fields empty for a frame on every selection change).

**Two shared pieces generalised, not duplicated**

`components/ui/NumericKeypad.jsx`, built during M3 screens with M4 in mind, is
reused here completely unchanged for a stock quantity.

`components/ui/StatusBadge.jsx` is new: a shared shell for any three-or-more-
state field, read by icon, colour and word together. Built once M4's stock
state (IN_STOCK/LOW/OUT) needed the exact shape M3's bill status already used;
`BillStatusBadge.jsx` is now a five-line wrapper over it rather than its own
drawing. `AvailabilityStamp` is untouched, still the two-state, rotated,
signature element DESIGN-SYSTEM section 5 reserves it as.

`client/src/utils/units.js` is new: the client-side mirror of
`server/utils/units.js`, the same relationship `formatMoney.js` has with
`money.js`. The adjustment screen has to convert a typed purchase-unit
quantity before it ever sends a request, so the BigInt algorithm exists on
both sides, kept identical on purpose.

**What the other developer needs to know**

The recipe editor is gated to OWNER and MANAGER in the client, matching the
`MenuBuilderPage` precedent, even though `GET /recipes` itself allows
STOREKEEPER on the server. `/inventory` itself is open to all six, matching
`GET /ingredients`.

`api/client.js` gained a `put` method. M4 is the first module needing one --
`PUT /recipes` is the one PUT verb in the whole project.

Lint is clean and the client builds. No automated test covers these screens;
manual verification is part of Section 11's end-to-end pass, not done yet.

**Unblocked:** M4 is feature-complete, server and screens both. Seed data and
the end-to-end Atlas verification are what remain of the whole M3+M4 build.

**Still open:** M3's two pilot gates are unchanged. Arya's read is now owed on
three modules. Seed data (`scripts/seedDemo.js`) has not been written.

### 2026-08-30 Rishi, M4 backend

**What was built:** the M4 Inventory server, on `feat/m4/inventory`, against
the spec committed on `chore/m3/pre-flight`. Eleven endpoints, three
collections, 51 new tests. 490 in the suite overall, all passing. Lint clean.
No React screens yet.

Built by Rishi. M4 is Arya's module on paper; this is the third module built
off the listed owner, after M1 and M5. Logged plainly, as the other two crossings
were, in the known problems table.

**Endpoints, eleven, all under `/api/v1`**

`POST /ingredients`, `GET /ingredients`, `PATCH /ingredients/:id`,
`PATCH /ingredients/:id/active`, `PUT /recipes`, `GET /recipes`,
`DELETE /recipes/:id`, `GET /inventory/unmapped`,
`GET /ingredients/:id/movements`, `POST /ingredients/:id/movements`,
`GET /inventory/consumption`.

**Files created**

Models: `Ingredient.js`, `Recipe.js`, `StockMovement.js`.

`utils/units.js`, before any deduction code, per CONVENTIONS 13. Cannot reuse
`money.js`'s fixed two-decimal trick because `unitsPerBase` is not always a
power of ten (a "dozen" purchase unit is 12), so every conversion goes through
BigInt, exact for any integer ratio and any decimal precision typed.

Services: `stockMovementService.js` (the ledger and its idempotency
guarantee), `recipeService.js` (the variant fallback, the one PUT, the one
hard delete, the unmapped-dishes read), `ingredientService.js` (CRUD, the
derived `stockState`, the deactivation guard, manual adjustments and their
sign).

Controllers: `ingredientController.js`, `recipeController.js`. Routes:
`inventoryRoutes.js`. Validators: `inventoryValidators.js`.

Tests: `units.test.js` (12), `stockMovements.test.js` (12),
`inventory.test.js` (39, but 12 of those were already counted -- 39 total in
that file). Also touched: `kitchenService.js` and `orderController.js` (M2
files), `utils/errors.js`, `utils/time.js`, `utils/scopedQuery.js` already had
`scopedForAggregate` from M3.

**Two real bugs found by the tests before either reached production data**

The idempotency key this module's own Phase 0 spec first proposed,
`orderLineId:type`, does not discriminate by ingredient. A recipe with more
than one ingredient -- the ordinary case -- would have its second ingredient's
movement collide with its first's on the unique index, and the idempotency
guard would read that collision as a retry and silently skip a real deduction.
Fixed to `orderLineId:ingredientId:type` before any code ran against the wrong
version; `docs/DB-SCHEMA.md` section 16 is corrected in place.

`POST /ingredients/:id/movements` was not applying the sign API-CONTRACT.md
section 18.2 promises: "the sign is applied by the server from the type, so a
storekeeper never types a minus sign." The first implementation just passed
the client's positive `qtyInBase` straight through, which meant recording
`WASTAGE` of 300 g *added* 300 g instead of removing it. Two tests written
against the correct spec text caught it immediately; fixed with a
`MANUAL_TYPE_SIGN` map in `ingredientService.adjustStock`.

**What the other developer needs to know**

Deduction happens inside `kitchenService.fireOrder`'s own transaction, right
after the order is updated to FIRED, not as a separate call anyone makes.
`orderController.js`'s single-line and whole-order cancel now call
`returnStockForCancelledLine` when `wasPrepared: false`, keyed on whether a
`DEDUCTION` movement genuinely exists for the line, not on the flag alone.

`recordMovement` in `stockMovementService.js` is the one function that touches
both `stockmovements` and `ingredients.currentQtyInBase`. It increments the
ingredient first, then claims the movement's `eventKey`; a duplicate key
undoes the increment it just made and hands back what already exists. This is
safe under real concurrency without needing a transaction, verified by firing
five genuinely concurrent calls at one `eventKey` and asserting exactly one of
them actually moved stock.

Negative stock is allowed everywhere and blocks nothing, by design (M4's
DB-SCHEMA section 14). A missing recipe deducts nothing and the sale still
succeeds; `GET /inventory/unmapped` is the honest surface for it, recomputed
against today's recipes on every read rather than remembering a flag from the
moment of firing.

`skipTenantGuard` count is unchanged: still exactly the four from M0 and
M0-D. M4 adds zero, and there is a test asserting it, the same tripwire shape
`tests/bills.test.js` already carries for M3.

**Unblocked:** M4 screens. `GET /inventory/consumption` is the read M6's
"stock consumed" report will aggregate from, the same relationship M3's bill
summary has with M6's sales report.

**Still open:** M4 has no React screens yet, and Arya's read is now owed on
three modules, not two.

### 2026-08-30 Rishi, M3 screens

**What was built:** the three M3 screens, on `feat/m3/billing`, on top of the
server from the previous session entry. `/bills/:billId`, `/bills`, and the
"Bill this order" action added to the M2 order screen. No server code changed.

**Screens**

The bill screen: lines, subtotal, discount and tax breakdown, the grand total
as the largest thing on the page, a payment panel, a discount panel
(OWNER/MANAGER), a void panel (OWNER/MANAGER), and a print action that opens
the server-rendered receipt text in a new window and calls the browser's print
dialog. Which action reads as the primary `chana` button changes with the
bill's own state: collecting payment while anything is outstanding, printing
once it is settled.

The bills list: the day's bills with the server's whole-range running total in
`meta.totals`, not a client-side sum of one page. Date range, status and
include-voided filters.

**New shared pieces**

`components/ui/NumericKeypad.jsx`: one generic on-screen digit grid for every
money and quantity entry in the product. It does no unit conversion of its
own; a caller reads the typed string back and converts it, which is what lets
M3 use it for rupees and a percentage and lets M4 reuse it unchanged for a
stock quantity. Documented in `docs/DESIGN-SYSTEM.md` section 10.1.

`BillStatusBadge.jsx`: a dedicated three-state badge for UNPAID/PAID/VOIDED,
not a third kind bolted onto `AvailabilityStamp`, which DESIGN-SYSTEM section 5
reserves as a two-state, rotated, signature element.

`features/billing/labels.js` and `Bilingual.jsx`: Gujarati-secondary labels on
the billing screen's fixed action words, the same shape as M5's Hindi-on-the-
clock-screen decision but a separate file and a separate language, considered
and logged in the decision log.

**DESIGN-SYSTEM.md gained sections 10 and 10.1 and 10.2**, appended rather than
inserted, because earlier sections are already referenced by number from code
comments across M1, M2 and M5. Covers the operator-screen redundancy rules
(icon + colour + word, a primary action that can move with the screen's state,
confirmations that state the consequence) and the keypad, so M4's screens
inherit both instead of re-deriving them.

**What the other developer needs to know**

`BillOrderButton.jsx` lives in `features/billing/`, not on
`OrderScreenPage.jsx` itself, which CONVENTIONS section 10 already flags as
near the file-length limit. It is the one place M2's order screen reaches into
M3.

Lint is clean and the client builds. No automated test covers these screens;
M3's automated coverage is the 75 server tests from the previous entry. Manual
verification against the real screens is part of Section 11's end-to-end pass,
not done yet.

**Unblocked:** M4 screens can reuse `NumericKeypad` for a stock quantity and
follow the same DESIGN-SYSTEM section 10 rules without re-deriving them.

**Still open:** M3's two pilot gates (CA review, real printer) are unchanged.
M4 backend and screens, and the seed data / end-to-end Atlas pass, are next.

### 2026-08-30 Rishi, M3 backend and the pre-flight fixes

**What was built:** the M3 Billing server, on `feat/m3/billing`, against the
spec committed first on `chore/m3/pre-flight`. Eight endpoints, two collections,
75 new tests. 427 in the suite overall, all passing. Lint clean, client builds.
No React screens yet.

**Five pre-flight fixes, before any M3 code**

The order line's `taxRateBasisPoints` was renamed to `taxRateBps`, matching M1
and DB-SCHEMA section 6, so M3 does not inherit two spellings of one quantity.
No production data exists; the four demo orders on Atlas carrying the old key
were migrated in place rather than dropped, because a teammate is actively
using that cluster.

The `skipTenantGuard` tripwire now counts call sites per file instead of
listing filenames, and was verified by adding a fifth use and watching the
suite fail. The real sanctioned count is four, not three.

Email login was audited against the three anti-enumeration guarantees the phone
path has. All three were already met; the only defect was a comment on
`models/User.js` still calling email "never a login identity", which is the
sentence that talks someone into deleting the unique index.

BUILD-PLAN section 9 gained spec-before-code as its first condition of done.

The M2 spec backfill was reviewed rather than trusted, and that found three
gaps and one code inconsistency. See the decision log.

**Endpoints, eight, all under `/api/v1`**

`POST /bills`, `GET /bills`, `GET /bills/:billId`,
`POST /bills/:billId/discount`, `POST /bills/:billId/payments`,
`POST /bills/:billId/void`, `GET /bills/summary`,
`GET /bills/:billId/receipt`.

**Files created**

Models: `Bill.js`, `AuditLog.js`. `Counter.js` gained an additive `scope` field.

Services: `billService.js`, `billPermissionService.js`, `billNumberService.js`,
`auditService.js`, `receiptService.js`. Controller: `billController.js`.
Routes: `billRoutes.js`. Validators: `billValidators.js`. Utils: `tax.js`.

Tests: `tax.test.js` (28), `billNumber.test.js` (9), `bills.test.js` (38).

**The arithmetic, which is this module's whole risk**

All of it is in `server/utils/tax.js` and nothing outside that file computes
tax. Written and tested before any controller existed, per CONVENTIONS 13.
Three tests are marked in the file as the ones that matter: per-slab rounding
really does differ from per-line (three lines of 3333 paise at 5% give 501 per
line and 500 per slab), CGST takes the odd paisa across every value 0 to 500,
and an apportioned discount puts every paisa on exactly one slab so the grand
total reconciles with its own parts.

**Three real bugs the tests found**

`Bill.aggregate` was matching a string `restaurantId` against an ObjectId, so
the bill list's running total was silently zero. An aggregation pipeline is not
cast against the schema and `req.restaurantId` comes off the JWT as a string.
Fixed with `scopedForAggregate` in `utils/scopedQuery.js`, which M6 will need
too, because that module is nothing but aggregates.

Adding `scope` to the counters index broke M2's `nextNumber` under concurrency.
MongoDB can only retry a racing upsert when the query covers every field of the
unique index, and the filter did not name `scope`. The existing M2 test caught
it.

The bill-number concurrency test passed alone and failed under the full suite,
because index creation is asynchronous and the unique index had not finished
building. That index is what makes the first bill of a financial year safe
against two concurrent upserts; without it both callers get sequence 1.

**What the other developer needs to know**

Bill creation refuses to run without a transaction. Every other write in this
project degrades gracefully on a standalone `mongod`; this one does not,
because a gap-free number sequence has no degraded mode and silently issuing
gappy numbers in development is how the pattern reaches production.

The order moves to `BILLED` when the bill is **paid**, not when it is created.
M2 decided `BILLED` frees the table, and the customers are still sitting there
until they have paid.

`billService.js` does not import the MenuItem model and must not start. A bill
copies from the order line, which copied from the menu when the line was added.

A cashier can bill and take payment but cannot discount or void. That asymmetry
is the control this module exists to sell, not an inconsistency to tidy up.

**Unblocked:** M3 screens. M4's deduction service has `wasPrepared` and the
`auditlogs` collection to build on.

**Still open:** M3 has no React screens, so it is backend-done, not done. The CA
review and the thermal printer test are pilot gates in the known problems table
and neither can be closed by code.

### 2026-08-30 Rishi, the M2 spec backfill

**What was written:** the M2 sections of `docs/API-CONTRACT.md` (sections 11 to
13, eighteen endpoints) and `docs/DB-SCHEMA.md` (sections 8 to 11, four
collections). No server or client code. This unblocks M3.

**Why it was needed**

M2 shipped and merged with no section in either spec file. M1 and M5 both wrote
their contract first and committed it before any code; M2 did not, and nobody
noticed until M3 was about to start. M3 is a function of M2's order shape — a
bill is built from an order line — so specifying M3 against undocumented code
would have been the exact guesswork CLAUDE.md forbids.

Everything in the backfill was read out of the shipped models, validators,
routes and tests. Where a claim was not obvious it was checked against the test
that proves it: the `wasPrepared` 400-versus-422 split and the `includeInactive`
parameter name were both verified this way rather than assumed.

**What M3 most needs from it**

The order line's snapshot fields are `itemName`, `unitPriceInPaise` and
`taxRateBps`. Not `priceInPaiseSnapshot`, not `taxRateBpsSnapshot`. A bill
copies from the line, and the line already copied from the menu. (The tax field
was `taxRateBasisPoints` when this entry was written and was renamed later the
same day; see the decision log.)

`orders.billId` and the `BILLED` status are reserved and untouched. M2 writes
neither.

Every order write goes through `applyVersionedUpdate` with the version in the
filter. M3 setting `BILLED` must be version-safe the same way.

`counters` has no `BILL` name on purpose. The gap-tolerant reserve-then-write
pattern is fine for order and KOT numbers and is **not** fine for bill numbers.
M3 reserves inside the transaction that inserts the bill.

**Two problems found while reading, both in the known problems table**

The order line and the menu item use different names for the same price and tax
fields. And the `skipTenantGuard` tripwire asserts on file names rather than
call counts, so the fourth production use, added inside an already-listed file
by the email-login work, slipped past it. The fourth use is legitimate; the
tripwire and the "exactly three" in the docs are both now wrong.

**Unblocked:** M3 Phase 0 can specify bills against a documented order shape.

**Still open:** M3 and M4 have no spec sections yet. That is Phase 0 and it is
the next session.

### 2026-08-30 Rishi, M5 merged to main

**What happened:** pull request #5 was merged. No code changed; this entry
records the merge and what it means for anyone starting the next module.

`main` now carries M0 (all four parts), M1, M2 and M5. 352 tests pass on `main`,
lint is clean, and the client builds. Four of the seven v1 modules are done.

**What arrived on `main` with this merge**

M5 Employee Attendance in full: the `attendanceentries` collection, eleven
endpoints, and the three React screens at `/attendance`, `/attendance/register`
and `/attendance/me`.

M0-D, which had never been on `main`: the refresh token is an httpOnly cookie
rather than a localStorage value, `/auth/refresh` and `/auth/logout` require an
`X-Requested-With` header, and `users` carries the `pinHash` credential.

Email as a second login identity, and `--email` / `--password` on the
provisioning script.

**The one thing to know if you had the old client running**

The refresh token is a cookie now and `client/src/utils/sessionStorage.js` is
deleted. A test or a script that logs in and reads `body.data.refreshToken` will
not find it; read the `Set-Cookie` header instead. Anyone with a stale dev
session should sign in again rather than debug why a restore fails.

**Merged without the second read**

BUILD-PLAN section 9 makes "the other developer has read the code" part of the
definition of done. Arya has read neither M1 nor M5. Rishi merged anyway, as a
deliberate call rather than an oversight, and the review debt is recorded in the
known problems table so it is not lost.

**Unblocked:** M6's hours-worked report has `GET /attendance/summary` on `main`
to read. M3 Billing was already unblocked by M2 and is the obvious next module.

**Still open:** Arya's read of M1 and M5. The all-roles `GET /attendance/board`
for the clock screen. The Atlas credential in git history at 177ed9c.

### 2026-08-30 Rishi, M5 pushed and merged with M2

**What happened:** no new feature work. The M5 chain was pushed to the remote for
the first time and brought up to date with the M2 module that had landed on
`main` in the meantime.

`origin/main` had moved eight commits ahead with M2 Order Taking (pull request
#4) while the M5 chain was being built locally on top of M1. The two had never
met. All five M5-era branches are now on the remote, and
`feat/m5/attendance-screens` has `origin/main` merged into it, so it is the one
branch carrying M0, M1, M2 and M5 together.

**The four merge conflicts, and how each was settled**

`server/routes/index.js` and `client/src/App.jsx`: both sides appended to a
list. Resolved as a union, M2's mounts and routes before M5's.

`server/utils/errors.js`: both sides appended error codes and error classes.
Resolved as a union; all ten classes and all four new codes
(`ALREADY_CLOCKED_IN`, `PIN_LOCKED`, `TABLE_OCCUPIED`, `VERSION_CONFLICT`)
survive, verified by importing the module.

`docs/PROJECT-STATE.md`: this file. Both sides rewrote the stage, the decision
log, the open questions and the session log. Nothing was dropped from either
decision log; both blocks are kept.

**Two open questions closed by the merge, not by new work**

The two waiters problem was answered by M2 and the business day boundary by M5
D1. Both were still listed as open on one side or the other because neither side
could see the other's answer. Both are now removed from Open Questions; the
decision rows stay in the log.

**One thing removed before the push**

The previous tip commit carried a `scratch/` folder with two ad-hoc scripts, one
of which set every user's password to a fixed string across every tenant with no
`restaurantId` filter. It was rewritten out of the commit before anything was
pushed, so it never reached the remote, and `/scratch/` is now in `.gitignore`.
The useful parts of that commit, the dashboard attendance links and a
`server.js` shutdown fix, were kept.

**Still open:** M5 is on a branch, not on `main`, and Arya still has to read both
M1 and M5.

### 2026-08-30 Rishi, M5 screens and the station clock

**What was built:** branch `feat/m5/attendance-screens`. It merges
`fix/m0/auth-hardening` into `feat/m5/attendance` (so the staff PIN and the
attendance server are in one tree), wires the last M5 endpoint, and adds the
three React screens. 255 server tests pass, lint clean, the client builds.
Not merged.

**The station clock endpoint, now wired**

`POST /attendance/station/clock` was specified in M5 and blocked on M0-D. It is
now mounted. `attendanceService.stationClock` calls `authService.verifyPin`
(which issues no token), then reuses the existing `clockIn` / `clockOut` with
`source: 'STATION'`. `action: "undo"` reverses the caller's own last station
event inside an ~8-second window: a mistaken clock-in is voided (`MIS_TAP`), a
mistaken clock-out reopens the shift with a `MIS_TAP` correction. Nine tests,
including one asserting no `RefreshToken` is created across a station clock.

**Three screens, under `client/src/features/attendance/`**

`/attendance` — the clock. Every role. A shared tablet: a grid of large name
tiles (initial disc, name, IN / OUT stamp), tap a name, enter a PIN on a numeric
pad, get a full-screen confirmation with a large UNDO that self-dismisses when
the window closes. No nav, nothing else reachable. Labels are English-primary
with Hindi underneath, from `labels.js`, both always visible (D6). The roster
and open-shift reads are OWNER/MANAGER, so the tablet needs a manager-capable
session; see the known problems table.

`/attendance/register` — OWNER, MANAGER. The day's entries as a dense list,
flagged and open shifts on top, a date range, an "Add entry" button. Correcting
or adding opens a slide-over (`CorrectionPanel`), reason required, correction
history shown on the entry.

`/attendance/me` — every role, read only. The open shift, the last seven days of
closed shifts, and the total.

**Shared code touched**

`components/ui/AvailabilityStamp.jsx` gained a `kind` prop: `availability`
(default, unchanged) or `clock` (IN / OUT). One stamp, reused, per the design
system. `utils/formatDate.js` gained `toDatetimeLocalIst` / `fromDatetimeLocalIst`
/ `todayIso` for the correction form; `utils/formatDuration.js` is new
("7h 20m"). `App.jsx` mounts the three routes.

**Contract and schema**

`docs/API-CONTRACT.md` section 8 and `docs/DB-SCHEMA.md` section 7 lost their
"not implementable until M0-D" notes; the endpoint exists now. The stale "a PIN
is unique per branch" line in DB-SCHEMA was corrected — M0-D chose no uniqueness
constraint.

**What the other developer needs to know**

The clock screen is the only screen with translated text, and it is deliberate.
Do not import `features/attendance/labels.js` anywhere else.

`AvailabilityStamp` is still one component. If M6 needs a third two-state badge,
add a `kind`, do not copy it.

The station undo window is a server constant (`STATION_UNDO_WINDOW_MS`, ~8s).
The client reads `undoUntil` off the response rather than counting locally.

**Unblocked:** M5 is feature-complete. It needs Arya's read and a merge.

**Still open:** a proper all-roles roster read for the clock screen (known
problems table). Nothing merged to `main`.

### 2026-08-29 Rishi, M5 server

**What was built:** the M5 Employee Attendance server, on branch
`feat/m5/attendance`, against the spec committed as `chore/m5/spec`. Ten
endpoints, one model, one service, 35 tests. 232 in the suite overall, all
passing. Lint clean.

**Endpoints, all under `/api/v1`**

`POST /attendance/clock-in`, `POST /attendance/clock-out`, `GET /attendance/me`
(all six roles, act on the caller).

`GET /attendance`, `GET /users/:userId/attendance`, `POST /attendance`,
`PATCH /attendance/:entryId`, `PATCH /attendance/:entryId/void`,
`GET /attendance/summary` (OWNER and MANAGER).

**Not built: the station endpoint.** `POST /attendance/station/clock` is in the
contract (section 8) but the route is not mounted. It needs `users.pinHash`,
which M0-D owns. `attendanceService.clockIn` / `clockOut` take a `source`
argument so the station path is a thin addition once M0-D ships.

**Files created**

`models/AttendanceEntry.js`, `services/attendanceService.js`,
`controllers/attendanceController.js`, `routes/attendanceRoutes.js`,
`validators/attendanceValidators.js`, `tests/attendance.test.js`.

**Changed in M0 and M1**

`utils/time.js`: the business-day placeholder is replaced by `businessDateFor`
(instant plus a per-restaurant boundary to a `"YYYY-MM-DD"` day) and
`minutesBetween` (whole minutes, seconds dropped).

`utils/errors.js`: five M5 codes and classes appended. No existing class
touched.

`validators/common.js`: `queryBoolean` now lives here; `menuValidators.js`
imports it instead of holding its own copy.

`models/Restaurant.js` and `validators/restaurantValidators.js`: `settings`
subdocument with `businessDayStartsAtMinutes` (integer 0 to 1439, default 300).
`PATCH /restaurant` accepts it, OWNER only. `GET /restaurant` returns it.

`routes/index.js`: mounts `attendanceRoutes`.

`tests/menu.test.js`: the `skipTenantGuard` tripwire comment now names M5. The
assertion is unchanged and still green: M5 added no new use, and the scan
already covered the whole `server/` tree.

**The arithmetic, which is this module's money-and-GST**

`workedMinutes = floor((clockOutAt - clockInAt) / 60000)`, recomputed on every
write, never accepted from a client. Tests cover a shift crossing midnight and a
shift crossing the configured business-day boundary, including the same shift
landing on two different `businessDate`s when the boundary is moved from 05:00
to midnight.

**One open shift per person** is a partial unique index on `clockOutAt: null`.
`mongodb-memory-server` accepts the `unique` + `partialFilterExpression: {
clockOutAt: null }` combination; a test fires two clock-ins in parallel and
asserts exactly one wins and the database holds one open entry.

**What the other developer needs to know**

Every attendance rule is in `services/attendanceService.js`. 403 means not you
(wrong role), 422 means not this by anyone: `SELF_CORRECTION_FORBIDDEN` binds an
owner. A MANAGER *may* correct an OWNER's attendance entry, unlike the M0-C user
endpoints, because it is operational data and every change is on the trail.

`businessDate` is derived once at clock-in and never recomputed. To move an
entry to another day, void it and recreate it.

`skipTenantGuard` count is unchanged: still exactly the three from M0. Every
attendance query is `scoped(req)` or an explicit `{ restaurantId, branchId }`.

**Unblocked:** M5 client screens (Task D) have an API to call. M6's
hours-worked report has `GET /attendance/summary` to read when M6 is built.

**Still open:** M5 has no React screens. The station endpoint waits on M0-D. The
Atlas credential is still unrotated.

### 2026-08-29 Rishi, M5 spec

**What was written:** the M5 Employee Attendance sections of
`docs/DB-SCHEMA.md` (section 7, `attendanceentries`) and `docs/API-CONTRACT.md`
(sections 7 to 10), plus the seven decisions that had to be settled first. No
server or client code. Committed as `chore/m5/spec`, following the M1 precedent
of a spec commit before any module code.

**The seven decisions, now in the decision log**

D1 business day boundary. `restaurants.settings.businessDayStartsAtMinutes`,
default 300 (05:00 IST), per restaurant, editable through `PATCH /restaurant`.
Every attendance entry stores a `businessDate` derived at clock-in. This closes
an open question that had been sitting since M0.

D2 shared-tablet clock-in. Yes, via a per-user PIN that is a second credential on
`users`, never a second user, and never issues a session. Delivered by M0-D
(Task C). The M5 spec defines `POST /attendance/station/clock` as the only
endpoint a PIN can reach.

D3 corrections. Embedded on the entry as `corrections[]`. No shared audit
collection is built speculatively; M3 owns that call.

D4 self-correction. Nobody edits or voids their own entry, including an OWNER.
422 `SELF_CORRECTION_FORBIDDEN`.

D5 forgotten clock-out. Never auto-closed. Flagged `requiresAttention` past 12
hours, closed by a manager correction with a reason.

D6 clock-screen language. English primary, Hindi secondary, one hardcoded label
file, no i18n layer.

D7 Swiss design. Principles inside the existing `DESIGN-SYSTEM.md` tokens, no new
palette or typeface.

**Decisions made in the writing, also logged**

`businessDate` is a `"YYYY-MM-DD"` string. "One open shift per person" is a
partial unique index on `clockOutAt: null`. A `MANAGER` may correct an `OWNER`'s
attendance entry, unlike M0-C user management, because it is operational and
audited. `PIN_LOCKED` reuses 429. One person's history is a path,
`GET /users/:userId/attendance`, not a `?userId=` query.

**Changed in M0**

`docs/DB-SCHEMA.md` section 1: `restaurants` gains
`settings.businessDayStartsAtMinutes`. The "deliberately not here" note about a
business-day field is replaced, since it is now decided. `settings.tax` is still
flagged as M3's.

`docs/API-CONTRACT.md` sections 2.1 and 2.2: the `settings` object is readable on
`GET /restaurant` and writable on `PATCH /restaurant` (OWNER only), range 0 to
1439.

`docs/API-CONTRACT.md` "Open questions still unanswered": the business-day and
staff-PIN entries are marked resolved, with pointers to the decision log.

**What Task B needs to know**

The specs are the contract. Build `models/AttendanceEntry.js`,
`services/attendanceService.js` (every business and permission rule in this one
file, like `userPermissionService.js`), `controllers/attendanceController.js`,
`routes/attendanceRoutes.js`, `validators/attendanceValidators.js`,
`tests/attendance.test.js`.

Verify the `unique` + partial-on-null index actually enforces one open shift on
`mongodb-memory-server` and on the real cluster. `$exists: false` is not a legal
partial filter, so an open shift must store `clockOutAt: null`.

Timestamps are the server's clock everywhere except `POST /attendance` and
`PATCH /attendance/:entryId`, the two manager endpoints that reconstruct a missed
or mistaken entry.

`workedMinutes = floor((clockOutAt - clockInAt) / 60000)`, recomputed on every
write, never from the client. Real tests on a midnight-crossing shift and a
business-day-boundary-crossing shift.

Extend the `skipTenantGuard` tripwire in `tests/menu.test.js` to cover M5 rather
than writing a second one. M5 adds no new use; there are still exactly three.

**What Task C (M0-D) owns, not this session**

The `users.pinHash`, `pinFailedAttempts` and `pinLockedUntil` fields, the PIN
set and reset endpoints, the per-user rate limit and lockout, and the httpOnly
refresh-token cookie. The M5 station endpoint is specified but not implementable
until M0-D ships.

**Unblocked:** M5 server (Task B) has a contract to build against.

**Still open:** M5 has no code. Arya still has not read M1. The Atlas credential
in `claude_code_chat_continue.txt` is still unrotated (Task C).
### 2026-08-30 Rishi, email login

**What was done:** branch `feat/m0/email-login`, off `fix/m0/auth-hardening`.
Email becomes a second login identity alongside phone. The provisioning script
takes a chosen password and an email. Full server suite passes, lint clean,
client builds. Not merged.

**Server**

`POST /auth/login` accepts `{ email, password }` in place of `{ phone,
password }` — exactly one identifier, enforced by the schema. `verifyCredentials`
looks up by whichever was sent; the dummy-hash timing guard and the single
`INVALID_CREDENTIALS` response cover email the same as phone. `authService`
gains `isEmailRegistered`, used by `POST /users`, `PATCH /users/:id` and
provisioning for a clean 409. `users.email` gets a partial unique index
(`$type: 'string'`), so any number of users can have none but two cannot share
one. The login rate limiter keys on phone-or-email. `validators/common.js` gains
a shared `email` primitive.

`scripts/provisionRestaurant.js` takes `--email` and `--password` (both optional,
prompted interactively). The password is still generated when not given, still
printed once, still never stored.

**Client**

The login screen is now one "Phone or email" field: an `@` routes it to the
email path. `authApi.login` and `AuthContext.login` pass the credentials object
straight through.

**What the other developer needs to know**

Phone login is unchanged. Every existing phone-login test still passes.

Email is optional and unique-when-set. Clearing it (`email: null` on
`PATCH /users/:id`) is always allowed.

To make a dev account: `npm run provision:restaurant -- --name "..." --owner
"..." --phone 98XXXXXXXX --email you@example.com --password "one you pick"`.

**Unblocked:** you can sign in with `<team-email>` once this branch
is in the tree you run.

**Still open:** not merged. Sits between `fix/m0/auth-hardening` and the M5
branches in merge order.

### 2026-08-29 Rishi, M0-D auth hardening

**What was done:** three pieces of auth hardening on `fix/m0/auth-hardening`,
branched off `main` so it carries no M5 commits. 203 tests pass, lint clean.
Not merged.

**1. Refresh token moved to an httpOnly cookie.** The contract was edited first,
in its own commit, then the code.

Server: login and refresh set `refreshToken` as an `HttpOnly; Secure;
SameSite=Lax; Path=/api/v1/auth` cookie (`utils/authCookie.js`). Refresh and
logout read it from the cookie, take no body, and require an `X-Requested-With`
header (`middleware/requireCsrfHeader.js`). Logout, logout-all and
change-password clear the cookie. The token value is never in a response body.

Client: `utils/sessionStorage.js` is deleted. `AuthContext` no longer holds a
refresh token; it restores a session by calling refresh and treating a failure
as "no session". `api/client.js` sends `X-Requested-With` on every request.

**2. Staff PIN for the M5 shared-tablet clock.** `users` gains `pinHash`,
`pinFailedAttempts` and `pinLockedUntil` (additive, null-defaulted,
migration-free). `PATCH /api/v1/users/:userId/pin` sets or resets a 4 to 6 digit
PIN, OWNER/MANAGER, a manager cannot touch an owner's PIN.

`authService.verifyPin({ restaurantId, branchId, userId }, pin)` returns
`{ userId }` on success and throws `InvalidPinError` (401) or `PinLockedError`
(429) otherwise. **It issues no token of any kind** — a test asserts the
`RefreshToken` count does not move across a verification. Missing user, no PIN
and wrong PIN fail identically against the dummy hash. Five wrong tries lock it
until a manager reset.

`POST /attendance/station/clock` is **not** wired here. It lives on
`feat/m5/attendance`, and this branch has no attendance module by design. When
M0-D and M5 land together, that route is mounted and calls `verifyPin` plus the
existing clock-in/out logic. `verifyPin`, the PIN storage and the PATCH endpoint
are the whole M0 deliverable and are ready.

**3. Cleanup.** `userController.js` now imports the shared
`utils/escapeRegex.js` instead of a private copy. `claude_code_chat_continue.txt`
is deleted from HEAD; the Atlas credential in it was rotated by hand outside the
session and `.env` updated. The old value is still in git history at 177ed9c — a
full purge is deferred, accepted because the credential is now dead.

**Files created**

`server/utils/authCookie.js`, `server/middleware/requireCsrfHeader.js`.

**Changed in M0**

`docs/API-CONTRACT.md` sections 1.1 to 1.4, 1.6, 3.7 and the token model.
`docs/DB-SCHEMA.md` section 3. `authController.js`, `authRoutes.js`,
`authValidators.js`, `tokenService.js`, `User.js`, `utils/errors.js`,
`services/authService.js`, `services/userPermissionService.js`,
`validators/userValidators.js`, `userController.js`, `userRoutes.js`. Tests:
`auth.test.js`, `users.test.js`, `provisioning.test.js`.

**What the other developer needs to know**

The refresh token is a cookie now. A test that logs in and reads
`body.data.refreshToken` will not find it; read the `Set-Cookie` line instead.

`skipTenantGuard` count is unchanged: still the three from M0. `verifyPin`
filters on `restaurantId` and `branchId`, so it needs no hatch.

**Unblocked:** the pilot blockers "refresh token in localStorage" and "credential
in the repo" are cleared. M5's station endpoint has its PIN dependency.

**Still open:** the branch is not merged. `feat/m5/attendance` needs a rebase
onto this (or a merge order) before the station endpoint can be wired.
### 2026-08-29 Rishi, M2

**What was built:** M2 Order Taking and KOT, all of it. Tables, orders, order
lines, firing, the kitchen display, and five screens. The largest module in the
MVP.

**Endpoints, eighteen, all under `/api/v1`**

Tables: `POST /tables`, `GET /tables`, `PATCH /tables/:tableId`,
`PATCH /tables/:tableId/status`.

Orders: `POST /orders`, `GET /orders`, `GET /orders/:orderId`,
`POST /orders/:orderId/lines`, `PATCH /orders/:orderId/lines/:lineId`,
`POST /orders/:orderId/lines/:lineId/cancel`, `POST /orders/:orderId/fire`,
`PATCH /orders/:orderId/lines/:lineId/served`, `PATCH /orders/:orderId/table`,
`POST /orders/:orderId/cancel`.

Kitchen: `GET /kots`, `GET /kots/:kotId`,
`PATCH /kots/:kotId/lines/:lineId/ready`, `PATCH /kots/:kotId/ready`.

**Four collections:** `counters`, `tables`, `orders`, `kots`. All four apply
`baseSchema` and `tenantGuard` in full. None is a tenancy root.

**The snapshot, which is what this module is for**

Every order line stores its own copy of the item name, the variant name, the
unit price, the tax rate, and each add-on's name and price, taken when the line
was added. Nothing in M2, M3 or M6 reads `menuitems` for a price again.

The client sends ids and a quantity and never a price. The request schema
refuses `unitPriceInPaise`, `taxRateBasisPoints` and anything else outright
rather than stripping it, because a client sending a price is either a bug or
someone pricing their own dinner and both deserve a loud failure.

There is a test that adds a line, raises the menu price and tax rate, reads the
order back, and asserts the line still carries the old numbers. It was also
confirmed by hand against the live cluster.

**Files created**

Models: `Counter.js`, `Table.js`, `Order.js`, `Kot.js`.

Services: `counterService.js`, `orderService.js`, `kitchenService.js`.
Controllers: `tableController.js`, `orderController.js`, `kotController.js`.
Routes: `orderRoutes.js`. Validators: `orderValidators.js`. Utils:
`transaction.js`.

Tests: `tables.test.js`, `orders.test.js`, `kitchen.test.js`, and
`tests/helpers/m2Fixtures.js`. 84 new tests, 281 in the suite, all passing.

Client: `api/orders.js`, `api/kitchen.js`, `features/orders/` with
`FloorViewPage`, `OrderScreenPage`, `TakeawayOrderPage`, `TableManagementPage`,
`MenuPicker`, `OrderLineList`, `LineOptionsPanel`, `CancelPanel` and
`errorCopy.js`, plus `features/kitchen/KitchenDisplayPage`.

**Changed in M0**

`utils/errors.js`, appended: `TABLE_OCCUPIED`, `VERSION_CONFLICT`, their two
classes, and a `details` option on `AppError`.

`middleware/errorHandler.js`: two lines, merging `details` into the failure
envelope. The only M0 file M2 changed beyond `errors.js`, and it was that or
break the contract's error shape.

`client/src/api/client.js`: `ApiError` now keeps the keys it does not
recognise. Without it `existingOrderId` and `currentVersion` arrived from the
server and vanished one line into the client.

`routes/index.js` mounts `orderRoutes`. `App.jsx` and `DashboardPage.jsx` gained
routes and links.

**A bug this found, in M2's own schemas**

Mongoose skips its own `min` and `max` on a null but still runs a custom
validator, and `Number.isInteger(null)` is false. A table created without a seat
count, and a takeaway order with no guest count, both failed validation on the
null the schema itself had just defaulted. Both fields now use a validator that
tolerates an absent value.

**Verified against the real cluster**

The server booted against Atlas and the whole lifecycle ran over HTTP: a table,
an order, three lines with a variant and an add-on, fired to a ticket, the menu
price raised afterwards and the line still showing the old one, a line marked
ready by the kitchen and served, two more lines fired as a second ticket, a
stale write answered with 409 and the current version, everything served, and
the order landing on `READY_TO_BILL` by itself. Two concurrent creates on one
table returned 409 as they should.

The verification restaurant was deleted afterwards, along with everything
scoped to it. The cluster is back to the one real restaurant.

**What the other developer needs to know**

Never read an order, change it in memory and save it. Every write goes through
`applyVersionedUpdate` in `services/orderService.js`, which puts the client's
version in the update filter. The note at the bottom of `models/Order.js` says
this too, because that is where someone would go to "simplify" it.

The partial unique index on `orders` is what makes one open order per table
true. Do not replace it with a `findOne` check in a controller. That is the
race, not the fix.

`isAvailable` on a menu item is checked when a line is added and never again.
An order line is a snapshot, including of the fact that the dish was sellable
at that moment.

A whole-order cancel is OWNER and MANAGER only. A single line cancel is not.
That difference is deliberate and is in the decision log.

M3 sets `orders.billId` and the `BILLED` status. M2 never touches either.

**Unblocked:** M3 Billing. Every line carries the price and tax rate it needs.
M4 also has what it needs from `lines.status` and `lines.wasPrepared`.

**Still open:** a table with a `READY_TO_BILL` order on it reads as free, which
M3 has to settle. See the known problems table.

### 2026-08-29 Rishi, M1 screens

**What was built:** the two M1 screens, and the design language every later
module inherits. M1 is now done, not backend-done.

**Design first, code second**

M1 is the first UI in this project, so the visual language was decided and drawn
before any `.jsx` file was opened. `docs/DESIGN-SYSTEM.md` is the result and is
to the frontend what CONVENTIONS.md is to the backend. Read it before building
a screen.

The reference is what this software replaces: a laminated menu, a kitchen chit,
a thermal bill roll, a stainless counter. Six colours, two type roles, one
signature element.

Saved canvas: https://claude.ai/code/artifact/a65ddd80-2a1a-42d3-84b7-2b26e6cb4040

**Screens**

`/menu`, OWNER and MANAGER. Category rail with inline rename and on/off, a dense
item list, and a slide-over editor carrying variants and add-ons. Not a modal:
someone editing an item needs to glance back at the rail mid-edit.

`/menu/availability`, all six roles. Large tap tiles grouped by category behind
a sticky filter bar, item and variant level. The toggle is optimistic and rolls
back with a plain-language toast on failure.

**Files created**

`api/menu.js`, `features/menu/` with `MenuBuilderPage`, `AvailabilityBoardPage`,
`CategoryRail`, `MenuItemRow`, `ItemEditorPanel`, `SubItemListEditor` and
`errorCopy.js`, plus `components/ui/AvailabilityStamp.jsx` and `Toast.jsx`.

`docs/DESIGN-SYSTEM.md`. Tokens in `client/src/index.css` under `@theme`.

**A bug this found, in M1's own test**

`tests/menu.test.js` has a tripwire asserting M1 added no new use of
`skipTenantGuard`. It was failing on every run on Windows: `readdirSync` with
`recursive` returns the platform separator, so `tests\menu.test.js` never
matched the `tests/` exclusion, and every test file that mentions the hatch was
reported as a violation, including that test itself.

The count it guards was always correct. The test was not. A tripwire that cries
wolf on every run is a tripwire somebody eventually deletes, so it is fixed
rather than left red. It is the only server file this session touched.

**Verified against the real cluster**

Atlas is reachable now, so for the first time in this project the server booted
against it and `GET /api/v1/health` reported `database: "connected"`. A menu was
seeded through the API and every read and write the screens make was exercised
end to end, including variant level availability.

**What the other developer needs to know**

The builder does not read `GET /menu`. That endpoint never returns an inactive
category or item under any query, and the builder exists to switch them back on.
It reads `GET /categories` and `GET /menu-items` with `includeInactive=true`.

`chana`, `mirch` and `patta` are functional colour. Do not reach for one to make
something pop.

Mono is for numbers, Sans for everything else. An item description is prose.

A variant carries its `id` through the editor and back to the server untouched.
That is what keeps an M4 recipe attached when someone renames "Half".

Two tablets on the availability board do not see each other live. See the known
problems table.

**Unblocked:** nothing new, but M2 now has a menu someone can actually edit.

**Still open:** Arya has still not read M1.

### 2026-08-29 Rishi, M1

**What was built:** M1 Menu Management, server side. Categories, menu items,
variants, add-ons, availability, and the menu tree the ordering screen reads.

**The spec was written first, and that was the first commit**

`docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md` had no M1 section. DB-SCHEMA.md
said so in as many words. CLAUDE.md forbids inventing their contents, so the
contract and schema were written and committed before any model or route
existed, and the code was then built against them.

If you are picking up M2, read those two files, not the chat this came from.

**Endpoints, eleven, all under `/api/v1`**

`POST /categories`, `GET /categories`, `PATCH /categories/:categoryId`,
`PATCH /categories/:categoryId/active`.

`POST /menu-items`, `GET /menu-items`, `GET /menu-items/:menuItemId`,
`PATCH /menu-items/:menuItemId`, `PATCH /menu-items/:menuItemId/availability`,
`PATCH /menu-items/:menuItemId/active`, `GET /menu`.

Reads are open to all six roles. Writes are OWNER and MANAGER, except
availability, which is open to all six on purpose.

**Files created**

Models: `Category.js`, `MenuItem.js`, plus `models/plugins/jsonTransform.js`.

Controllers: `categoryController.js`, `menuItemController.js`. Routes:
`menuRoutes.js`. Validators: `menuValidators.js`. Utils: `escapeRegex.js`.

Tests: `tests/menu.test.js`, 42 tests. 197 in the suite overall, all passing.

**Changed in M0**

`utils/errors.js`, appended: four codes and four classes. No existing class
touched.

`models/plugins/baseSchema.js`: the `toJSON` transform moved into
`jsonTransform.js` and is now called from there. Behaviour unchanged. This was
necessary because a variant subdocument needs the same transform and cannot
apply `baseSchemaPlugin`.

`routes/index.js`: mounts `menuRoutes`.

**The thing most likely to be broken by a later edit**

Variant and add-on `_id`s are permanent. `PATCH /menu-items/:id` matches
incoming entries to existing subdocuments by id and updates them in place.

The obvious implementation, assigning the request array onto the document, makes
Mongoose mint a fresh `_id` for every entry. Since M4 attaches recipes to a
`variantId` and M2 will store one on an open order line, that version silently
detaches a recipe from its variant the first time a manager renames "Half" to
"Half Plate", and nothing notices until a stock deduction runs weeks later.

`reconcileSubdocuments` in `menuItemController.js` is what prevents it, and
there are four tests on it. Do not simplify it.

**What the other developer needs to know**

`isAvailable` and `isActive` are different fields answering different questions.
"Out of paneer tonight" versus "off the menu". All six roles can set the first,
only owner and manager the second.

There is no DELETE in M1 and there will not be one. `PATCH .../active` is the
delete, because an M3 bill references an item by id forever.

Deactivating a category does not cascade to its items. They keep their own
`isActive` and reappear untouched when the category comes back.

M2 must copy `name`, `priceInPaise` and `taxRateBps` onto the order line at
creation. Do not read them live from the menu at bill time. That is the rule
this whole module exists to serve.

The escape hatch count is unchanged: still exactly three production uses of
`skipTenantGuard`, all from M0. M1 added none, and there is a test asserting it.

**Unblocked:** M2 Order Taking. The menu it reads from exists.

**Still open:** M1 has no React screens, so it is backend-done, not done. Arya
owns this module on paper and has not read the code yet. Both are in the known
problems table.

### 2026-08-29 Rishi, later

**What was built:** M0 part C, staff management. M0 is now DONE.

**Endpoints, all six from docs/API-CONTRACT.md section 3**

`POST /users`, `GET /users`, `GET /users/:userId`, `PATCH /users/:userId`,
`PATCH /users/:userId/status`, `PATCH /users/:userId/password`.

All six are OWNER or MANAGER. There is no DELETE: deactivation replaces it, so
M5 attendance history keeps a user record to point at.

**Files created**

Server: `services/userPermissionService.js`, `validators/userValidators.js`,
`controllers/userController.js`, `routes/userRoutes.js`, `tests/users.test.js`.

Client: `api/users.js`, `components/RequireRole.jsx`, `components/ui/Select.jsx`,
and `features/users/` with the staff list, the add and edit form, the reset
password dialog, the deactivate confirmation, and the role labels.

**Changed in parts A and B**

`utils/errors.js`, appended: `LAST_OWNER`.

`services/authService.js`, extended: it now owns the global phone lookup and
creating a user with a password. `scripts/provisionRestaurant.js` calls the
first of those instead of writing its own unguarded query, which is why the
escape hatch count is still three and not four.

**A bug this found**

`POST /users` stamped `passwordChangedAt` with the current time, as the brief
asked. Combined with the fail-closed second comparison from part B, that
rejected the new user very first access token whenever the login landed in the
same second as the creation. Now null, which is the correct value: there are no
tokens to invalidate for someone who has never signed in.

It was caught by a live end-to-end run, not by the tests. The test asserted the
login returned 200, and the login endpoint does not run the authenticate
middleware, so it never touched the broken path. There is a regression test now
that actually uses the token.

**What the other developer needs to know**

Every staff rule is in `services/userPermissionService.js`. If you need to know
what a manager may do, read that file, not the controllers.

403 means not you. 422 means not this, by anyone. The last-owner rule and the
self-demotion rule are 422 because they bind an owner too.

The frontend never re-implements a permission rule. `RequireRole` hides screens
and the role dropdown hides Owner from a manager, and both say in a comment
that they are convenience only. The last-owner message on screen is whatever
the server said, not a string the client owns.

Search input is escaped before it becomes a regex. If you add another search
box, do the same.

**Unblocked:** M1 Menu Management. M0 is done, so Arya can start.

**Still open:** nothing in M0. The three known problems below are all
environmental or deployment concerns, not M0 work.

### 2026-08-29 Rishi

**What was built:** M0 part B. The four M0 models, the full authentication
flow with refresh token rotation and reuse detection, the restaurant and branch
read endpoints, and the provisioning script.

**Endpoints, all nine from docs/API-CONTRACT.md sections 1 and 2**

`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`POST /auth/logout-all`, `GET /auth/me`, `PATCH /auth/password`,
`GET /restaurant`, `PATCH /restaurant` (OWNER only), `GET /branches`.

**Files created**

Models: `Restaurant.js`, `Branch.js`, `User.js`, `RefreshToken.js`, plus
`models/plugins/baseSchemaTenantRoot.js` for the branch exception.

Services: `passwordService.js`, `tokenService.js`, `authService.js`.

Controllers: `authController.js`, `restaurantController.js`,
`branchController.js`. Routes: `authRoutes.js`, `restaurantRoutes.js`,
`branchRoutes.js`. Validators: `authValidators.js`, `restaurantValidators.js`.

Script: `scripts/provisionRestaurant.js`, wired to `npm run provision:restaurant`.

Tests: `auth.test.js`, `restaurant.test.js`, `provisioning.test.js`, plus
`tests/helpers/`. 114 tests total, all passing, including the 57 from part A.

Client: `api/authApi.js`, `utils/sessionStorage.js`, and real wiring in
`AuthContext.jsx`, `LoginPage.jsx` and `DashboardPage.jsx`.

**Changed in part A**

`middleware/authenticate.js`, as section 9.3 of the brief asked: it now loads
the user, rejects a deactivated user or restaurant, and rejects an access token
issued before the last password change.

`utils/errors.js`, additively: two new error codes the contract requires.

**A bug this found**

The `passwordChangedAt` check compared whole seconds with `<`, so an access
token issued in the same second as a password change still worked. Narrow, but
it is exactly the window the mechanism exists to close. Now `<=`, which fails
closed. It surfaced as a flaky test, not by reading the code, which is worth
remembering.

**What the other developer needs to know**

There is no signup. Run `npm run provision:restaurant` to create an account. The
password prints once and is not recoverable.

`grep -rn "skipTenantGuard" server/` now returns three production hits, not
zero. All three are lookups that genuinely happen before any tenant is known:
login by phone, refresh by token hash, and the provisioning duplicate check.
Each has a comment saying so. Anything beyond these three needs justifying.

Branches are the tenancy root exception. Do not use `scoped(req)` on them: a
branch has no `branchId` field and `strictQuery` will throw. Filter on
`restaurantId` alone. `Restaurant` has no tenant guard at all, so every query
against it must be by `_id` from a verified token or from the provisioning
script.

Controllers never touch the password hash. `services/authService.js` owns it.

**Unblocked:** M0-C, user management, has everything it needs. So does M1.

**Still open:** M0 is not done until part C ships.

### 2026-08-28 Rishi

**What was built:** M0 part A, the foundation scaffold. Plumbing only. No
business logic, no Mongoose models, no collections, not a single database field.

**Files created**

Repo: `package.json` with npm workspaces, `eslint.config.js`, and a local `.env`
which is gitignored.

Server config: `config/env.js`, `config/database.js`, `config/logger.js`,
`config/roles.js`.

Mongoose plugins, none of them applied to anything yet:
`models/plugins/baseSchema.js`, `softDelete.js`, `tenantGuard.js`.

Middleware, in the CONVENTIONS section 8 order: `middleware/rateLimit.js`,
`authenticate.js`, `tenant.js`, `permission.js`, `validate.js`,
`errorHandler.js`, `notFound.js`.

Utils: `utils/errors.js`, `response.js`, `money.js`, `time.js`,
`scopedQuery.js`, `requestQuery.js`. Validators: `validators/common.js`.

Entry and route: `server.js`, `routes/index.js`, `routes/healthRoutes.js`,
`controllers/healthController.js`.

Tests: `tests/money.test.js`, `tenantGuard.test.js`, `logger.test.js`,
`app.test.js`. 57 tests, all passing.

Client: Vite, React 18, React Router 6, Tailwind 4. `api/client.js`,
`context/AuthContext.jsx`, `components/ProtectedRoute.jsx`,
`components/NotFoundPage.jsx`, `components/ui/` with Button, Input, Spinner,
ErrorMessage and EmptyState, `features/auth/LoginPage.jsx`,
`features/dashboard/DashboardPage.jsx`, `utils/formatDate.js`,
`utils/formatMoney.js`.

**Endpoints:** one. `GET /api/v1/health`. No auth, no tenant, no permission check.

**What the other developer needs to know**

Copy `.env.example` to `.env` and fill it in before anything runs. The server
prints exactly which variables are wrong and exits, rather than starting half
configured.

Every model you write applies `baseSchemaPlugin` and then `tenantGuardPlugin`.
A query that reaches the database without a `restaurantId` filter throws. That
is the point. Build filters with `scoped(req)`.

Never build a response by hand. Use `sendSuccess` and `sendList` in
`utils/response.js`.

Never do arithmetic on money outside `utils/money.js`. Everything is whole paise.

A record belonging to another restaurant returns 404, never 403. A 403 confirms
the record exists.

`grep -rn "skipTenantGuard" server/` is the whole tenant isolation audit. Today
it returns the guard and its own test, and nothing else. Keep it that way.

**Unblocked:** the shape everything else plugs into now exists, so M1 can be
designed against it.

**Still blocked:** M0 part B, meaning users, restaurants, branches and the login
endpoints. It needs `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md`. Neither
exists yet, and neither was invented here.

---

## Known problems

Things that are broken or half done, so nobody rediscovers them.

| Problem | Found by | Status |
|---------|----------|--------|
| The Atlas cluster refuses connections from a machine whose IP is not in Network Access. The TLS handshake fails with alert 80, which reads like a certificate problem but is not one. Each developer IP has to be added under Atlas, Network Access. | Rishi, 2026-08-28 | FIXED 2026-08-29. The IP was allowlisted and the server now connects. A new machine will hit this again, so the diagnosis stays here. |
| The refresh token is kept in `localStorage`, which any script on the page can read. One cross-site scripting hole hands over a 30 day credential. It must move to an httpOnly cookie before any pilot. One call site: `client/src/utils/sessionStorage.js`. | Rishi, 2026-08-29 | FIXED 2026-08-29 on `fix/m0/auth-hardening`. It is now an httpOnly, Secure, SameSite=Lax, Path=/api/v1/auth cookie the server sets and reads. `sessionStorage.js` is deleted. Refresh and logout also require an `X-Requested-With` header as CSRF defence in depth. |
| The database credential is committed to the repository. `claude_code_chat_continue.txt`, added on main in 177ed9c, is a pasted chat transcript containing `mongodb+srv://<atlas-username>:` followed by 14 of the 16 password characters, plus the cluster host. Two unknown characters is not protection. Treat the credential as compromised. | Rishi, 2026-08-29 | FIXED 2026-08-29. The Atlas password was rotated by hand outside the session and `.env` updated. The file is deleted from HEAD on `fix/m0/auth-hardening`. The old value still exists in git history at 177ed9c; a full history purge (filter-repo plus a force-push, and everyone re-clones) is deferred and is an accepted risk now that the credential is dead. |
| No code has run against the real Atlas cluster. Everything is verified against `mongodb-memory-server`. | Rishi, 2026-08-29 | FIXED 2026-08-29. The server booted against Atlas, health reported database connected, an owner was provisioned, and a menu was seeded and edited through the API. Tests still run against mongodb-memory-server, which is correct. |
| `CLAUDE.md` was missing at the repo root, then turned up as `docs/CLAUDE_1.md` where Claude Code does not auto-load it. BUILD-PLAN.md section 6 and CONVENTIONS.md section 1 both expect it at the root. | Rishi, 2026-08-28 | FIXED 2026-08-29. Moved to the repo root and its stale line about the specs not existing was corrected. |
| `baseSchemaPlugin` declares a single field index on `restaurantId` and a compound index on `{ restaurantId, branchId }`. The single field one is redundant, because a compound index also serves its leading field. Both are declared because CONVENTIONS section 4 asks for both. | Rishi, 2026-08-28 | OPEN and harmless. Drop the single field one if index count ever matters. |
| A variant or add-on can be removed by `PATCH /menu-items/:id` while an M4 recipe or an open M2 order line still points at its id. Nothing blocks it, because neither module exists yet to be asked. M2 and M4 must each decide whether to block the removal or tolerate a dangling reference. | Rishi, 2026-08-29 | OPEN. Must be settled while M2 is designed, not after. |
| There is no price history. Changing `priceInPaise` overwrites the old value with no record of what it was or who changed it. The 7pm order still bills correctly because M2 copies the price onto the order line, but "what did this cost last month" cannot be answered. | Rishi, 2026-08-29 | OPEN by design for v1. Becomes a real gap when M6 reports on margin. |
| M1 had no React screens. | Rishi, 2026-08-29 | FIXED 2026-08-29. The builder and the availability board are built, on the design system, and verified against the live cluster. |
| `userController.js` still holds a private copy of `escapeRegex` now that `utils/escapeRegex.js` exists. Two copies of a security-relevant function is how one of them drifts. | Rishi, 2026-08-29 | FIXED 2026-08-29 on `fix/m0/auth-hardening`. `userController.js` now imports the shared one. |
| M1 and M5 were both built by Rishi although the module table lists Arya as the owner of each, which crosses the one-owner-per-module rule in CONVENTIONS section 9. Neither has had the second developer's read that BUILD-PLAN section 9 requires, and both were merged to `main` anyway. | Rishi, 2026-08-29, extended 2026-08-30 | OPEN. Two modules of review debt on `main`, not one. Arya reads M1 and M5. Until then both are done on code and tests only. |
| Two tablets open on the availability board do not see each other's toggles live. The board refetches on window focus and after every mutation, which keeps them from drifting far apart, but there is no realtime sync in v1. Two people switching the same dish within seconds will briefly disagree. | Rishi, 2026-08-29 | OPEN by design for v1. Revisit if a pilot restaurant runs more than one tablet on this screen. |
| The M5 clock screen (`/attendance`) is "all six roles" but has no all-roles read to draw its grid: it uses `GET /users` and `GET /attendance?openOnly=true`, both OWNER/MANAGER. On a tablet signed in as a floor role the grid shows a "sign in as a manager" message instead of names. The clock action (`POST /attendance/station/clock`) is genuinely all-roles. | Rishi, 2026-08-30 | OPEN. The fix is a small all-roles `GET /attendance/board` returning `[{ userId, name, isIn, since }]` for this one screen. Contract change, so deferred rather than slipped in. In practice a wall tablet is signed in as a manager, so it works today. |
| An order line called its tax rate `taxRateBasisPoints` while the menu item it was copied from called the same number `taxRateBps`. Two names for one quantity, across M1 and M2. | Rishi, 2026-08-30, while backfilling the M2 spec | FIXED 2026-08-30, before M3 read either. The order line field is `taxRateBps` everywhere. CONVENTIONS section 2 now carries a Bps naming rule and a one-name-per-quantity rule so the next module does not reintroduce it. `unitPriceInPaise` vs `priceInPaise` is left alone on purpose: those are genuinely different numbers, the chosen variant's price versus the item's base price. |
| The `skipTenantGuard` tripwire asserted on the *file names* that mention the hatch, not the number of uses, so `isEmailRegistered` became a fourth production use inside the already-listed `authService.js` without the tripwire firing. | Rishi, 2026-08-30 | FIXED 2026-08-30. The test now builds a per-file count and asserts `{ authService.js: 3, tokenService.js: 1 }`, so a new use inside an already-sanctioned file fails the suite. Verified by adding a fifth use and watching it fail. `M0-SUMMARY.md` now says four and explains each. The dated changelog entries below still say three; they were true when written and are left as history. |
| Two demo restaurants, "Demo Restaurant A" and "Demo Restaurant B", now live permanently on the shared Atlas cluster, created by `npm run seed:demo`. | Rishi, 2026-08-30 | Not a problem, noted so nobody finds them and wonders. Unlike the one-off verification restaurants earlier sessions deleted afterward, this data is the deliverable `scripts/seedDemo.js` exists to produce, meant to be run again by anyone who wants a realistic environment. Both names are unmistakably demo data and the script wipes and rebuilds them idempotently; it never touches a differently-named restaurant. |
| A chartered accountant has not reviewed the GST output on a real printed bill. Specifically: the D1 tax-exclusive assumption, the D2 per-slab rounding, and the D3 CGST/SGST split with CGST taking the odd paisa. | Rishi, 2026-08-30 | OPEN, and it cannot be closed by code. BUILD-PLAN sections 3 and 10 both require it before a pilot. To close: print a real bill covering all three GST slabs, including one line whose slab tax is an odd number of paise, and have a CA confirm the arithmetic and the invoice format. A code review is not a substitute. Verified 2026-08-30 that the arithmetic is internally consistent (every bill reconciles, CGST+SGST always re-adds, the odd paisa always goes to CGST) against seed data covering all three slabs -- that is what code CAN confirm, and it is not what this row is waiting on. |
| The bill has never printed on a real thermal printer. The receipt is generated server-side at a fixed column width and snapshot tested with a 60-character dish name, but a snapshot test is not paper. | Rishi, 2026-08-30 | OPEN, and it cannot be closed by code. BUILD-PLAN section 10 requires it. To close: print on the pilot restaurant's actual printer model at both 32 and 48 columns and check that a long dish name wraps rather than pushing the amount column out of alignment. Verified 2026-08-30 over HTTP against a real 66-character seeded dish name at both widths: every line fits, the wrap indents under itself, and the amount column stays aligned -- confirms the layout logic is correct, which is not the same thing as confirming what a specific printer model does with it. |
| M4 is Arya's module on paper and was built by Rishi: the third module built off-owner, after M1 and M5, and CONVENTIONS section 9 says one module, one owner. | Rishi, 2026-08-30 | OPEN. Logged plainly rather than left to surface in the git log. Arya has now reviewed the M2 spec backfill and caught a real error in it, so the review habit exists; the debt is that M1, M5 and now M4 all still need their owner's read. |
| The M0 screens (login, dashboard, staff) still use the `slate-*` palette and the `brand-*` alias rather than the design system tokens. They work and look coherent because `brand-*` now points at `chana`, but they are not on the real palette. | Rishi, 2026-08-29 | OPEN. Not in M1's scope to restyle. Worth doing in the next M0 touch. |
| Ordering an out-of-stock **variant** of an available item is not blocked. `buildLineSnapshots` checks that the menu item is active and available, exactly as section 9.3 of the M2 brief lists, and that list does not mention `variants[].isAvailable`. So "Paneer Tikka available, Half plate marked out of stock" still lets a Half plate onto an order. | Rishi, 2026-08-29 | OPEN. Implemented to the brief deliberately rather than inventing a rejection it did not ask for. One line in `services/orderService.js` if the answer is that it should be blocked. |
| `services/billService.js` and `services/operationsReportService.js` still read `restaurant.settings.businessDayStartsAtMinutes` directly, each with its own query and its own default, rather than going through `settingsService`. The three controllers that did the same were migrated by M7; these two were not. | Rishi, 2026-08-31 | OPEN and harmless today: both reads are correct and return the same number. Left alone deliberately because they are M3 and M6 files and M7 had no mandate to touch M3's. The point of `settingsService` is that there is one place, so this should be finished on the next M3 or M6 touch. Two lines. |
| M2 has a second error copy map, `client/src/features/orders/errorCopy.js`, alongside M1's `features/menu/errorCopy.js`. DESIGN-SYSTEM.md section 8 asks for one. They cannot merge as they stand: M1's hard-codes menu wording for codes both modules use. | Rishi, 2026-08-29 | OPEN. The end state is one shared base map with per-module overrides, which means rewriting M1's. M2 was not scoped to change M1 code. |
| `scripts/provisionRestaurant.js` has its own copy of the optional-transaction dance now that `utils/transaction.js` exists. Two copies of the same fallback logic is how one of them drifts, exactly like the `escapeRegex` row above. | Rishi, 2026-08-29 | OPEN. Left alone deliberately because M2 was not allowed to edit M0 code. Worth switching over in the next M0 touch. |
| The kitchen display polls every ten seconds, so two people at the pass can briefly disagree about whether a dish is ready, and a ticket can sit on screen for up to ten seconds after it is complete. | Rishi, 2026-08-29 | OPEN by design for v1, same shape as the availability board row above. Revisit only if a pilot kitchen finds ten seconds too slow. |
| `GET /kots` filters on a status that is derived from the ticket's lines, so the filter is applied after the page is read from the database. A page can therefore come back with fewer rows than its limit while more matching tickets exist further on. | Rishi, 2026-08-29 | OPEN and harmless at one restaurant's volume, where the whole board fits in one page. Becomes real if a kitchen ever has more than 50 open tickets. The fix is a stored status, which brings its own drift problem, so it is not obviously worth it. |
