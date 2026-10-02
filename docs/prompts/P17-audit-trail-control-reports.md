# P17 Audit trail and control reports

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P16.

---

## 1. What to build, in one sentence

Build M8 Audit Trail exactly as its long-standing spec describes, extended to cover every audit action added since, then add the control reports R14 Discounts, R15 Cancellations and Voids, R16 No Charge, R17 On Hold Accounts and R18 Activity Log.

## 2. Module

Part A: M8 Audit Trail, pulled forward.
Part B: M19 Reports v2, the control reports. Server only. Screens come in P18.

Do Part A first and commit it before starting Part B.

## 3. Why

Discounts, voids, cancellations, No Charge and On Hold are where money leaves a restaurant without a sale.
`docs/BUILD-PLAN.md` section 7 names voids and discounts as the events an owner loses money to.
Every one of them already writes an audit line. Nothing reads them yet.

## 4. The specs are already written

Part A: `docs/API-CONTRACT.md` section "M8 Audit Trail". It was written before the Caffeza work and is still the spec.
Part B: the R14 to R18 entries in section "M19 Reports v2", from P13.
**Build exactly what they say.** Where this prompt adds to M8, section 6 below says exactly how, and you write it into the M8 section first.
If a spec is silent on something you need, stop and ask.

---

## 5. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P17-audit-trail-control-reports.md`.
2. `git pull`. `git status` should show only that file.
3. `docs/prompts/README.md` must show P16 as Done. If not, stop.
4. Run `npm test` and record the count. It should match P16's "after" count. If anything fails, stop and tell me.

## 6. Files to read first

1. `docs/API-CONTRACT.md` section "M8 Audit Trail", all of it, including the sequencing note, the manager restriction, the attendance corrections merge, the summary, and "append-only, enforced structurally".
2. The M19 entries for R14 to R18.
3. `docs/REPORT-SPEC.md` R14 to R18.
4. `docs/TEST-DATA.md` sections 2 and 4.
5. `server/models/AuditLog.js` and every place that calls `recordAudit`.
6. The P14 engine and the P15 and P16 definitions.

---

## 7. Part A. The audit trail

### 7a. What to add to the M8 spec first

M8 was written when only five audit actions existed. Since then, P04, P07 and their builds added more.
Before writing code, update the M8 section and commit it as `extend m8 spec for new audit actions`:

1. Section 1's table: every action now written, which module writes it, and from which prompt. Check the code, not the docs, to build this list.
2. The manager restriction. The spec lets a MANAGER see only `ORDER_CANCELLED` and `STOCK_ADJUSTED`. The rule behind it is that an owner watches managers, so a manager must not read the trail of what managers approve. Apply that rule to the new actions:

| Action | MANAGER may see it |
|---|---|
| `ORDER_CANCELLED`, `STOCK_ADJUSTED` | Yes, as already specified |
| `LINE_CANCELLED_AFTER_PREP` | Yes. It is the kitchen's and captains' waste, which a manager runs. |
| Every other action | No. OWNER only. |

3. The summary in section 7 ranks people by the value they voided. Add, in the same style: the value of discounts each person applied, the No Charge value each person approved, and the count of payment corrections each person made. OWNER only, as the summary already is.

### 7b. Build M8

Build every endpoint, rule and test the updated M8 section describes, in the order it describes them. In particular:

1. `GET /audit`, `GET /audit/entity/:entityType/:entityId` and `GET /audit/summary`, with their roles and the manager restriction, enforced in the query on the server, never by filtering a response after reading it.
2. Attendance corrections merged at read time, exactly as section 6 says, only when the attendance feature is on.
3. Append-only, enforced structurally, exactly as section 8 says.
4. The M8 tests the spec lists.

Commit Part A on its own, for example `build m8 audit trail`, before Part B.

## 8. Part B. The control reports

One definition each, in `server/services/reports/definitions/`, registered.

| Report | Source | Points to get right |
|---|---|---|
| R14 Discounts | Non-voided bills with a discount | Group by frozen `discount.reasonCode`, and by `appliedBy`. "Item total before discount" and "Bill total after discount" are named in full, never "order amount". Percent off is discount over item total, in basis points. |
| R15 Cancellations and Voids | `orders.lines[]` cancelled, orders cancelled, and voided bills | Three sections. A line cancelled by a whole-order cancel takes the order's `cancelReasonCode`, as P04 noted. Stage is before or after preparation, from `wasPrepared`. Wasted value is after-preparation line totals only. Each cancel is dated by the business date of its cancel time. |
| R16 No Charge | Orders with status `NO_CHARGE` | By `noCharge.businessDate`. Value is `noCharge.valueInPaise`, before GST, and the column header says so. |
| R17 On Hold Accounts | `accounts` and `accountentries` | The accounts view as of a date, and the statement of one account, exactly as P09 built the statement. Outstanding uses the same function as P09, `outstandingFor`, never a second calculation. |
| R18 Activity Log | The M8 service from Part A | A thin definition over the same service, so it gets the envelope, filter sentence and export. The manager restriction still applies. |

