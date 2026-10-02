# P16 Menu, captain and table reports

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P15.

---

## 1. What to build, in one sentence

Add three report definitions to the engine, R11 Menu Performance, R12 Captains and R13 Tables and Table Time, built only from frozen bill and order values and proven against the golden day.

## 2. Module

M19 Reports v2. Server only. Screens come in P18.

## 3. Why these three need care

These are the reports Caffeza's old system got visibly wrong.
Its captain report was ₹16,392 short of its own day total.
Its category report showed every category as a percent of the top one, so the column added up to far more than 100.
Ours add up to the whole, every time, and check C5 proves it on every run.

## 4. The spec is already written

`docs/API-CONTRACT.md` section "M19 Reports v2", from P13.
**Build exactly what it says.** If it and this prompt disagree, the contract wins, and you tell me.
If the contract is silent on something you need, stop and ask.

---

## 5. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P16-menu-captain-table-reports.md`.
2. `git pull`. `git status` should show only that file.
3. `docs/prompts/README.md` must show P15 as Done. If not, stop.
4. Run `npm test` and record the count. It should match P15's "after" count. If anything fails, stop and tell me.

## 6. Files to read first

1. The M19 contract entries for R11, R12 and R13.
2. `docs/REPORT-SPEC.md` R11 to R13, and `docs/GLOSSARY.md` sections 3 and 8.
3. `docs/TEST-DATA.md` section 4, R11 and R12.
4. The P14 engine, and the P15 definitions, as the pattern.
5. `docs/DB-SCHEMA.md` section 9 `orders` and section 12 `bills`, for the frozen line fields from P03 and the cancel fields from P04.
6. `server/models/Kot.js`, for fire and ready times.

---

## 7. The three definitions

### R11 Menu Performance

Source: `bills.lines[]` of non-voided bills in the range. Cancelled quantities and wasted value come from `orders.lines[]` with status `CANCELLED`, by the business date of the cancel time.

1. Two levels in one report: by category, and by item within a category, as the contract shapes it.
2. Group by the frozen `categoryId` with the frozen `categoryName`, and by `menuItemId` with the frozen `itemName`. A variant is part of the item name shown, as the contract says.
3. When one category id or item id appears with more than one frozen name in the range, show the name from the most recent bill, and keep one row.
4. Lines with no stored shares, from bills created before P03, go into one row named "Not recorded", with their quantity and line totals, and blank discount and net sales. They are never dropped and never estimated. The C5 check for this report compares item totals, which every line has, as well as net sales over the lines that have shares.
5. Share of net sales: each row's net sales over the total, in basis points, computed from paise after totalling. The rows add up to exactly 10000: give any rounding remainder with `largestRemainderSplit`, so the column always shows 100.00%.
6. The "items that sold nothing" toggle, if the contract includes it, is the one place this report may read `menuitems`, and only to list names, never to produce a figure. Put that read in its own small function with a comment saying why it is allowed.

### R12 Captains

Source: non-voided bills, grouped by frozen `captainId`.

1. Captain name: from the most recent bill in the range for that id.
2. Average table time: minutes from `orderOpenedAt` to `paidAt`, for dine-in bills with status `PAID` only. On Hold bills, which have no payment time, are left out of table time, as `docs/GLOSSARY.md` defines it. A captain with no paid dine-in bills shows no average, not zero.
3. Discounts on their bills: count and total from `discount.amountInPaise`.
4. Items they cancelled: from `orders.lines[]` cancelled by that user, by the business date of the cancel. This is grouped by `cancelledBy`, a different person from the bill's captain, so it is its own figure and not part of the C5 total.

### R13 Tables and Table Time

Source: non-voided dine-in bills, grouped by frozen `tableName`, with the table's section from the contract's chosen source.

1. Turns per day: bills divided by the number of business dates in the range.
2. Average table time, the same rule as R12.
3. The kitchen time panel: from `kots`, minutes from `firedAt` to ready, by frozen `stationName`, with the five slowest items. Use the contract's definition of "ready" for a line versus a ticket.

Minutes are whole numbers per bill. Averages of minutes are a sum divided by a count, kept to one decimal place, as the contract's `minutes` type says.

---

## 8. Tests

