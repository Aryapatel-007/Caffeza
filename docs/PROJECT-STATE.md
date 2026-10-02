# PROJECT STATE

This is the single source of truth for where the project stands.

Anyone starting any chat, any Claude Code session, or any Antigravity session reads this first.

Anyone finishing any session updates this before closing.

Last updated: 2026-10-02 by Rishi

---

## Current stage

Stage 9: **taking the product live at Caffeza, our first paying client.**

M0 to M7 are built. `docs/CURRENT-STATE-AUDIT.md` confirms the code is sound,
and lists what Caffeza still needs.

The plan is `docs/CAFFEZA-BUILD-PLAN.md`: prompts P00 to P21 in
`docs/prompts/`, then the checklist in `docs/GO-LIVE.md`.

Hosting is decided: a cloud server next to a separate Atlas cluster used only
by Caffeza, in the same region.

Next: P17, the audit trail and control reports.

---

## Module status

Status values: NOT STARTED, IN PROGRESS, BLOCKED, DONE

| ID | Module | Owner | Status | Notes |
|----|--------|-------|--------|-------|
| M0 | Foundation (auth, roles, tenancy) | Rishi | DONE | All four parts are on `main`. A/B/C shipped earlier; part D (httpOnly refresh cookie, staff PIN, cleanup) and email as a second login identity + chosen provisioning password merged with M5 in pull request #5. |
| M1 | Menu Management | Arya | DONE | Built by Rishi on 2026-08-29, not by the listed owner. See the decision log. Eleven endpoints with 42 tests, plus the builder and availability board screens. Arya still has to read it. |
| M2 | Order Taking and KOT | Rishi | DONE | Eighteen endpoints, four collections, 84 tests, five screens. Verified end to end against the live Atlas cluster. |
| M3 | Billing with GST | Rishi | IN PROGRESS | Feature-complete and verified end to end against the live Atlas cluster, including the GST arithmetic across all three slabs and the receipt wrap on a real long dish name. Not done under BUILD-PLAN section 9: the CA review of the GST output on a real printed bill and the real-thermal-printer test are pilot gates code cannot close. |
| M4 | Inventory with recipe deduction | Arya | IN PROGRESS | Feature-complete on `feat/m4/inventory` and verified end to end against the live Atlas cluster. Eleven endpoints, three collections, 51 tests, three screens. Built by Rishi, off the listed owner, the same crossing as M1 and M5. Not done under BUILD-PLAN section 9: Arya has not read it. Switched off for the Caffeza go-live by P02. |
| M5 | Employee Attendance | Arya | DONE | Built by Rishi, not the listed owner, the same crossing as M1. Merged to `main` on 2026-08-30 via pull request #5. Eleven endpoints including `POST /attendance/station/clock` wired to `authService.verifyPin`, and three React screens (the clock, the register, my hours). Marked DONE on the code and the tests; Arya's read is still outstanding and is in the known problems table. Switched off for the Caffeza go-live by P02. |
| M6 | Reports and Dashboard | Rishi | IN PROGRESS | Server and screens both built on `feat/m6/reports`: ten read-only endpoints, no collection, 34 tests, seven screens. Verified live against the seeded Atlas data, where its figures reconcile exactly with the independent Section 11 verification. Not done under BUILD-PLAN section 13: Arya has not read it. |
| M7 | Restaurant Settings | Rishi | DONE | Phase 1B's first module. Two endpoints, no new collection: `restaurants.settings` gains `tax`, `receipt` and `inventory`, every field with a schema default so there is no migration. `settingsService` is now the only way any module reads configuration. 27 new tests. Verified live against the Atlas cluster, including a genuine pre-M7 document reading back complete. Not done under BUILD-PLAN section 13: Arya has not read it. P02 added `settings.features` (inventory and attendance switches, enforced by `requireFeature`) and `settings.invoice` (financial-year or prefix numbering). |
| M8 | Audit Trail | Rishi | NOT STARTED | Specified in API-CONTRACT.md. Pulled forward for Caffeza. Built in P17 part A. |
| M10 | Payments | Rishi | IN PROGRESS | Specified in P07. Built in P08: configurable payment methods, frozen payment details, method corrections, discount reasons and funding. Arya's read outstanding. |
| M16 | Settlement and Day Close | Rishi | DONE | Day Close proven against the golden day in `tests/goldenDay.test.js`. No Charge (P08), On Hold accounts (P09), cash drawer, day figures, checks C1 C3 C4 C6 C8 C9, Day Close with the blind count, and the day lock (P10). Built by Rishi. Arya's read outstanding. |
| M17 | Delivery and Platform Orders | Arya | IN PROGRESS | Delivery orders in P06, payouts in P09. Built by Rishi, off the listed owner. Arya's read outstanding. |
| M18 | Kitchen Stations | Arya | IN PROGRESS | Stations, routing, kitchen screen filter and printing built in P05. Built by Rishi, off the listed owner. Arya's read outstanding. |
| M19 | Reports v2 | Arya | IN PROGRESS | Specified in P13. Engine and R19 built in P14; R2 to R10 in P15; R11 to R13 in P16; server only. Screens come in P18. Built by Rishi, off the listed owner. Arya's read outstanding. |
| M20 | Floor Plan and Look | Arya | NOT STARTED | P19, P20. |

---

## In scope right now

Caffeza go-live work only: prompts P00 to P21, listed in
`docs/CAFFEZA-BUILD-PLAN.md` section 3.

That covers changes to M0, M1, M2, M3 and M7, building M8 and M10, the new
modules M16 to M20, and the Phase 2 work from `docs/BUILD-PLAN.md` section 7.

M4 Inventory and M5 Attendance stay built, and are switched off for go-live.

M9, M11, M12, M13, M14 and M15 are deferred until after Caffeza is live.

