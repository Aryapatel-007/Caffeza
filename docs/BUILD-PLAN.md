# BUILD PLAN

This file holds the full scope, the security requirements, and the list of problems teams like ours usually miss.

It does not change often. When it does change, the change is made in the brain chat and logged in PROJECT-STATE.md.

Last updated: [DATE] by [NAME]

---

## 1. What we are building

A multi-tenant SaaS restaurant ERP for independent restaurants in Ahmedabad.

Multi-tenant means one running copy of the software serves many restaurants at once. Each restaurant sees only its own data.

Stack is MERN. MongoDB, Express, React, Node. The API is REST. One later module adds a separate Python service.

Two developers, Arya and Rishi. One person owns one module fully, backend and frontend.

---

## 2. Who it is for

Independent sit-down and quick-service restaurants in Ahmedabad. Roughly one to three outlets. Ten to forty staff.

They currently run three or four disconnected things at once. A billing app. A paper attendance register. A notebook for stock. WhatsApp for everything else.

They are not comparing us to nothing. They are comparing us to Petpooja. That sets the quality bar for billing and printing.

---

## 3. How the phases work

**Phase 1, M0 to M6.** The restaurant running in software. Nothing optional.

**Phase 1B, M7 to M15.** Everything a customer would notice the absence of within their first month, plus the AI wedge. This phase exists because the team has build time now and no pilot yet.

**Phase 2, pilot readiness.** Printing, security hardening, hosting, CA sign-off. Not modules. The work between a working codebase and a paying restaurant.

**Phase 3 and beyond.** Aggregators, WhatsApp, forecasting, multi-outlet. Gated on partner approval or on order history that does not exist yet.

Phase 1B is deliberately large. The honest risk is stated in section 6.

---

## 4. Phase 1: M0 to M6

### M0 Foundation: auth, roles, tenancy
Owner: Rishi.

Login, session handling, the user record, the restaurant record, the branch record, and the permission check every other module calls. Built in four parts: A plumbing, B auth and provisioning, C user management, D the staff PIN.

This is the module everything else sits on.

### M1 Menu Management
Owner: Arya.

Categories, items, price, variants, add-ons, tax rate per item, and a fast mark-unavailable toggle.

### M2 Order Taking and KOT
Owner: Rishi.

Tables, orders, order lines, firing to the kitchen, the kitchen display. The order copies price, item name, and tax rate at the moment the line is created.

### M3 Billing with GST
Owner: Rishi.

Turn a finished order into a bill. GST per slab. Discounts. Payments. Void with a reason. Gap-free bill numbers reserved inside the bill's own transaction.

Needs a chartered accountant to review the GST output before any pilot goes live.

### M4 Inventory with recipe deduction
Owner: Arya.

Ingredients with a stock level, recipes per dish, automatic deduction at KOT fire, an append-only ledger, idempotency by event key.

The hardest logic in Phase 1.

### M5 Employee Attendance
Owner: Arya.

Clock in and out, self-service or a shared-tablet PIN. Exact minutes worked. Manager corrections that are logged, never silent.

### M6 Reports and Dashboard
Owner: Rishi.

Sales by day, best sellers, slow hours, discount given away, tax summary, stock consumed, hours worked. All read-only. Owns no collection.

---

## 5. Phase 1B: M7 to M15

### M7 Restaurant Settings
Owner: Rishi. Depends on M0.

One typed, defaulted, audited place for configuration. Tax pricing mode, receipt text, inventory toggles. `settingsService` becomes the only way any module reads config.

Build early. Settings get more expensive to retrofit with every module stacked on top.

### M8 Audit Trail
Owner: Rishi. Depends on M3, M7.

`auditlogs` already exists and is write-only. M8 makes it readable, makes it structurally append-only, and closes the coverage gaps: user role changes, password and PIN resets, menu price changes, recipe changes.

The trust summary screen, ranking who voided the most money, is the most concrete thing in the sales pitch.

### M9 Purchase Orders and Vendor Management
Owner: Arya. Depends on M4.

Vendors, purchase orders, partial receipts, vendor payments, outstanding balances. Introduces cost price, which M4 deliberately left out.

### M10 Payments and UPI
Owner: Rishi. Depends on M3.

UPI QR on the bill screen, split payments across methods, payment reconciliation. No gateway, no money movement.

### M11 Payroll with Indian Statutory Compliance
Owner: Arya. Depends on M5, M7.

Salary structures, monthly runs, payslips. PF, ESI, Gujarat Professional Tax. Every rate is a setting. A run cannot be finalised until an owner attests that a chartered accountant has checked the configured rates.

### M12 Employee Self-Service
Owner: Arya. Depends on M11, M0.