Labels come from `docs/GLOSSARY.md` through `labels.js`. Reason labels come from the reason files from P04, P07 and P08, never typed again.

---

## 9. Tests

Before these tests, check `server/tests/helpers/goldenDay.js`: every discount, the void of B11 and the No Charge approval must be done with the Manager's token, and every cancel with the captain's. If the fixture does it differently, change the fixture to match, re-run the P10 to P16 tests, and say so in your summary.

**Part A, M8**
1. Every test the M8 spec lists.
2. A MANAGER sees `LINE_CANCELLED_AFTER_PREP`, and does not see `NO_CHARGE_GIVEN`, `DAY_REOPENED` or `SETTINGS_CHANGED`. An OWNER sees all of them.
3. The extended summary, for the golden day: Manager voided ₹347.00 across 1 bill, applied ₹423.90 of discounts across 6 bills, and approved ₹230.00 of No Charge across 1 order.
4. An attempt to update or delete an audit document fails, as section 8 of the spec requires.

**Part B, using the golden day, closed**
5. R14 by reason: Regular guest 1 bill ₹53.00, Zomato Gold 2 bills ₹86.90, Merchant promo 1 bill ₹200.00, Staff or office 1 bill ₹45.00, Dineout 1 bill ₹39.00. Total 6 bills, ₹423.90, equal to R2's discount.
6. R14 percent off: B01 10.00%, B02 5.04%, B08 39.60%, B09 50.00%, B14 2.56%, B16 5.00%.
7. R15 items: Thecha Paneer Chilli, ₹390.00, after preparation, Guest changed the order, cancelled by Khuman Singh; Cheesy Tornado, ₹360.00, before preparation, Wrong item entered, by Khuman Singh. Wasted value ₹390.00.
8. R15 voids: CFA/C/22452, ₹347.00, Billed to the wrong table, by Manager.
9. R15: cancelling a whole order in a test gives its lines the order's reason, not a blank.
10. R16: Table 29, College Sandwich, ₹230.00 before GST, Corporate office order, opened by Ranjeet Paswan, approved by Manager.
11. R17 as of 26 September: E-210 Office ₹47.00, W-330 Office ₹504.00. As of 27 September, after the section 5 collection: W-330 Office ₹0.00, E-210 Office ₹47.00, and its oldest uncollected bill is from 26 September.
12. R18: the golden day's activity, filtered to voids, shows exactly one line, for B11.
13. Each report's `xlsx` export opens and matches its JSON totals.
14. Each report's roles, from the contract.

Run the full suite at the end. Every test that passed before must still pass.

---

## 10. Non-negotiable rules that apply

"Check permissions on the server for every endpoint." The manager restriction is enforced in the query.
"Never hard delete." Audit lines are append-only, structurally.
"Reports only add up values frozen onto records."
"Every label on a screen or an export comes from `docs/GLOSSARY.md`."

## 11. Checks and golden day

C7, a cancelled line never sold, runs on R15.
C10, account balances, runs on R17.
Every expected number above comes from the golden day. If one differs, do not change it. Find which side is wrong and tell me.

---

## 12. Docs to update

1. `docs/TEST-DATA.md` section 4: add the R14 by-reason and R15 expected results from tests 5 to 8.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P18, report screens and Today."
   3. Module status: M8 becomes DONE, "Built in P17, with the manager restriction extended to every new action."
   4. Decision log, dated today: "A MANAGER may see `ORDER_CANCELLED`, `STOCK_ADJUSTED` and `LINE_CANCELLED_AFTER_PREP` in the audit trail. Every other action is OWNER only. | The owner watches what managers approve. Kitchen waste is the manager's to manage."
   5. Every place the build differed from a spec, as a decision row, and the spec updated.
   6. "What changed recently": a P17 entry at the top, and the oldest moved to the archive.
3. `docs/prompts/README.md`: mark P17 as Done.

---

## 13. Out of scope

Screens. That is P18.
Alerts sent by message or email.
Changing who may approve a discount, a void or a No Charge.

---

## 14. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. Every doc in section 12 is updated.
4. Commits on `main`, one line each, for example:
   `extend m8 spec for new audit actions`
   `build m8 audit trail`
   `add discounts and cancellations reports`
   `add no charge accounts and activity reports`
   `update docs for p17`
5. Push `main`.
6. Print a short summary: commits, files changed, test counts before and after, the final list of audit actions and who may see each, and every place the build differed from a spec.