If a request fits none of the prompts, say so, and do not build it.

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
| 2026-09-28 | Caffeza, a cafe in Gandhinagar, is the first paying client. Current work is re-planned around taking the product live there. | A real client with a real go-live date. Their setup is in `docs/CAFFEZA-PROFILE.md`. |
| 2026-09-30 | Continue on the existing codebase rather than start again | `docs/CURRENT-STATE-AUDIT.md`: M0 to M7 are sound, and five real Caffeza bills give the same final totals in `utils/tax.js` as in their current POS. |
| 2026-09-30 | Hosting: a cloud server in the same region as a separate Atlas cluster used only by Caffeza. The "Web app is online only" decision stands. | A box inside the cafe was considered and rejected. Atlas gives replica sets and backups, the host gives https, and the cafe gets a 4G backup internet line instead. Details in `docs/DEPLOYMENT.md`. |
| 2026-09-30 | Caffeza work reuses M8 and M10, and new modules start at M16 | `docs/BUILD-PLAN.md` section 5 already defines M7 to M15. Reusing them where they fit avoids two meanings for one number. |
| 2026-09-30 | M4 Inventory and M5 Attendance are switched off for the Caffeza go-live, by settings switches added in P02 | Neither is needed at launch, and both can be switched on later without code |
| 2026-09-30 | Reports only add up values frozen onto records. Bills gain the captain, covers, opened time, each line's category, and each line's share of the discount and GST (P03). | Category and captain reports must not change when a menu item moves category or a person is renamed, and must add up exactly to the bill totals |
| 2026-09-30 | Line shares use the largest remainder method, applied separately inside each tax rate on a bill | It guarantees the shares add up exactly. It reproduces Caffeza's own split on real bill C22276. |
| 2026-09-30 | Every report runs the balance checks C1 to C12 in `docs/RECONCILIATION-RULES.md`. A failed check shows a red strip and never hides the report. | "The reports cannot have errors" needs a test the owner can see, not a promise |
| 2026-09-30 | The golden day in `docs/TEST-DATA.md` is the fixture for every report and money test | One fixed day, with every expected number computed by the real tax code |
| 2026-09-30 | The Day Close cash count is blind by default. The manager enters the count, and only the owner sees expected cash and the difference. | Standard practice against cash theft. A setting can show the difference to managers. |
| 2026-09-30 | Platform delivery orders are billed at 0% GST through a tax treatment linked to the order source (M17). Pending CA confirmation. | Under section 9(5) the platform pays the GST on these orders. Caffeza's current POS already does this. |
| 2026-09-30 | The invoice prefix and starting number become settings (P02). The plan is to continue Caffeza's `CFA/C/` series. Pending CA confirmation. | Continuing their series keeps one unbroken run for the financial year |
| 2026-09-30 | Payment methods become a configured list, each with a kind (money in hand or platform) and a Tally code (M10) | Caffeza takes eight methods, and their accountant's Tally import depends on the codes |
| 2026-09-30 | No Charge orders get no invoice number. On Hold is a bill charged to a named account, not a payment method. (M16) | No Charge is not a sale. An On Hold bill is a sale whose money arrives later. |
| 2026-09-30 | Work is committed directly to `main`. No feature branches. This replaces the branch rule in `docs/CONVENTIONS.md` section 9. | Two developers, one owner per module, so branches add steps without preventing conflicts. Pull before starting and push after finishing still apply. |
| 2026-09-30 | `CLAUDE.md` loads only the short docs every session. The long specs are read in part, when a task needs them. | The old imports loaded about 7,800 lines into every session |
| 2026-09-30 | Session entries older than the newest ten moved to `docs/archive/SESSION-LOG.md`, and `docs/PROJECT-PLAN_1.md` moved to `docs/archive/` | This file said to keep about ten entries. The plan file only covered M0 to M2 and was out of date. |
| 2026-10-01 | Indexes are built by an explicit script on every deploy, never on boot and never by `syncIndexes`. The production server refuses to start while a declared index is missing. | `autoIndex` stays off in production so a live server never builds an index mid-service, and the boot check makes a missing guard impossible to miss. `syncIndexes` drops indexes it does not know about, so it is never used. |
| 2026-10-01 | `TRUST_PROXY` must be set explicitly in production, and `true` is refused. | Off behind a proxy makes one failed login lock out every device. `true` lets any client fake its address and skip the login limit. |
| 2026-10-01 | Client default dates use the business date, mirrored from `server/utils/time.js` in `client/src/utils/formatDate.js`. | The bills list showed nothing after midnight while the cafe was still billing the same business day. |
| 2026-10-01 | Inventory and attendance can be switched off per restaurant with `settings.features`. Enforced on the server by `requireFeature`. Inventory off also stops stock movements from firing and cancelling. | Caffeza launches without either, and a switched-off module must not quietly keep writing data. |
| 2026-10-01 | Invoice numbering is a setting: `FINANCIAL_YEAR`, today's format, or `PREFIX`, a prefix plus a running number that never resets. Prefix up to 7 characters, number up to 9 digits. | Caffeza continues its `CFA/C/` series. The limits keep every number within the GST rule of 16 characters. |
| 2026-10-01 | A new prefix series must start above the highest bill sequence used in the current financial year, a started series cannot be restarted, and switching back to financial-year numbering mid-year is refused. | All three protect the two unique indexes on bills, which would otherwise fail at the till. |
| 2026-10-01 | Removed `docs/archive/PROJECT-PLAN_1.md` and `docs/PROJECT-INSTRUCTIONS.md` | Stale or duplicated elsewhere. Git history keeps both. |
| 2026-10-01 | `requireFeature` runs after `tenant` and before `requireRole`, and with attendance off the dashboard's `staffOnShift` is `null`, not 0 | A waiter on a switched-off feature is told it is off, not that the role is wrong. Zero would claim nobody is on shift when nobody knows. |
| 2026-10-01 | `createBill` reads settings through `settingsService.getSettings(id, { session })`, fresh and inside its own transaction | The bill is numbered from the invoice series as it is at that moment. It also retires `billService`'s private read of `businessDayStartsAtMinutes`. |
| 2026-10-01 | The client reads `features` with one extra `GET /auth/me` after login, rather than adding it to the login response | The contract only names `GET /auth/me`. Links never draw and then disappear, because the read finishes before the user is set. |
| 2026-10-01 | Order lines freeze `categoryId` and `categoryName` when added. Bills freeze `captainId`, `captainName`, `guestCount` and `orderOpenedAt`. | Reports must not read the live menu or join back to orders. A sale belongs to the category it was ordered under. |
| 2026-10-01 | Each bill line stores its discount share, taxable value and GST share, split by the largest remainder method inside each tax rate, in `allocateLineShares` in `tax.js`. `computeBillTotals` is unchanged. | Category and item reports add up exactly to the bill. The split reproduces Caffeza's real bill C22276. |
| 2026-10-01 | Old bills are not back-filled with shares or categories. | Caffeza's production database starts empty, and demo data is rebuilt by `npm run seed:demo`. |
| 2026-10-01 | Cancel and void reasons are fixed code lists in `server/config/cancelReasons.js`, mirrored on the client, with an optional note that is required for Other. | Reports group by reason, and free text cannot be grouped. Caffeza already works with fixed reasons. |
| 2026-10-01 | An item cancelled after preparation writes `LINE_CANCELLED_AFTER_PREP`, and a whole-order cancel now writes `ORDER_CANCELLED`, which was listed but never written. | Thrown-away food and disappearing orders are the exceptions an owner needs to see. |
| 2026-10-01 | Ordering an unavailable variant or add-on is refused. | The kitchen switched it off for a reason. |
| 2026-10-01 | A whole-order cancel stores its code on the order only. The lines it cancels get the note and a null `cancelReasonCode`. | The order and line lists are different, and `WRONG_TABLE` is not a line reason. R15 reads the order's code for these lines. |
| 2026-10-01 | Lines are routed to stations through their category's current station when the order fires, one KOT per station. Unrouted lines go to the first active station. With no stations, firing works exactly as before. | Routing is about who cooks it today, not history. The KOT freezes the station it went to. |
| 2026-10-01 | KOT tickets are laid out as text on the server, like receipts, and printed from the browser through a hidden iframe. Paper width and auto-print are stored per device. | One layout to test. The printer belongs to the device, not to whoever signs in. |
| 2026-10-01 | `POST /orders/:id/fire` returns `kots`, every ticket created, and keeps `kot` as the first of them. | One fire can now make several tickets, and a client written before P05 still reads `data.kot`. |
| 2026-10-01 | Stations are managed on their own page, `/stations`, for OWNER and MANAGER, linked from Settings and the dashboard, rather than as a section inside the Settings page. | The P05 prompt asked for a Stations section on the settings page for OWNER and MANAGER, but that page is OWNER only. A manager runs the kitchen. |
| 2026-10-01 | The KOT ticket reads the guest count, customer name and the name of whoever fired it from the order and the user at print time, rather than adding fields to `kots`. | The spec froze only `stationId` and `stationName` on the KOT. These are printed, never added up. |
| 2026-10-01 | P05 was built by Rishi although Arya is its suggested owner, together with P06 to P15, at the user's request in one session. | Recorded so the crossing is not discovered in the git log. Arya's read of M17, M18 and M19 is owed before the next milestone. |
| 2026-10-01 | Delivery orders carry a platform and its order number, frozen on the order and the bill. A platform order number can be live on only one order at a time. | Orders are typed in by hand from a second screen, and entering one twice is the likeliest mistake. |
| 2026-10-01 | A platform order's lines are frozen at 0% GST, with the item's own rate kept in `menuTaxRateBps`, when `settings.delivery.platformCollectsGst` is true. The tax arithmetic is untouched. | Section 9(5): the platform pays the GST. Pending CA confirmation, so it is a setting. |
| 2026-10-01 | An order occupies a table only if it has one: `occupiesTable` is true for OPEN and READY_TO_BILL orders with a `tableId`, and false otherwise. The status-update hook reads the order's `tableId` when moving into an occupying status. | Found while building P06: every open takeaway carried `occupiesTable: true` with `tableId: null`, so a second open takeaway, or a second delivery order, collided on the one-order-per-table index and was refused. Verified against a real index before fixing. |
| 2026-10-01 | The 409 for a platform order entered twice is `DUPLICATE` with `existingOrderId` beside the message, the same shape `TABLE_OCCUPIED` uses. `DuplicateError` gained an optional `details` argument for it. | The counter opens the order that already exists instead of entering it again. |
| 2026-10-01 | Payment methods are a configured list per restaurant, each `IN_HAND` or `PLATFORM`, with a Tally code and an optional commission. Every payment freezes its method's name, kind, commission and business date. | Caffeza takes eight methods, and reports and payouts must not change when a method is renamed. |
| 2026-10-01 | No Charge is an order status, `NO_CHARGE`, with no bill and no invoice number. | It is not a sale, and must not touch the GST invoice series. |
| 2026-10-01 | On Hold is a bill status, `ON_ACCOUNT`, backed by an account ledger in `accountentries`. Collections are dated when the money arrives. | The sale happened on the day of the bill. The cash arrives on another day. |
| 2026-10-01 | Platform payouts are recorded as batches over a date range, and expected payout uses each payment's frozen commission. | That is how the platforms actually pay. |
| 2026-10-01 | Day figures are computed in one place, `computeDayFigures`, used by Day Close and by the R2 report. A closed day refuses every write that would change it, through one helper, `assertDayOpen`. | The printed close and the report must never disagree, and a closed day must stay closed. |
| 2026-10-01 | The Day Close cash count is blind for managers by default. | Standard practice against cash going missing. |
| 2026-10-01 | P07 details settled while writing the spec: the built-in methods `CASH`, `CARD`, `UPI` are created if missing and `OTHER` starts inactive; a method's `code` and `kind` never change; charging a bill to an account is OWNER and MANAGER only until Caffeza says otherwise; collections take `IN_HAND` methods only; a `REOPENED` day is open and can be closed again; expected payout rounds per payment, half away from zero, through `applyBasisPoints`. | Each was a choice the prompt left open. Written down so P08 to P10 build one answer rather than three. |
| 2026-10-01 | Services read the time only through `nowUtc()`, which tests can set with `setClockForTests`. Token times stay real. | The golden day happens at fixed times, including a payment after midnight. |
| 2026-10-01 | A test reads every file in `server/services/` and `server/controllers/` and fails on `new Date()` with no argument, except `tokenService.js`. | The same guard shape as P01's time display tests, so a real clock read cannot creep back into a service. |
| 2026-10-01 | `GET /auth/me` returns `discounts.cashierMayApplyPlatformDiscounts`, beside `features`. Added to the contract in P08. | P08 asked the bill screen to show a cashier the discount panel only when the setting allows, and a cashier cannot read `GET /settings`. The server still decides every discount. |
| 2026-10-01 | A payment `method` code the restaurant does not have is a 422 `PAYMENT_METHOD_NOT_ALLOWED`; a malformed one is still a 400. The old M3 test expecting a 400 for `CRYPTO` was changed on purpose. | Methods are configured now, so an unknown but well-formed code is the "not an active method of this restaurant" rule, not bad input. |
| 2026-10-01 | The receipt, the M6 discounts report and the audit line show a discount as its reason's label plus the note, through `discountReasonText`. The M6 test expecting the free text was changed on purpose. | From P08 `discount.reason` holds only the optional note, so printing it alone would print nothing, or `null` on a receipt. |
| 2026-10-01 | `POST /bills/:id/discount` moved from the managers route list to the till list, and `billPermissionService.assertCanDiscount` decides. | A cashier may apply a platform discount when the owner allows it, and one function, not a route table, holds that rule. |
| 2026-10-01 | Provisioning's no-transaction rollback now also removes the restaurant's payment methods. | Provisioning creates them, so a failed manual provisioning must not leave them behind. |
| 2026-10-01 | An account's outstanding balance is never stored. `accountService.outstandingFor` adds up the ledger every time, and `accountService` is the only writer of `accountentries`. | A stored running balance drifts the first time a write half-fails, and nothing notices. |
| 2026-10-01 | `oldestUncollectedDate` is worked out first-in, first-out: every DOWN amount covers the oldest UP entries first. | The spec named the field without the rule. FIFO is how a tab is actually settled. |
| 2026-10-01 | Voiding a bill now runs in one transaction, so a void of an On Hold bill writes `CHARGE_REVERSED` together with the void or not at all. | The ledger and the bill must never disagree about whether a charge stands. |
| 2026-10-01 | Payout expected amounts are computed on read, never stored, from each covered payment's frozen commission. A payment from before P08 with no payment business date reads as its bill's. | A commission changed later must not move an existing payout, and a stored figure could go stale. |
| 2026-10-01 | The old M6 payments report now lists any method code used beyond Cash, UPI, Card and Other, after those four. | Found in P09: after P08 a platform payment was silently missing from that report's total. |
| 2026-10-01 | `tests/tables.test.js` now waits for the counter index with `Counter.init()` before its concurrency test. | It failed two runs in three once P09 added three models whose indexes build at startup. The same fix `billNumber.test.js` already uses. |
| 2026-10-01 | `computeDayFigures` reads the day's records once into memory and adds them up in plain code with `sumPaise`, rather than in aggregation pipelines. | A day is a few hundred bills. One readable function is easier to check against TEST-DATA than a dozen pipelines, and it is the only place day figures are made. |
| 2026-10-01 | `averagePaise` was added to `server/utils/money.js`: a total divided by a count, rounded half away from zero. | CLAUDE.md keeps money arithmetic in `money.js`, and averages were the one division the day figures needed. |
| 2026-10-01 | C3 counts `chargedToAccountInPaise` on any bill that carries it, and unpaid only on UNPAID bills. C4 also covers ON_ACCOUNT bills. RECONCILIATION-RULES updated. | TEST-DATA section 6 says marking B09 PAID must fail C4 alone. Counting the charge only on ON_ACCOUNT bills would have failed C3 too. |
| 2026-10-01 | C6 and C8 look at every bill stored on the day or issued during its hours. | Storing B14 on 27 September must fail C8 alone, per TEST-DATA section 6; counted only by stored date, it would also open a gap in C6. |
| 2026-10-01 | The blind count also hides the C9 numbers and message, and the expected cash and difference on every history entry, not only the three fields the spec named. | C9's message reads "counted X, expected Y", which would have told a blind manager the answer. |
| 2026-10-01 | Day Close blockers and `noteRequired` arrive beside the message in `error`, not under `details`. The contract is updated. | That is where the error handler already puts extra fields, as `TABLE_OCCUPIED` does with `existingOrderId`. The note message never says by how much the count differs. |
| 2026-10-01 | The day lock is checked before any rule about the bill. Charging to an account also checks today; correcting a payment also checks the payment's own business date. | On a closed day the answer must always be 409 DAY_CLOSED, not a 422 about a paid bill. The charge entry is written today, and a correction changes the day its money arrived. |
| 2026-10-01 | An order waiting on an unpaid bill is reported once at Day Close, as the bill. | Listing it twice made one problem look like two. |
| 2026-10-01 | Voiding a cash entry or a payout asks for its reason inline (`features/settlement/InlineVoid.jsx`), not in a browser dialog. | A tablet at the till handles an inline field better than a modal prompt. |
| 2026-10-01 | Restaurants are set up from one JSON file and one menu CSV, through the real API, with a dry run by default. The scripts never delete anything, never set the invoice series, and never handle a password except the owner's, typed at the terminal. | Staging and production must be set up identically, and cutover-day changes stay deliberate. |
| 2026-10-01 | The setup file is validated with the server's own request schemas (settings, tables, stations, payment methods, accounts, users) before anything changes. | One definition of a valid value. A file that passes the dry run will not be refused halfway through `--apply`. |
| 2026-10-01 | The menu import takes `--config` and routes each category it touches through the setup file's `categoryStations` and `defaultStation`. The setup script routes categories that already exist. | The prompt routes categories from the setup file, but categories are created by the menu import, which runs second. Either order now ends with every category on its station. |
| 2026-10-01 | Both scripts resolve file paths from the folder `npm` was run in (`INIT_CWD`), not from `server/`. | `npm run setup:restaurant` from the repo root runs inside the server workspace, so `setup/caffeza.json` would otherwise not be found. |
| 2026-10-01 | `setup/caffeza-menu.csv` uses the golden day's category for every golden day item, and a category from the profile's list for the rest; the noodle bowl keeps Caffeza's own name, Chilli Garlic Chimichurri Noodle Bowl. | The prompt asked for the golden day's categories. Items it does not cover needed a category, and the profile's names are the ones staff know. The file is marked partial and is replaced by Caffeza's export. |
| 2026-10-01 | `scripts/seedDemo.js` wipes every collection in the model registry, not a fixed list. | Its list stopped at M4, so re-seeding left stations, payment methods, accounts and Day Close records behind. |
| 2026-10-01 | In production, Express serves the built client from `client/dist` on the same address as the API, with long caching for hashed assets and none for `index.html`. | One address for the cookie and CORS, and new deploys are picked up on the next page load. |
| 2026-10-01 | Fonts are served from our own server through `@fontsource`. | A slow outside font server must not delay the till on a 4G line. |
| 2026-10-01 | A host-neutral `Dockerfile` is the deploy unit. Index building is a release step, run before traffic moves. | Any host that runs containers works, and indexes are never built under live traffic. |
| 2026-10-01 | The helmet content security policy is unchanged. | Checked in a browser against the production build: no blocked script, style, font or image, the print iframe's inline styles apply, and the page makes no request to another site. |
| 2026-10-01 | `createApp` takes `{ serveClient, clientDist }` options; by default the client is served only in production. | So a test can serve a temporary folder without a real build, while development keeps Vite on its own port. |
| 2026-10-01 | Every M19 report returns one envelope: filter, filter sentence, open days, columns with glossary labels, rows, totals, checks and drill downs. Excel export is built on the server from the same data. | One shape for five build sessions, and the export can never disagree with the screen. |
| 2026-10-01 | R11 reports lines without stored shares as their own 'not recorded' row. | Old bills from before P03 must be visible, never silently dropped or estimated. |
| 2026-10-01 | Every M19 report has its own path under `GET /api/v1/reports/v2/`, including R3, R4 and R14, which REPORT-SPEC said would extend M6's paths. REPORT-SPEC section 4 is updated to match. | M6's endpoints return a different shape that M6's screens read until P18 replaces them. A second path keeps both working; P18 retires the M6 endpoints with their screens. |
| 2026-10-01 | Reports group people by stored user id. A captain's name is frozen on the bill; for the person who discounted, cancelled, voided or approved, the engine attaches the current name in one step, `personNames`, as a label only. Listed in the contract's section 11 as a field not stored. | No name is frozen for those people, and P13 forbids inventing fields. Names never affect a figure or a grouping. |
| 2026-10-01 | A new column type, `decimal2`, integer hundredths, for Turns per day. | The six types P13 suggested have no place for a ratio like 2.50 turns. |
| 2026-10-01 | GLOSSARY gained section 13, the column labels every M19 report uses that it did not yet define. | Every label on a report comes from the glossary, and 37 were missing. |
| 2026-10-01 | The report engine passes definitions a `ctx.personNames`, and is the only report code that reads `users`. A test fails if any file in `services/reports/definitions/` imports the MenuItem, Category, User or PaymentMethod model. | Names are labels; figures never come from live records. One door for names keeps that rule checkable. |
| 2026-10-01 | C11 checks live payout batches only, as RECONCILIATION-RULES scopes it, so the golden day, which records none, passes C11. TEST-DATA section 4's checks line is corrected to match. | P14 requires every check but C9 to pass on the golden day; the old TEST-DATA line expected a C11 warning for rate-not-set bills, which R6 lists instead. |
| 2026-10-01 | C7's break test points one of B13's lines at the cancelled Thecha Paneer Chilli rather than adding a new line. | Adding a line changes B13's totals, which also breaks C1 and C2; pointing an existing line at the cancelled one breaks C7 and nothing else, which is what the test is for. |
| 2026-10-01 | C12 ignores payment method rows that are zero in both the stored snapshot and the fresh figures. | Section B lists every active method, so adding or retiring a method after a close would otherwise read as a changed day. |
| 2026-10-01 | Day Close now runs every one-day check: C1 to C4, C5.4, C5.7, C6 to C11. | P14 asked Day Close to run every check that applies to one day. |
| 2026-10-01 | The client gained `downloadFile` in `api/client.js` for report exports. | Every network call lives in `src/api`, and a file needs the same auth headers and refresh as JSON. |
| 2026-10-01 | The Tally by-method block splits each bill's net sales, CGST and SGST across its payments and account charge with the largest remainder method, in `splitBillAcrossPayments` in `tax.js`. Both Tally blocks always total the same. | Caffeza's old export worked figures backwards from rounded amounts and its two blocks disagreed. |
| 2026-10-01 | R9's On Hold row uses the Tally code `P03`, a constant, until accounts carry their own code. | The contract names P03 and no account has a Tally code field; adding one is a schema change for its own prompt. |
| 2026-10-01 | R2 reads `dayCloseService.readDay` rather than computing anything itself, so the Day Close screen and the report are one calculation, and a closed day is the stored snapshot. | A second calculation is a second chance to disagree; C12 is what compares the snapshot with a fresh count. |
| 2026-10-01 | A sectioned report's Excel export stacks its sections on the Report sheet; R9 alone writes one sheet per section. | Tally imports one block per sheet. Every other report reads top to bottom like the screen. |
| 2026-10-01 | A visual-only restyle of the existing screens was done ahead of P20, at the user's request: a sidebar and top bar (`components/AppShell.jsx`) around every signed-in screen, warm paper and linen surfaces, white rounded cards with soft shadows, pill buttons, a split login and a shortcut home screen. No new feature, endpoint or label. | P20 (themes and the full redesign) is still owed after P18 and P19, and will build on this. The pasted designs' WhatsApp, loyalty, IRN, server-side printer and service charge ideas were left out: no prompt covers them, and the server never talks to a printer. |
| 2026-10-01 | The floor and the order screen were restyled from the user's pasted designs, ahead of P19 and P20. Same endpoints, no new field. | The parts with no data behind them were left out: dish photos, veg marks, table features, Ready to bill, captain and guests on the floor cards (the `GET /tables` occupancy block does not carry them), occupancy percent, turnaround, staff on duty and restock times. Also left out: "Taxes incl.", because prices are before GST, and Material icons from Google, because fonts are served from our own server. |
| 2026-10-01 | Seating a free table now asks for the guest count, and the order is created with `guestCount` | The client had never sent it, so every dine-in bill had null covers and average per cover had nothing to divide by. The contract already accepted it. |
| 2026-10-01 | Tapping a dish with no sizes or extras again raises the quantity of its unsent line rather than adding a second line. The card's minus at 1 opens the line cancel panel. | The kitchen ticket reads "3 × Latte" instead of three lines. An unsent line has no delete, and cancelling it takes a reason (P04). |
| 2026-10-01 | Switch table is now on the order screen, through the existing `PATCH /orders/:orderId/table`, offering free tables only | The endpoint and the client call existed since M2, but no screen used them. |
| 2026-10-02 | Share of net sales is computed in basis points after totalling, with the rounding remainder handed out by the largest remainder method, so the column always adds up to exactly 100%. | Caffeza's old category report measured each row against the top one. |
| 2026-10-02 | Averages of minutes (average table time, kitchen time) are sent as `decimal2`, integer hundredths kept to one decimal, a total of whole minutes over a count. Null when there is nothing to average. | The contract's `minutes` type is whole minutes and P16 asks for 60.5. Contract M19 section 14. |
| 2026-10-02 | R13's five slowest items are their own section, `slowestItems`, beside `kitchen`. | One table cannot hold a station row and a list of items without nesting. Contract M19 section 14. |
| 2026-10-02 | R11 by item groups by `menuItemId` and the frozen size, shown as "Item (Size)"; a definition may return its own `columns`, so the first column reads Item. | The contract shapes R11 as categories, or items within one category; P16 asked for both levels. |
| 2026-10-02 | R12 adds Discounted bills and Cancelled value, and R13 Items made, to GLOSSARY section 13. | Every label comes from the glossary, and these three were missing. |
| 2026-10-02 | The "items that sold nothing" toggle in R11 was not built. | It is not in the contract, and it would be the only read of `menuitems` in a report. |