A staff member reads their own attendance, their own corrections, their own payslips. No endpoint under `/me` accepts a user id in any form.

### M13 Company Finance Dashboard
Owner: Rishi. Depends on M3, M6, M9, M11.

Revenue against expenses, GST liability by month, labour cost as a share of sales, food cost from purchase data. Built last in this phase because it needs every other number to exist first.

### M14 Online Ordering and QR Self-Order
Owner: Rishi. Depends on M1, M2, M3.

A public ordering page per restaurant. A QR on the table opens the menu on the customer's phone and places an order straight to the KOT. Commission-free, which is a number that goes in a sales pitch.

The first module with an unauthenticated public surface. That is a different security posture from everything before it.

### M15 AI Service
Owner: Arya. Depends on M1, M4, M9.

A separate Python FastAPI service, called by the Node API over HTTP. Not part of the MERN app.

Five agents, all of which work with zero order history:

A1 menu ingestion, from a photograph of a paper menu.
A2 recipe drafting, from a dish name and the ingredient list.
A3 vendor bill ingestion, from a photograph of a supplier invoice.
A4 ask your data, in Gujarati or English.
A5 menu costing, from recipes and purchase prices.

**Every agent output goes to a human review screen before it is written.** Never straight into the database. An agent that silently sets a wrong price is worse than no agent.

Forecasting is deliberately absent. It needs months of order history that does not exist. These five fill the database forecasting will later need.

---

## 6. The honest risk in Phase 1B

Phase 1B is roughly three to four months of work for two developers, against six weeks for Phase 1.

The risk is not that it is too much work. It is that every module in it is a guess about what an Ahmedabad restaurant owner wants, and nobody has yet watched one use this software.

The mitigation costs nothing. Anshul and Om already know restaurant owners. Show them Phase 1 and the A1 menu-ingestion demo before building all of Phase 1B. Not to sell. To find out which four modules they actually care about.

That conversation will reorder this list, and it takes a week.

---

## 7. Phase 2: what must be true before a real restaurant uses this

None of this is a module. All of it blocks a pilot.

**Thermal printing.** Bill and KOT. Fixed character width, dish names that wrap without destroying the layout. Test on the printer model the pilot restaurant actually owns.

**Security hardening.** The refresh token moves from `localStorage` to an httpOnly cookie. The database credential is rotated. Atlas network access is locked down.

**Hosting and backups.** A provider, a region, automated backups, and someone who has actually restored from one.

**CA sign-off on GST**, on a real printed bill, before a customer sees it. And separately on payroll, before anyone is paid from it.

**Onboarding.** A restaurant starts with an empty menu and cannot take an order. Either A1 works or somebody types fifty dishes by hand.

**Support.** A way to reach a human at 9pm on a Saturday, and error monitoring so the problem is found before the owner phones.

---

## 8. Deferred, and why

| Module | Why not now |
|---|---|
| Zomato and Swiggy integration | Needs partner API approval. A vendor problem, not a code problem. Submit the application now, build when access lands. |
| WhatsApp ordering and marketing | Needs a Business API provider and template approval. Same. |
| Payment gateway | The restaurant keeps its existing UPI QR and card machine. M10 records the method used. We do not move money. |
| AI demand forecasting | Needs months of real order history. Cannot be built meaningfully today, and a demo of it would be fake. |
| Multi-outlet dashboards | `branchId` is on every record so the data model is ready. Only the screens are missing. Highest-value upsell later. |
| Offline mode | A web app cannot work offline in any way a restaurant would trust. This belongs to a later Android app. |
| Shift scheduling and rosters | Needs Gujarat working-hour rules encoded. Pairs with overtime, which M11 deliberately leaves at zero. |
| Loyalty and CRM | Needs M14 first, to have customers to track. |
| Table reservations | Matters for sit-down, nothing for quick-service. Priority depends on which restaurants say yes first. |

If a request maps to none of M0 through M15, say so plainly. Do not build it.

Saying yes to everything is how small teams finish nothing.

---

## 9. Build order and dependencies

```
M0 Foundation
 |
 +-> M1 Menu ---> M2 Orders/KOT ---> M3 Billing ---> M10 Payments
 |      |              |                  |
 |      |              +-> M4 Inventory --+-> M9 Purchasing
 |      |                     |                  |
 |      +---------------------+------------------+-> M14 Online Ordering
 |                            |
 +-> M5 Attendance -> M11 Payroll -> M12 Self-Service
 |
 +-> M7 Settings ---> M8 Audit
 |
 +-> M6 Reports ------------------+
 |                                +-> M13 Finance Dashboard
 +-> M15 AI Service --------------+
```

Rules that follow:

M0 finishes and is reviewed before anything else starts.

