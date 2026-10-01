# P00 Adopt the Caffeza docs

**Model:** Sonnet, medium effort.
**Branch:** none. Work and commit directly on `main`.
**Owner:** Arya.
**Depends on:** nothing.

---

## What to do, in one sentence

Adopt the new Caffeza planning docs into the repo, and update `docs/PROJECT-STATE.md` to the new plan, without changing any code.

## Module

None. Docs only.
Endpoints, database fields, permissions and validation: this task creates none.

## Why

Caffeza, a cafe in Gandhinagar, is our first paying client.
The work has been re-planned around taking the product live there.
The new plan lives in new files under `docs/`, and `CLAUDE.md` has been replaced.
`docs/PROJECT-STATE.md` still describes the old plan, so this session brings it up to date.

---

## Step 0. Check before starting

1. Run `git status` and `git branch --show-current`, and show me both.
2. You should be on `main`, pulled, with these files present and untracked or modified. They were copied in by hand before this session:

```
CLAUDE.md                          (modified, the replacement)
docs/CURRENT-STATE-AUDIT.md
docs/CAFFEZA-PROFILE.md
docs/GLOSSARY.md
docs/REPORT-SPEC.md
docs/RECONCILIATION-RULES.md
docs/TEST-DATA.md
docs/CAFFEZA-BUILD-PLAN.md
docs/DEPLOYMENT.md
docs/GO-LIVE.md
docs/PROJECT-INSTRUCTIONS.md
docs/prompts/P00-adopt-caffeza-docs.md
```

3. If any of them is missing, stop and tell me which.
4. Other changes you may also see, and what to do with them:

| Change | What to do |
|---|---|
| `docs/API-CONTRACT.md` modified, and the change is the "M8 Audit Trail" section | Commit it on its own, first, with the message `add m8 audit trail spec` |
| `docs/M1-SUMMARY.md` untracked | Commit it with the other docs |
| `docs/PROJECT-PLAN_1.md` untracked | Handled in step 3 |
| Anything else | Stop, list it, and wait for me |

5. Stay on `main`. Do not create a branch.

---

## Step 1. Read

Read the new `CLAUDE.md`, `docs/CAFFEZA-BUILD-PLAN.md` and `docs/CURRENT-STATE-AUDIT.md` in full.
Read `docs/PROJECT-STATE.md` in full.

---

## Step 2. Update `docs/PROJECT-STATE.md`

Edit it in place.
Keep every existing line unless this step says otherwise.
Never delete a decision log line.

**2a. The date line.**
Change it to: `Last updated: 2026-09-30 by Arya`

**2b. Replace the whole "Current stage" section body with this:**

```
Stage 9: **taking the product live at Caffeza, our first paying client.**

M0 to M7 are built. `docs/CURRENT-STATE-AUDIT.md` confirms the code is sound,
and lists what Caffeza still needs.

The plan is `docs/CAFFEZA-BUILD-PLAN.md`: prompts P00 to P21 in
`docs/prompts/`, then the checklist in `docs/GO-LIVE.md`.

Hosting is decided: a cloud server next to a separate Atlas cluster used only
by Caffeza, in the same region.

Next: P01, production safety.
```

**2c. The module status table.**
Keep every existing row exactly as it is.
Append this sentence to the end of the Notes cell of the M4 row, and of the M5 row: `Switched off for the Caffeza go-live by P02.`
Then add these rows at the bottom of the table:

```
| M8 | Audit Trail | Rishi | NOT STARTED | Specified in API-CONTRACT.md. Pulled forward for Caffeza. Built in P17 part A. |
| M10 | Payments | Rishi | NOT STARTED | Pulled forward for Caffeza with an adjusted scope: configurable payment methods including platforms. No UPI QR for go-live. P07, P08. |
| M16 | Settlement and Day Close | Rishi | NOT STARTED | No Charge, On Hold accounts, cash drawer, Day Close. P07 to P10. |
| M17 | Delivery and Platform Orders | Arya | NOT STARTED | Entered by hand. 0% tax on platform orders. P06. |
| M18 | Kitchen Stations | Arya | NOT STARTED | Stations, category routing, one KOT per station. P05. |
| M19 | Reports v2 | Arya | NOT STARTED | Every report in REPORT-SPEC.md. P13 to P18, proven by P21. |
| M20 | Floor Plan and Look | Arya | NOT STARTED | P19, P20. |
```

**2d. Replace the whole "In scope right now" section body with this:**