---

## Open questions

Things not yet decided. Move them to the decision log once settled.

- The exact access token payload. `middleware/authenticate.js` currently reads
  `sub`, `role`, `restaurantId` and `branchId`. If API-CONTRACT.md names them
  differently, that one file changes.
- Everything listed in `docs/CAFFEZA-PROFILE.md` section 15, from Caffeza and from their CA.
- Which cloud host. Decided in P12, against the rules in `docs/DEPLOYMENT.md` section 2.
- Who applies platform discounts at the till. Our current rule allows only OWNER and MANAGER.
- Should kitchen station logins be able to cancel items? Caffeza's stations do it today. Our rule allows OWNER, MANAGER, CASHIER and WAITER only.
- May a cashier charge a bill to an On Hold account?
- May a cashier apply platform discounts? A setting exists, default off.

---

## What changed recently

Newest entry at the top. Keep the last ten or so, delete older ones.

### 2026-10-02 Rishi, P16 menu, captain and table reports

What was built or decided:
Three report definitions in `server/services/reports/definitions/`, registered in `registry.js`.
R11 Menu Performance (`menu`): categories, or items within one category with `categoryName`, from the line values frozen in P03; share of net sales by the largest remainder method, always 100.00%; rank; cancelled quantity and wasted value from cancelled order lines by the business date of the cancel; bills from before P03 in a "Not recorded" row with blank shares. Checks C2, C5.1, C5.2, C7.
R12 Captains (`captains`): by frozen `captainId`, named from the most recent bill; average per cover; average table time on paid dine-in bills only; discounted bills and discount; items cancelled and their value by `cancelledBy`. Check C5.3.
R13 Tables and Table Time (`tables`): sections `tables` (bills, covers, net sales, turns per day, average table time), `kitchen` (items made and average minutes from fired to ready, per station) and `slowestItems` (five per station). Check C5.4.
Shared helpers in `definitions/shared.js`: `tenantOf`, `instantsFor`, `minutesExpr`, `averageMinutes`. The engine now takes a definition's own `columns` when it returns them.