M7 is built early, before the modules that would otherwise need retrofitting into it.

**M7 and M8 must not run in parallel.** Both append to the same two enums on `auditlogs`.

M6 and M7 may run in parallel, provided M7 does not move `settings.businessDayStartsAtMinutes`.

M9 and M12 are independent of each other and may run in parallel.

M13 is built last in Phase 1B. It needs every other number to exist.

M15 is a separate service in a separate language. It blocks nothing in the MERN app.

---

## 10. Non-negotiable rules

These are the same rules that live in CLAUDE.md. They are repeated here because this file is the one we hand to anyone new.

**Tenancy.** Every database record has a `restaurantId`. Every single query filters by it. The only exceptions are the two documented tenancy roots, `restaurants` and `branches`, and the four pre-authentication lookups in M0 and M0-D.

**Money.** All money is a whole integer number of paise. Never a decimal. Never a float. Percentages are integers in basis points.

**Copied values.** An order line copies the price, the item name, and the tax rate at creation. A bill copies from the order line. Neither ever reads a live price from the menu.

**Server-side permissions.** Every endpoint checks permission on the server. Hiding a button in React is not security. It is a hint.

**No hard deletes.** Nothing is removed. Records are marked inactive, cancelled, voided, or superseded, with a reason and a user. The refresh-token TTL is the one documented exception.

**Bill numbers.** Server generated, sequential within a financial year, never reused, reserved inside the same transaction that writes the bill. Order, KOT, and purchase-order numbers may have gaps. Bill numbers may not.

**Append-only ledgers.** Stock movements and audit logs are never updated and never deleted. A mistake is corrected by a new, compensating entry.

**Secrets.** Live in `.env`. `.env` is in `.gitignore`. A committed secret is rotated, not just deleted from the next commit.

**Time.** Stored in UTC. Displayed in India Standard Time. The business day is not the calendar day and is configured per restaurant.

**GST.** Rates are data on a record or a setting. Never a constant in code.

**Statutory rates.** Every PF, ESI, and Professional Tax figure is a setting with a published default, and payroll cannot be finalised until a chartered accountant has confirmed them.

---

## 11. Security requirements

**Tenant isolation is the whole product.** If restaurant A can ever see restaurant B's data, we do not have a business.

`restaurantId` comes from the login token on the server. It is never taken from a request body, a query string, or a client-controlled header. If a client sends one it is stripped silently, not rejected, because an error tells whoever is probing that they found the right lever.

Every query goes through the tenant guard. One forgotten filter is a leak, so the guard throws rather than trusting anyone to remember.

An update by id confirms ownership through the filter, not by comparing after the fetch. A record belonging to another restaurant returns 404, never 403. A 403 confirms it exists.

**Passwords and PINs** are hashed with bcrypt, `select: false`, never returned, never logged. Everything touching a hash lives in `authService`.

**Tokens.** Access tokens are short-lived and stateless; `passwordChangedAt` invalidates them after a password change. Refresh tokens are stored hashed, rotate on use, and revoke the whole chain on reuse detection.

**Rate limiting** on login and refresh. Skipped in the test environment only.

**Input validation** on the server for every field on every endpoint. Unknown keys are rejected, not stripped, wherever a silent drop would cost someone an hour.

**Money and quantity fields** are validated as integers in a sane range before they reach the database.

**Audit trail** on anything involving money or trust: voids, discounts, attendance corrections, stock adjustments, role changes, price changes, recipe changes, settings changes. This is the feature that sells the product to an owner losing money to a dishonest cashier, and it is why M8 exists as its own module.

**Employee personal data** is a legal responsibility under India's Digital Personal Data Protection Act. We hold names, phone numbers, hours worked, and from M11 salaries and statutory identifiers, for other companies' staff.

No personal data in logs. No personal data in URL paths or query strings. No salary figure, PAN, or UAN in a log line. No bank account numbers stored anywhere.

**Public surfaces.** M14 is the first module with unauthenticated endpoints. It gets its own rate limits, its own input hardening, and no access to any authenticated read.

**The AI service** never writes to the database. It returns a proposal, a human approves it, and the Node API writes it.

**Error messages to the client are generic.** Stack traces and database errors go to the server log.

---

## 12. Problems teams like ours usually miss

Every one of these is cheap to handle now and expensive after a pilot has started. The ones marked SOLVED were open questions that are now closed; the reasoning is kept because it still matters.

**The price change problem. SOLVED.** Order lines copy price, name, and tax rate at creation. A bill copies from the order line.

**The two waiters problem. SOLVED.** One live order per table, enforced by a partial unique index on a derived boolean, plus optimistic concurrency with a `version` field. Note the finding: MongoDB's `partialFilterExpression` accepts `$in` and then silently enforces nothing.