Build the golden day once per test file, close 26 September, and check against `docs/TEST-DATA.md`.

**R11**
1. Category rows match `docs/TEST-DATA.md` section 4 exactly: Pizza 5 sold, item total ₹1,810.00, discount ₹9.22, net sales ₹1,800.78, down to Extras, ₹27.00. Totals: 36 sold, item total ₹9,310.22, discount ₹423.90, net sales ₹8,886.32.
2. The share column adds up to exactly 100.00%, and Pizza shows 20.26%.
3. The voided B11 is not counted. The two cancelled items on B13's order appear only as cancelled quantity and wasted value: Thecha Paneer Chilli, 1 cancelled, wasted ₹390.00, and Cheesy Tornado, 1 cancelled, wasted ₹0.00.
4. Moving Mexican Bowl to another category after the golden day changes nothing in the report.
5. A bill inserted directly with lines that have no shares and no category appears in "Not recorded", and C5 still passes.

**R12**
6. Rows match `docs/TEST-DATA.md` section 4: Khuman Singh 4 bills, 11 covers, net sales ₹2,604.61, bill total ₹2,735.00, down to Counter, 3 bills, ₹1,697.00. Totals equal R3 for the same day.
7. Average table time: Khuman Singh 60.5 minutes from 4 paid bills, Budha Singh 59.0 from 3, Devendra Singh 53.0 from 3. Ranjeet Paswan has no average, because both his bills are On Hold. Counter has none, because none of their bills are dine-in.
8. Renaming Khuman Singh after the golden day does not change the report for 26 September.
9. Items cancelled: Khuman Singh, 2 items, ₹750.00.

**R13**
10. Table times for the ten paid dine-in bills are, in minutes: Table 5 56, Table 7 57, Table 12 59, Table 2 38, Table 3 49, Table 14 53, Table 16 55, Table 11 74, Table 4 71, Table 18 66. Their total is 578 minutes and the average is 57.8.
11. Table 16 shows 1 bill, B12. The voided B11 on the same table is not counted.
12. Tables 30 and 35, with only On Hold bills, show their bills and net sales but no table time.

**Checks and export**
13. C5 runs for each report and passes. Breaking it as in `docs/TEST-DATA.md` section 6, leaving out the Pizza group, makes it fail with ₹1,800.78 missing.
14. Each report's `xlsx` export opens and its totals equal the JSON response.
15. A guard test confirms no definition in this prompt imports `MenuItem`, `Category`, `User` or `PaymentMethod`, except the one function for "items that sold nothing".

Run the full suite at the end. Every test that passed before must still pass.

---

## 9. Non-negotiable rules that apply

"Reports only add up values frozen onto records when the event happened. A report never reads today's category for an old sale."
"A totals row is the exact sum of its rows. An average is a sum divided by a sum."
"Every report goes through the one shared report engine."

## 10. Checks and golden day

R11 and R12 reproduce `docs/TEST-DATA.md` section 4 to the paisa. R13's table times come from the golden day's opened and paid times in section 2.
If a number differs, do not change the expected number. Find which side is wrong and tell me.

---

## 11. Docs to update

1. `docs/TEST-DATA.md` section 4: add the R13 table times from test 10, and the R12 average table times from test 7, as expected results.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P17, the audit trail and control reports."
   3. Decision log, dated today: "Share of net sales is computed in basis points after totalling, with the rounding remainder handed out by the largest remainder method, so the column always adds up to exactly 100%. | Caffeza's old category report measured each row against the top one."
   4. Every place the build differed from the contract, as a decision row, and the contract updated.
   5. "What changed recently": a P16 entry at the top, and the oldest moved to the archive.
3. `docs/prompts/README.md`: mark P16 as Done.

---

## 12. Out of scope

Screens and charts. That is P18.
Profit per dish or food cost. Inventory is switched off for Caffeza.
Ranking captains against targets.

---

## 13. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. Every doc in section 11 is updated.
4. Commits on `main`, one line each, for example:
   `add menu performance report`
   `add captains report`
   `add tables and table time report`
   `update docs for p16`
5. Push `main`.
6. Print a short summary: commits, files changed, test counts before and after, and every place the build differed from the contract.