`tests/reportsMenu.test.js` builds the golden day once, closes 26 September, and checks TEST-DATA section 4 to the paisa: every category row, Pizza at 20.26% and the column at exactly 10000, B11 left out, Thecha Paneer Chilli 1 cancelled with ₹390.00 wasted and Cheesy Tornado ₹0.00, moving Mexican Bowl afterwards changes nothing, a pre-P03 bill in "Not recorded" with C5 still passing; every captain row with totals equal to R3, average table times 60.5, 59.0 and 53.0 and none for Ranjeet Paswan and Counter, Khuman Singh's 2 items cancelled for ₹750.00, renaming him afterwards changes nothing; the ten table times (578 minutes, average 57.8), Table 16 with one bill, Tables 30 and 35 with no table time. C5 broken by leaving out Pizza fails with ₹1,800.78 missing. Each workbook's totals equal the JSON, and only OWNER and MANAGER may read them.

Tests: 843 before, 859 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `definitions/menu.js`, `captains.js`, `tables.js`, `tests/reportsMenu.test.js`. Changed: `definitions/shared.js`, `reports/engine.js`, `reports/registry.js`, `reports/labels.js` and the client mirror, `tests/reportsDaily.test.js` (its role and export walks now include the three new reports), GLOSSARY section 13, TEST-DATA section 4, API-CONTRACT M19 R13 and section 14.
Endpoints: `GET /api/v1/reports/v2/{menu, captains, tables}`.