**The business day problem. SOLVED.** `settings.businessDayStartsAtMinutes`, default 05:00 IST, per restaurant. `businessDate` is derived once at write time and stored as a `"YYYY-MM-DD"` string, never recomputed and never parsed back into a `Date`.

**The unit conversion problem. SOLVED.** Exactly three base units, `G`, `ML`, `PIECE`. Every quantity is an integer in the base unit. Purchase units are an entry convenience and one file does the conversion.

**The cancelled item problem. SOLVED.** `wasPrepared` on a cancelled order line, required when the line reached the kitchen. M4 reads the ledger rather than the flag, because a `PENDING` line has no deduction to reverse.

**The rounding problem. SOLVED.** Tax is rounded per slab, once, never per line and never on the total. CGST takes the extra paisa. Nothing outside `tax.js` computes tax, and M6 sums stored values rather than recomputing.

**The sequential number gap problem. SOLVED.** Bill numbers are reserved inside the bill's own transaction and the endpoint refuses to run without one. Order, KOT, and PO numbers use the gap-tolerant pattern deliberately.

**The idempotency problem. SOLVED.** Every stock movement carries a natural `eventKey` with a unique index. A retry is a no-op, not a second deduction. M9's receipts key on the receipt subdocument id, so three deliveries against one PO are three distinct events.

**The partial order problem. SOLVED.** Lines are added over time and fired in batches, each batch its own KOT.

**The staff turnover problem. SOLVED.** Users deactivate, never delete. M11 still pays a leaver for the days they worked.

**The open shift problem. SOLVED.** No module ever invents a clock-out time. M5 flags it, M6 reports zero minutes, M11 refuses to finalise a run containing one, M12 shows the employee their own.

**The printer problem. OPEN.** Thermal printers have fixed character width and a long dish name destroys the layout. M7 caps receipt header lines at 40 characters as a first defence. Nothing has been tested on real hardware.

**The timezone display problem. OPEN.** One shared helper per side. Forgetting to use it on one screen shows 2:30am for an 8:00am shift.

**The seed data gap. OPEN.** A new restaurant with an empty menu cannot take an order. M15's A1 agent is the intended answer. Until it works, somebody types the menu.

**The soft delete leak. RECURRING.** Once nothing is hard deleted, every list, every sum, and every aggregation has to exclude voided rows. M6 is where this bites hardest, and the exclusion belongs in the first `$match`, not a later filter.

**The stale settings cache problem.** `settingsService` caches within a single request only. A process-level cache with a time-to-live means an owner changes the business day boundary, sees nothing happen, changes it again, and two servers now disagree about which day a sale belongs to.

**The N+1 read problem.** Actor names in the audit log, corrector names in attendance, vendor balances in the vendor list, table occupancy on the floor screen. Every one of these fires one query per row unless it is deliberately batched.

**The trust-in-two-numbers problem.** Any figure computed in two places will eventually disagree by a rupee, and then nobody trusts either. Tax lives in `tax.js`. Money in `money.js`. Payroll in `payroll.js`. Units in `units.js`. Nothing outside them computes those things.

---

## 13. When is a module done

A module is not done because the code runs.

It has a section in API-CONTRACT.md and DB-SCHEMA.md, written and committed **before** the first line of that module's code. Every condition below is checked against that section, so without one they are all vacuous.

Every endpoint exists and returns the exact shape written there.

Every field exists with the right type, and every index in the schema exists.

Permission is checked on the server for every endpoint, tested by calling it with the wrong role.

Tenant isolation is tested with a valid token from restaurant A against a record id from restaurant B. It must return 404.

Server-side validation rejects bad input on every field, and rejects unknown keys where the contract says so.

The React screens work on the device type they will actually be used on. Tablet for order taking, phone for employee self-service, desktop for reports.

The invariants still hold: `skipTenantGuard` at four production hits, `process.env` only in `config/env.js`, no hash in any controller, no response body containing `passwordHash` or `pinHash`.

PROJECT-STATE.md is updated and pushed.

The other developer has read the code.

---

## 14. Known problems that outlive any single module

These belong to no module and will not be fixed by finishing one.

**The database credential was pasted in plaintext and has not been rotated.**

**The refresh token is in `localStorage`**, vulnerable to cross-site scripting. Pilot blocker.

**Atlas Network Access** has not been configured for every development machine.

**Every statutory rate in M11 is an unverified default.** Stays a known problem until a chartered accountant signs off for a real restaurant.

**GST pricing mode is assumed tax-exclusive** and needs the same CA confirmation. `settings.tax.pricingMode` is stored and deliberately not yet wired.

**No code has been tested on a real thermal printer.**