```
Caffeza go-live work only: prompts P00 to P21, listed in
`docs/CAFFEZA-BUILD-PLAN.md` section 3.

That covers changes to M0, M1, M2, M3 and M7, building M8 and M10, the new
modules M16 to M20, and the Phase 2 work from `docs/BUILD-PLAN.md` section 7.

M4 Inventory and M5 Attendance stay built, and are switched off for go-live.

M9, M11, M12, M13, M14 and M15 are deferred until after Caffeza is live.

If a request fits none of the prompts, say so, and do not build it.
```

**2e. The decision log.**
Add these rows at the end of the table, in this order:

```
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
```

**2f. Open questions.**
Remove both "Unit conversion approach for recipes" lines. The same line appears twice, and the decision log row "M4 D11" already settled it.
Remove the "Hosting provider and region" item, including its continuation lines about `trust proxy`. It is now in the decision log, and P01 handles `trust proxy`.
Keep the access token payload question.
Add these lines:

```
- Everything listed in `docs/CAFFEZA-PROFILE.md` section 15, from Caffeza and from their CA.
- Which cloud host. Decided in P12, against the rules in `docs/DEPLOYMENT.md` section 2.
- Who applies platform discounts at the till. Our current rule allows only OWNER and MANAGER.
```

**2g. Known problems.**
Add these rows at the end of the table:

```
| Unique indexes are never built in production. `config/database.js` turns `autoIndex` off when `NODE_ENV=production`, and no script runs `syncIndexes`. On a fresh production database the guards against duplicate bills and double-booked tables would not exist. | Audit, 2026-09-29 | OPEN. P01 adds `npm run db:indexes` and a boot check. |
| `trust proxy` is off, so behind a host's proxy every device shares one address, and one failed login rate-limits everyone | Audit, 2026-09-29 | OPEN. P01. |
| `npm run build` crashes with "Invalid URL" when `.env` is missing, from `client/vite.config.js` | Audit, 2026-09-29 | OPEN. P01. |
| The kitchen display shows ticket times in the tablet's own time zone, `KitchenDisplayPage.jsx` line 221 | Audit, 2026-09-29 | OPEN. P01. |
| The hourly report hardcodes `'Asia/Kolkata'` instead of reading `DISPLAY_TIMEZONE`, `salesReportService.js` line 195 | Audit, 2026-09-29 | OPEN. P01. |
| `scripts/seedDemo.js` can run against a production database | Audit, 2026-09-29 | OPEN. P01 blocks it when `NODE_ENV=production`. |
| The database-backed tests were not run during the audit. Only the money, tax and unit tests were. | Audit, 2026-09-29 | OPEN. Run `npm test` and record the count here. |
```

**2h. "What changed recently".**
Count the entries. Each one starts with a `### ` heading. There should be 21.
Keep the newest ten in this file, so 11 move.
Move every older entry, word for word and newest first, into a new file `docs/archive/SESSION-LOG.md`, under a heading `# Session log, archived from PROJECT-STATE.md`.
Then add this entry at the top of the section:

```
### 2026-09-30 Arya, P00 adopt the Caffeza docs

What was built or decided:
The Caffeza plan was adopted. New docs: CURRENT-STATE-AUDIT, CAFFEZA-PROFILE,
GLOSSARY, REPORT-SPEC, RECONCILIATION-RULES, TEST-DATA, CAFFEZA-BUILD-PLAN,
DEPLOYMENT, GO-LIVE, PROJECT-INSTRUCTIONS, and docs/prompts/. CLAUDE.md was
replaced. The decisions are in the decision log under 2026-09-28 and 2026-09-30.

Files or endpoints touched:
Docs only. No code, no endpoint, no model.

Anything the other developer needs to know:
Read docs/CAFFEZA-BUILD-PLAN.md first. New modules start at M16. Owners are
suggested in its section 3, change any you disagree with and log it.
CLAUDE.md now loads only the short docs; the long specs are read on demand.

Anything now blocked or unblocked:
P01 production safety can start.
```

---

## Step 3. Archive the old plan file

Move `docs/PROJECT-PLAN_1.md` to `docs/archive/PROJECT-PLAN_1.md` with `git mv`, or plain `mv` if it was untracked.
Create `docs/archive/README.md` with these lines:

```
# Archive

Files kept for history. Nothing here is current. Do not build from them.

- `PROJECT-PLAN_1.md`: an early merged plan covering M0 to M2 only.
- `SESSION-LOG.md`: older "What changed recently" entries from PROJECT-STATE.md.
```

---

## Step 4. Point the old build plan at the new one

In `docs/BUILD-PLAN.md`, directly under the title line, add:

```
> For the Caffeza go-live, see `docs/CAFFEZA-BUILD-PLAN.md`. It reuses M8 and
> M10 from this file and adds M16 to M20.
```

Change nothing else in that file.

---

## Step 5. README