Anything the other developer needs to know:
`npm test` needs `server/.env.test`, which is gitignored; copy it from `server/.env.test.example` (it holds only `NODE_ENV=test`). It was missing on this machine.
The prompts P16 to P21, P20A, P20B and `DESIGN-SYSTEM-V2.md` were added to `docs/prompts/` in this session. `P10-cash-drawer-day-close-1.md` is a markdown copy of P10, which is done.

Anything now blocked or unblocked:
P17 can start. P18 has R11 to R13.

### 2026-10-01 Rishi, new delivery order on one screen (ahead of P20)

What was built or decided:
`/orders/delivery` is now one screen from the user's design: platform cards, the platform order number and an optional customer name, the menu, and a "Delivery order summary" beside it with steppers, item total and the 0% GST note. The order is a draft on the screen until Send to kitchen, which creates it with its lines in one `POST /orders` (the contract already takes `lines` on create) and then fires it; Save without sending creates it only; Clear throws the draft away. A platform number already on an open order is refused by the server, and the screen links to that order. The summary prices are the menu's, for reading out; the server prices the lines and the bill decides GST.

Left out: Own Delivery (not a platform in `config/platforms.js`), rider details and ETA, live queue counts, Scan QR, "Aggregator Bridge", dish photos and codes, packaging charge, an order-level discount (discounts are on the bill), Print KOT (the kitchen screen prints) and rider note.

Checked in headless Chromium as the demo cashier: Swiggy, three dishes including a Half size, sent to the kitchen and landing on the order; the same number again refused with the link; no sideways scroll at 390 wide; no page errors. Lint and build pass.

### 2026-10-01 Rishi, discount drawer, bills ledger and receipt preview (ahead of P18 to P20)

What was built or decided:
From the user's pasted designs, client only, same endpoints.
Discount drawer (`DiscountPanel.jsx`, wider `PanelShell`): percent or amount toggle, 5/10/20/50% presets showing the rupee amount, the keypad, the fixed reasons, Paid for by on platform reasons, and a preview of item total and discount. It shows no GST or new bill total: those come from the server once the discount is applied, because tax arithmetic lives only in `tax.js`. The percent preview rounds half away from zero, display only.
Bills (`BillsListPage.jsx`) is now a ledger: bill total, bills, unpaid bills and voided figures from `meta.totals` (the unpaid count is `meta.total` of the same list filtered to unpaid); a table with invoice number, time issued, table, captain, paid with, status and bill total; status pills, dates, include voided, paging, and a search over the page on screen. The selected bill shows beside it, read with `GET /bills/:billId`, with Take payment or Open bill and a link to the receipt.
Receipt preview: a new screen at `/bills/:billId/receipt` showing the server's receipt text in a paper slip at the device's width, the 58 or 80 mm choice (the same device setting as This device), Print bill, and the bill's figures. Linked from the bill screen and the ledger.

Left out: the manager PIN on discounts (the server already limits discounts by role, and there is no PIN check for it), WhatsApp e-bill, PDF, kick drawer, printer status and roll level, copies, IRN, UPI and loyalty QR codes, Wi-Fi line, "Print estimate", export and percent-change figures.

Checked in headless Chromium on the local demo data: a takeaway billed, 10% Regular guest applied (₹209.00 item total, ₹20.90 off, bill ₹205.00 from the server), the receipt at 48 characters, and the ledger with that bill selected. No page errors. Lint and build pass.

### 2026-10-01 Rishi, takeaway, delivery, kitchen and bill screens restyled (ahead of P18 to P20)

What was built or decided:
From the user's pasted designs, client only, same endpoints and fields.
Takeaway and Delivery start pages are cards. On a wide screen a takeaway or delivery order shows the menu with a "Current order" ledger beside it, instead of the bottom bar; on a phone the bar stays.
Kitchen board: a dark-on-linen header with station tabs, an open count, a late count and the time; ticket cards with a coloured top bar (under 10 minutes green, 10 to 15 gold, over 15 red, display constants only), the order type, big lines, a tick per line and "All ready · complete".
Bill screen: the bill as a receipt card on the left, and payment on the right, beside it. `InlinePayment.jsx` replaces the payment slide-over: method tiles with the first allowed one selected, a reference field, and the keypad starting at what is still owed. Discount, charge to account, print and void are buttons in the header; their panels are unchanged.

Left out, with no data or rule behind them: the designs' rider details, Own Delivery, "Aggregator Bridge", Scan QR, dish photos and codes, customer attach, GSTIN, WhatsApp e-bill, split by seat, a UPI QR and Quick UPI buttons (no UPI QR for go-live), captain and average ticket time on the kitchen board (KOTs do not carry the captain), and "Inclusive of all taxes" (prices are before GST).

Checked by hand in headless Chromium against the local demo data: a delivery order and a takeaway order sent to the kitchen, both tickets shown, a takeaway billed and paid in cash. Lint and build pass. No server change, so the tests were not rerun. `PaymentPanel.jsx` is no longer used by the bill screen.

### 2026-10-01 Rishi, floor and order screen restyle (ahead of P19 and P20)

What was built or decided:
The floor (`/floor`) and the order screen were rebuilt from the user's pasted designs.
Floor: Free and Seated counts, section filter pills, table cards (seated cards have a chana edge, minutes since the order opened, the order number and the item total), and a footer with tables seated and the open tables' item total.
Tapping a free table opens `SeatTablePanel`: 1 to 7, or 8+ with a stepper up to 100. "Start order" creates the order with `guestCount`.
Order screen: a header card with back, place, guests, order number and opened time, the menu search, and Switch table (`MoveTablePanel`). Category pills with counts and dish cards; a stepper on a dish's unsent line.
A dark order bar at the bottom shows items, the item total before GST, Review order and Send to kitchen. Review order is a slide-over with the lines, No Charge and cancel order.
Once an order is waiting for the cashier or closed, the lines are the page, with the bill button. `LineOptionsPanel` has size cards, extras rows, a note, and the quantity and "Add to order" with the line total in the footer.

Checked by hand in headless Chromium against the local database, after `npm run seed:demo` rebuilt the demo restaurants there. Steps: seated a table with 2 guests, added dishes, raised a quantity, opened sizes and Review order. Checked at 1440 and 390 wide, with no page errors and no sideways scroll on a phone. Lint and build pass. No server change, so the tests were not rerun.

Files or endpoints touched:
Client only. New: `features/orders/SeatTablePanel.jsx`, `MoveTablePanel.jsx`. Changed: `FloorViewPage.jsx`, `OrderScreenPage.jsx`, `MenuPicker.jsx`, `LineOptionsPanel.jsx`, `OrderLineList.jsx`.

Anything the other developer needs to know:
Showing Ready to bill, guests or the captain on a floor card needs the `GET /tables` occupancy block to carry them. That is a contract change, for P19.
Switch table and the guest count were not tried on a real tablet.

Anything now blocked or unblocked:
Nothing.

### 2026-10-01 Rishi, early restyle (ahead of P20)

What was built or decided:
Home (`/dashboard`) was then rebuilt from the user's pasted design: greeting card, four live figures (bill total, bills, open orders, unpaid bills) from the M6 dashboard read for OWNER and MANAGER, quick actions, seated tables with order totals from the floor read, and top sellers. Every number is read from the server; the design's photos, sparklines, percent-change figures and rush-hour banner were not built because no data backs them.
Visual only. `components/AppShell.jsx` (sidebar by role and feature switch, top bar with date and time, narrow-screen link strip) wraps every route behind `ProtectedRoute`, except the clock screen. Tokens in `index.css` gained linen layers, shadows and soft tints; `paper` is now warmer. Every `border-2 border-ink` became a soft border with a card shadow, grey `slate-*` classes map to the tokens, `Button` and `Input` are pill and rounded, `PanelShell` is a white slide-over, the login is split, the home screen is greeting plus shortcuts, and floor tables are cards. Labels and behaviour are unchanged.

Not done: P20 proper, `docs/DESIGN-SYSTEM-V2.md`, a dark or themed mode, per-screen layouts from the pasted designs (order, kitchen, bill, payment) beyond colour, radius and borders. Lint and build pass; checked by eye in Chrome on home, floor and bills.

### 2026-10-01 Rishi, P15 daily, money and GST reports