In `README.md`, add these rows to the documents table, after the existing three:

```
| [`docs/CAFFEZA-BUILD-PLAN.md`](docs/CAFFEZA-BUILD-PLAN.md) | The Caffeza go-live plan: modules, prompts, owners, order |
| [`docs/CURRENT-STATE-AUDIT.md`](docs/CURRENT-STATE-AUDIT.md) | What exists in the code today, and what Caffeza still needs |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | One meaning for every word used in reports |
| [`docs/REPORT-SPEC.md`](docs/REPORT-SPEC.md) | Every report, column by column |
| [`docs/RECONCILIATION-RULES.md`](docs/RECONCILIATION-RULES.md) | The balance checks every report must pass |
| [`docs/TEST-DATA.md`](docs/TEST-DATA.md) | The golden day every report test reproduces |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Cloud server and Atlas, backups, the cafe setup |
| [`docs/GO-LIVE.md`](docs/GO-LIVE.md) | Gates, training, pilot days, cutover |
| [`docs/prompts/`](docs/prompts/) | The build prompts, P00 to P21, run in order |
```

Also add:

```
| [`docs/CAFFEZA-PROFILE.md`](docs/CAFFEZA-PROFILE.md) | The client's real setup: tax, invoice series, tables, staff, payment methods |
```

---

## Step 5b. Conventions

In `docs/CONVENTIONS.md` section 9, replace the line that says not to commit directly to `main`, and the branch name examples above it, with:

```
Commit directly to `main`. No feature branches.
One prompt is one commit, or a few small ones.
```

Keep every other line in section 9.

---

## Step 6. The prompts index

Create `docs/prompts/README.md`:

```
# Prompts

Run in order. One prompt per session. Each file names its model at the top.
The full table, with dependencies and owners, is in
`docs/CAFFEZA-BUILD-PLAN.md` section 3.

| Prompt | Title | Status |
|---|---|---|
| P00 | Adopt the Caffeza docs | Done |
| P01 | Production safety | Not run |
| P02 | Settings: feature switches and invoice series | Not run |
| P03 | Bill snapshots and line shares | Not run |
| P04 | Cancel reasons and variant check | Not run |
| P05 | Kitchen stations | Not run |
| P06 | Delivery and platform orders | Not run |
| P07 | Settlement spec | Not run |
| P08 | Payment methods and No Charge | Not run |
| P09 | On Hold accounts | Not run |
| P10 | Cash drawer and Day Close | Not run |
| P11 | Caffeza setup and menu import | Not run |
| P12 | Cloud deployment | Not run |
| P13 | Reports spec | Not run |
| P14 | Report engine | Not run |
| P15 | Daily, money and GST reports | Not run |
| P16 | Menu, captain and table reports | Not run |
| P17 | Audit trail and control reports | Not run |
| P18 | Report screens and Today | Not run |
| P19 | Floor plan | Not run |
| P20 | Look, themes and customisation | Not run |
| P21 | Golden day, end to end | Not run |

Prompt files that do not exist yet are added as they are written.
```

---

## Step 7. Verify

1. Every file path mentioned in `CLAUDE.md` exists. Check each one, and list any that is missing.
2. `docs/PROJECT-STATE.md` still has every decision log line it had before, plus the 17 new ones. Count them before and after, and show me both counts.
3. The number of "What changed recently" entries in `docs/PROJECT-STATE.md` is now 11: the newest ten plus P00's.
4. `docs/archive/SESSION-LOG.md` holds every entry that was moved, and none is lost. Expected: 11 in `PROJECT-STATE.md`, 11 in the archive, and 11 + 11 = 21 + 1.
5. `git diff --stat` shows changes only under `docs/`, `CLAUDE.md` and `README.md`.
6. `npm run lint` still passes.

---

## Non-negotiable rules that apply

"Secrets live in `.env`. `.env` is in `.gitignore`. Never commit a real secret."
Check that none of the new docs contains a connection string, password or key before committing.

"Add a line every time a real decision is made. Never delete old lines." (the decision log's own rule)

---

## Out of scope

Any change to code, tests, models, routes or package files.
Any change to `docs/API-CONTRACT.md` or `docs/DB-SCHEMA.md` beyond committing the existing M8 section in step 0.
Rewriting or reformatting existing text in `docs/PROJECT-STATE.md` beyond the edits in step 2.
Creating a branch.

---

## Done when

1. Every step above is complete, and step 7's checks all pass.
2. Commit on `main` with the message `adopt caffeza plan docs`, separate from the M8 spec commit if there was one.
3. Push `main`. Tell me so I can ask Rishi to pull and read it.
4. Print a short summary: the commits made, the files added, moved and changed, and the counts from step 7.