What was built or decided:
Nine report definitions in `server/services/reports/definitions/`, registered
in `registry.js`: R2 Day Close (`day-close`, through `readDay`, blind count
applied, C12 when closed), R3 Sales by Day (every date, zeros, `compare=previous`),
R4 Hours and Weekdays (24 hours and a weekday by hour grid), R5 Payments
(OWNER only, one column per method plus On Hold, Unpaid and collections),
R6 Platform Money (payouts with expected from frozen commission, and uncovered
payments with "Rate not set"), R7 Cash Till (OWNER only, stored close or the
day so far), R8 GST (sections A to E), R9 Tally Export (a file only, two Tally
sheets, refuses with 422 `CHECK_FAILED` while an ERROR check fails) and R10
Invoice Register (voided included, "Missing number" rows, paged).

`splitBillAcrossPayments` is new in `server/utils/tax.js`: one part per payment,
then On Hold, then Unpaid, net sales, CGST and SGST each split by the largest
remainder method and checked to add back. Shared column helpers in
`definitions/shared.js`; `CheckFailedError` in `utils/errors.js`; Figure, Count
and Value labels in GLOSSARY section 13 and both labels files. The engine gives
definitions `ctx.paymentMethods` (names and order only) and supports
`requiresPassingChecks` and `sheetPerSection`. `buildGoldenDay` takes a
`commissions` option.

`tests/reportsDaily.test.js` builds the golden day once with Swiggy at 2000
basis points, closes 26 September as the Manager with ₹3,400.00 counted, and
checks every report against TEST-DATA sections 4 and 5 to the paisa. Broken on
purpose: B06's stored total (C12 fails, R2 still shows the snapshot), B03's
round-off (R9 refuses and names C1), and B11 deleted (R10 shows the missing
number, C6 fails). The split has unit cases and a property test over 1,000
seeded random bills. Every report's workbook opens with its sheets, and every
role gets 200 or 403 as the permission table says. M6's tests are unchanged and
pass.

Tests: 820 before, 843 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `definitions/` dayClose, salesByDay, hours, payments, platformMoney,
cashTill, gst, tallyExport, invoiceRegister, shared; `tests/reportsDaily.test.js`.
Changed: `utils/tax.js`, `utils/errors.js`, `reports/engine.js`,
`reports/exportXlsx.js`, `reports/labels.js`, `reports/registry.js`, client
`features/reports/labels.js`, `tests/helpers/goldenDay.js`, GLOSSARY section 13,
API-CONTRACT M19 section 13.
Endpoints: `GET /api/v1/reports/v2/{day-close, sales-by-day, hours, payments,
platform-money, cash-till, gst, tally-export, invoice-register}`.

Anything the other developer needs to know:
No screens yet; P18 builds them on these envelopes. The Tally workbook was
checked by opening it with exceljs in the test, not in Excel or Tally; the
accountant should import one before go-live. Commission rates are TO CONFIRM,
so R6 lists Caffeza's platform payments as "Rate not set" until they are set.

Anything now blocked or unblocked:
P16 and P17 can start. P18 has its daily and money reports.

### 2026-10-01 Rishi, P14 report engine

What was built or decided:
`server/services/reports/`: `engine.js` (`runReport` in the nine contract
steps, the filter sentence, open days, `personNames`), `labels.js` (88 glossary
terms, mirrored on the client), `params.js` (every contract filter),
`registry.js`, `exportXlsx.js` (four sheets, money in rupees with the Indian
format, the file name rule), and `definitions/bills.js`, R19 with every filter,
totals across pages and `readBillDetail` with the order's timeline. Routes:
`GET /api/v1/reports/v2/bills` and `/reports/v2/bills/:billId`; M6 routes
untouched.

`reconciliationService.js` is complete: C2, C5, C7, C10, C11, C12 added, and
`runRangeChecks` runs C1, C2, C3, C4, C6, C7, C8, C10, C11 and C12 over a range,
one result per check. Day Close runs every one-day check.

Five new indexes, each starting with `restaurantId`: payments by business
date and a series in sequence order on `bills`; cancelled lines by time,
cancelled orders by time, and No Charge orders by date on `orders`.
`npm run db:indexes` created them locally, and a second run created none.

Client: `/reports/bills` reads every filter from the address, shows the filter
sentence, open-day banner, check strip, table, paging and the totals row, and
has an Excel button; `/reports/bills/:billId` shows lines with shares and the
timeline. Shared cells, banner and strip in `features/reports/v2/`.

Every row of TEST-DATA section 6 is broken on purpose in
`tests/reportEngine.test.js` and fails exactly its own check (C3's row also
fails C4, as TEST-DATA says). The opt-in speed test, `PERF=1`, ran R19 over a
full year of 66,430 bills with its totals in 233 ms.

Checked by hand in Chrome on a local production build: a Bill List filtered by
captain opened from its address, and a bill's timeline. The Excel button was
not clicked in the browser, because that downloads a file; the workbook is
opened and checked in the test instead.

Tests: 793 before, 820 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `server/services/reports/*`, `routes/reportV2Routes.js`,
`controllers/reportV2Controller.js`, tests `reportEngine.test.js` and
`reportPerf.test.js`, client `api/reportsV2.js`, `features/reports/labels.js`,
`features/reports/v2/*`. Changed: `reconciliationService.js`, Bill and Order
models (indexes), `tests/helpers/goldenDay.js` (`addNextDay`),
`api/client.js` (`downloadFile`), `App.jsx`, server `package.json` (exceljs).

Anything the other developer needs to know:
A new report is one file in `definitions/` plus a line in `registry.js`.
Port 5000 on this machine was held by another server process during the hand
check, so the check ran on 5055.

Anything now blocked or unblocked:
P15, P16 and P17 can start.

### 2026-10-01 Rishi, P13 reports spec

What was built or decided:
The M19 contract, docs only: `docs/API-CONTRACT.md` section "M19 Reports v2".
Principles (M6's carried over by reference, plus nine M19 rules), the shared
request and its filters, the shared envelope shown filled in for R3 on the
golden day, column types, drill downs, sections, open days, the filter
sentence's exact construction, the checks per report, the Excel export, every
report R1 to R19 with its endpoint, roles, filters, columns and the stored field
each reads, examples for R2, R5, R11 and R15 from the golden day, the indexes
P14 adds, the permissions table, a new `CHECK_FAILED` code, and the fields still
not stored.

REPORT-SPEC section 6 now points at the contract, and R3, R4 and R14 name their
new paths. RECONCILIATION-RULES section 3 matches the contract. GLOSSARY gained
section 13, the column labels. CONVENTIONS gained `CHECK_FAILED`.

The four self-checks:
1. Every number in TEST-DATA section 4 has a home: R2's sections A to H carry
   all of A, B, D, E, F, G and H (`sales.*`, `money.*`, `cash.*`, `orderTypes`,
   `gst`, `controls.*`, `invoices`); the category table is R11's rows; the
   captain table is R12's rows.
2. Every column names a stored field that DB-SCHEMA has, except the names of
   people other than the captain, listed in the contract's section 11.
3. R19's filters express every drill down from every other report; cash
   lines, payouts, cancelled lines and No Charge open their own records.
4. Not stored: the name, at the time, of whoever discounted, cancelled, voided
   or approved. Not invented; shown as the current name.

Files or endpoints touched:
Docs only. No code.

Anything the other developer needs to know:
M19 paths are `/api/v1/reports/v2/{name}`. A definition never reads `users`,
`menuitems`, `categories` or `paymentmethods`; names come through the engine.

Anything now blocked or unblocked:
P14 can start.

### 2026-10-01 Rishi, P12 cloud deployment

What was built or decided:
In production `createApp` serves `client/dist` after the API routes: `/assets/`
for a year as immutable, `index.html` with `no-cache`, and `index.html` for any
other GET outside `/api/`, so reloading `/day-close` works. An unknown `/api/`
address still gets the JSON 404. A production start refuses with "The client has
not been built. Run npm run build, then start again." when the build is missing.

IBM Plex Sans (400, 500, 600) and Mono (400 to 700) now come from
`@fontsource`, imported in `main.jsx`; the Google Fonts lines are gone.
`GET /api/v1/health` gains `release`, from the new optional `RELEASE_VERSION`.
A host-neutral `Dockerfile` (Node 20 build, Node 20 slim run as the `node` user,
health check on `/api/v1/health`, no secret, no index building on start) and
`.dockerignore`. `npm run smoke -- --url <address>` makes only reading requests
and prints one line per check. `docs/DEPLOYMENT.md` sections 2 and 6 and a new
section 13 are the runbook.

Verified by hand: built the client, built indexes, and started with
`NODE_ENV=production` against a local replica set on port 5000. The smoke check
passed every line, with the https check skipped for http, and health showed the
release. In Chrome the production build showed no CSP violation, no request to
another site, both font families loaded from our own server, and a reload of
`/day-close` landed in the app. Docker is installed on this machine but its
daemon was not running, so `docker build .` was not run.

Tests: 784 before, 793 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `Dockerfile`, `.dockerignore`, `server/scripts/smokeCheck.js`,
`server/tests/production.test.js`. Changed: `server/server.js`,
`server/config/env.js`, `server/controllers/healthController.js`,
`server/tests/app.test.js` (the health field list gains `release`, on purpose),
`.env.example`, both `package.json` files and the lock file, `client/index.html`,
`client/src/main.jsx`, `client/package.json`.

Anything the other developer needs to know:
Arya brings staging up by hand from the checklist below. A coding session must
not: these need accounts, payment and judgement.
1. Choose the host, against docs/DEPLOYMENT.md section 2. It must give a fixed outbound address, or stop and decide together.
2. Create the Atlas staging cluster, docs/DEPLOYMENT.md section 3, allowing only the host's address.
3. Buy the domain and point caffeza-staging.<domain> at the host.
4. Set every environment variable from docs/DEPLOYMENT.md section 4 on the host. NODE_ENV=production, TRUST_PROXY per the host's documentation, CLIENT_ORIGIN exactly the staging address, new secrets from openssl rand -base64 48.
5. Deploy. Run npm run db:indexes against staging. Start.
6. Run npm run smoke -- --url https://caffeza-staging.<domain>. Every line must pass.
7. npm run provision:restaurant against staging for Caffeza's owner.
8. npm run setup:restaurant and npm run import:menu, dry run first, then --apply.
9. Sign in on a phone and on a laptop. Open a table, fire, bill, print, pay, close the day.
10. Set up the uptime monitor on /api/v1/health.
11. Record the host choice and these dates in docs/PROJECT-STATE.md.

Anything now blocked or unblocked:
P13 can start. Staging waits on the checklist.

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
| Ordering an out-of-stock **variant** of an available item is not blocked. `buildLineSnapshots` checks that the menu item is active and available, exactly as section 9.3 of the M2 brief lists, and that list does not mention `variants[].isAvailable`. So "Paneer Tikka available, Half plate marked out of stock" still lets a Half plate onto an order. | Rishi, 2026-08-29 | FIXED in P04. Add-ons are checked too. |
| `services/billService.js` and `services/operationsReportService.js` still read `restaurant.settings.businessDayStartsAtMinutes` directly, each with its own query and its own default, rather than going through `settingsService`. The three controllers that did the same were migrated by M7; these two were not. | Rishi, 2026-08-31 | HALF FIXED in P02: `billService.js` now reads through `settingsService`. `operationsReportService.js` still reads directly. OPEN and harmless today: both reads are correct and return the same number. Left alone deliberately because they are M3 and M6 files and M7 had no mandate to touch M3's. The point of `settingsService` is that there is one place, so this should be finished on the next M3 or M6 touch. Two lines. |
| M2 has a second error copy map, `client/src/features/orders/errorCopy.js`, alongside M1's `features/menu/errorCopy.js`. DESIGN-SYSTEM.md section 8 asks for one. They cannot merge as they stand: M1's hard-codes menu wording for codes both modules use. | Rishi, 2026-08-29 | OPEN. The end state is one shared base map with per-module overrides, which means rewriting M1's. M2 was not scoped to change M1 code. |
| `scripts/provisionRestaurant.js` has its own copy of the optional-transaction dance now that `utils/transaction.js` exists. Two copies of the same fallback logic is how one of them drifts, exactly like the `escapeRegex` row above. | Rishi, 2026-08-29 | OPEN. Left alone deliberately because M2 was not allowed to edit M0 code. Worth switching over in the next M0 touch. |
| The kitchen display polls every ten seconds, so two people at the pass can briefly disagree about whether a dish is ready, and a ticket can sit on screen for up to ten seconds after it is complete. | Rishi, 2026-08-29 | OPEN by design for v1, same shape as the availability board row above. Revisit only if a pilot kitchen finds ten seconds too slow. |
| `GET /kots` filters on a status that is derived from the ticket's lines, so the filter is applied after the page is read from the database. A page can therefore come back with fewer rows than its limit while more matching tickets exist further on. | Rishi, 2026-08-29 | OPEN and harmless at one restaurant's volume, where the whole board fits in one page. Becomes real if a kitchen ever has more than 50 open tickets. The fix is a stored status, which brings its own drift problem, so it is not obviously worth it. |
| Unique indexes are never built in production. `config/database.js` turns `autoIndex` off when `NODE_ENV=production`, and no script runs `syncIndexes`. On a fresh production database the guards against duplicate bills and double-booked tables would not exist. | Audit, 2026-09-29 | FIXED in P01. |
| `trust proxy` is off, so behind a host's proxy every device shares one address, and one failed login rate-limits everyone | Audit, 2026-09-29 | FIXED in P01. |
| `npm run build` crashes with "Invalid URL" when `.env` is missing, from `client/vite.config.js` | Audit, 2026-09-29 | FIXED in P01. |
| The kitchen display shows ticket times in the tablet's own time zone, `KitchenDisplayPage.jsx` line 221 | Audit, 2026-09-29 | FIXED in P01. |
| The hourly report hardcodes `'Asia/Kolkata'` instead of reading `DISPLAY_TIMEZONE`, `salesReportService.js` line 195 | Audit, 2026-09-29 | FIXED in P01. |
| `scripts/seedDemo.js` can run against a production database | Audit, 2026-09-29 | NOT A PROBLEM. `assertSafeToSeed` already refuses outside development and test, before connecting. Confirmed in P01. |
| The database-backed tests were not run during the audit. Only the money, tax and unit tests were. | Audit, 2026-09-29 | DONE in P01: 578 passing, 0 failing. Before P01 changed anything: 551 passing, 0 failing. |
| Client date filters assume the business day starts at 5:00 AM, because cashiers cannot read `GET /settings`. If a restaurant changes `businessDayStartsAtMinutes`, default dates on the bills list, attendance register and report screens will be off. Caffeza uses 5:00 AM. | Arya, P01 | OPEN |
