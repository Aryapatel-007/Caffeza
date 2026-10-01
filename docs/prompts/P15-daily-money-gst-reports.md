P15 Daily, money and GST reports
Model: Opus, high effort.
Branch: none. Commit directly to main .
Depends on: P14.
1. What to build, in one sentence
Add nine report deﬁnitions to the engine from P14: R2 Day Close, R3
Sales by Day, R4 Hours and Weekdays, R5 Payments, R6 Platform
Money, R7 Cash Till, R8 GST, R9 Tally Export and R10 Invoice Register,
each proven against the golden day.
2. Module
M19 Reports v2. Server only. The screens come in P18.
3. The spec is already written
docs/API-CONTRACT.md  section "M19 Reports v2", from P13, gives
each report's endpoint, roles, ﬁlters, columns, stored ﬁelds, totals,
checks and drill downs.
docs/REPORT-SPEC.md  says what each report is for.
Build exactly what the contract says. If it and this prompt disagree, the
contract wins, and you tell me.
If the contract is silent on something you need, stop and ask.
4. Step 0. Save this prompt and check the repo
1. Save this entire prompt, exactly as given, to docs/prompts/P15-
daily-money-gst-reports.md .
2. git pull . git status  should show only that ﬁle.
3. docs/prompts/README.md  must show P14 as Done. If not, stop.
4. Run npm test  and record the count. It should match P14's "after"
count. If anything fails, stop and tell me.
5. Files to read ﬁrst
1. The M19 contract entries for R2 to R10.
2. docs/REPORT-SPEC.md  R2 to R10, and docs/GLOSSARY.md .
3. docs/TEST-DATA.md  sections 4, 5 and 6.
4. server/services/reports/engine.js , registry.js ,
labels.js , and definitions/bills.js  from P14, as the pattern.
5. server/services/dayFiguresService.js  and
server/services/reconciliationService.js .
6. server/services/payoutService.js  from P09.
7. server/utils/tax.js , especially largestRemainderSplit .
8. The existing M6 services and tests for sales by day and hourly,
since R3 and R4 may extend their paths.
6. The nine deﬁnitions
One ﬁle each in server/services/reports/definitions/ , registered
in registry.js .
Every deﬁnition follows the rules at the top of engine.js : frozen ﬁelds
only, paise only, averages after totalling, no reads of menu, categories,
users or payment methods.
Report Main source Points to get right
R2 Day
Close
computeDayFigures  for
an open day. The stored
Never a second calculation. For
a closed day, C12 compares the
Report Main source Points to get right
dayclosures.snapshot
for a closed day.
snapshot with a fresh
computation.
R3 Sales
by Day Bills by businessDate
Every date in the range gets a
row, zeros where there were no
bills. The "previous range"
comparison, if the contract
includes it, uses a range of the
same length ending the day
before from .
R4 Hours
and
Weekdays
Bills by the hour of
billedAt  in
DISPLAY_TIMEZONE
All 24 hours present. The
weekday grid has 7 rows,
Monday ﬁrst, each with 24 cells.
R5
Payments
Payments by their own
businessDate
Every active method, and every
method used in the range even if
now inactive, gets a column,
zeros where unused. On Hold
from
chargedToAccountInPaise .
Collections in their own section.
OWNER only.
R6
Platform
Money
platformpayouts  and
platform payments
One row per live payout batch
with expected through
payoutService.expectedFor ,
plus a section of platform
payments no live payout covers.
Rate-not-set payments listed,
never estimated.
R7 Cash
Till
dayclosures  and
computeDayFigures
One row per business date.
Closed days from the stored
close. Open days show expected
cash so far and no count.
OWNER only.
Report Main source Points to get right
R8 GST Bills' taxBreakdown  and
taxTreatment
Section B, platform-collected, by
frozen platform.code .
Section C, No Charge value and
voided totals, never added into
section A. Section D, documents
per invoiceSeries . Section E,
round-off.
R9 Tally
Export As R8, plus payments
A ﬁle only. The exact sheet
layout from the contract. See
section 7 below. Refuses to build
if any ERROR check fails.
R10
Invoice
Register
Every bill, voided included,
ordered by series then
sequence
A gap shows as its own "Missing
number" row. A null
invoiceSeries  belongs to its
financialYear  series.
Where the contract keeps an existing M6 path, as docs/REPORT-
SPEC.md  section 4 says for R3 and R4, the existing M6 tests on that
path must still pass unchanged, unless the contract deliberately
changes a ﬁeld. If it does, change those tests on purpose and list each
one in your summary.
7. R9: splitting bills across payments
The Tally ﬁle has two blocks: sales by tax rate, and sales by payment
method, with each method's Tally code.
The by-rate block is simple: each rate's net sales, CGST and SGST,
straight from the bills' taxBreakdown , and round-off on its own row.
The by-method block needs each bill's net sales and GST divided
between the ways it was paid.
Caffeza's old export worked the taxable value backwards from the
rounded amount, which is why its two blocks show different taxable
totals for the same day.
Ours must not.
1. Add splitBillAcrossPayments(bill)  to server/utils/tax.js ,
the only place tax arithmetic lives.
2. For one bill, the parts are its payments, plus its
chargedToAccountInPaise  as an On Hold part, plus any unpaid
remainder as an Unpaid part.
3. Split the bill's net sales across the parts with
largestRemainderSplit , weighted by each part's amount. Split
its CGST and SGST the same way, separately. The round-off stays
on its own row and is not split.
4. Before returning, check that each split adds back exactly to the
bill's own ﬁgure, and throw if not, the same discipline as
allocateLineShares .
5. The by-method block then adds these parts up by frozen method
code, with the On Hold part on its own row using Caffeza's P03
code from the On Hold setting or the contract.
The two blocks must have exactly the same total net sales, CGST and
SGST. Test it.
8. Checks
Each report runs the checks the contract lists for it, through the engine.
R9 refuses to build when any ERROR check fails, and says which.
9. Tests
Build the golden day once per test ﬁle with
tests/helpers/goldenDay.js , close 26 September as in P10, and
check each report against docs/TEST-DATA.md .
R2
1. For 26 September, every section matches docs/TEST-DATA.md
section 4, to the paisa.
2. For the closed day, the response is the stored snapshot, and C12
passes. After changing B06's stored total directly, C12 fails.
R3
3. One row for 26 September: 15 bills, 27 covers, item total ₹9,310.22,
discount ₹423.90, net sales ₹8,886.32, GST ₹382.57, round-off ₹0.11,
bill total ₹9,269.00, average bill ₹592.42, average per cover ₹267.09.
4. With the section 5 scenario added for 27 September, a range of 26 to
28 September has three rows, 28 September all zeros, and openDays
lists 27 and 28 September.
R4
5. Net sales by hour of billing, matching:
Hour Bills Net sales
12 1 ₹477.00
13 1 ₹1,376.93
14 2 ₹1,360.00
15 1 ₹757.61
16 1 ₹717.61
17 1 ₹930.00
18 2 ₹350.00
19 1 ₹480.00
20 2 ₹1,071.00
21 2 ₹840.00
23 1 ₹526.17
Every other hour is zero, and the hours add up to ₹8,886.32.
R5
6. 26 September: Cash ₹1,754.00, Card ₹1,481.00, UPI ₹1,472.00,
money in hand ₹4,707.00. Zomato Gold ₹1,998.00, Dineout ₹778.00,
EazyDiner ₹0.00, Zomato ₹305.00, Swiggy ₹930.00, platform money
₹4,011.00. On Hold ₹551.00. Unpaid ₹0.00. Total ₹9,269.00.
7. B14's payment at 12:02 AM on 27 September is counted on 26
September.
8. With the section 5 collection added, 27 September's collections
section shows W-330 Oﬃce, cash, ₹504.00, and 27 September's sales
ﬁgures do not include it.
9. A MANAGER is refused.
R6
10. With Swiggy at 2000 basis points and a payout for 26 September of
₹744.00: expected ₹744.00, difference ₹0.00. Zomato Gold, with no rate
set, appears under "rate not set".
R7
11. 26 September: opening ﬂoat ₹2,000.00, cash from bills ₹1,754.00,
collections ₹0.00, paid in ₹0.00, paid out ₹350.00, expected ₹3,404.00,
counted ₹3,400.00, difference −₹4.00, closed by Manager.
R8
12. Section A: 5%, net sales ₹7,651.32, CGST ₹191.31, SGST ₹191.26.
Section B: Swiggy ₹930.00 and Zomato ₹305.00, totalling ₹1,235.00.
Section C: No Charge ₹230.00 and voided ₹347.00. Section D: series
CFA/C/ , ﬁrst 22442, last 22457, 16 issued, 1 voided. Section E: round-
off ₹0.11.
R9
13. The by-rate block: 0% ₹1,235.00. 5% taxable ₹7,651.32, CGST
₹191.31, SGST ₹191.26, ﬁnal ₹8,033.89. Round-off ₹0.11. Total
₹9,269.00.
14. The by-method block totals exactly the same net sales, CGST and
SGST as the by-rate block.
15. B05, paid ₹500.00 cash and ₹295.00 UPI on ₹757.61 net and ₹37.88
GST, splits so that the two parts add back exactly to ₹757.61 and
₹37.88.
16. Unit tests for splitBillAcrossPayments : a bill with one payment,
a split payment, a partly paid bill charged to an account, a 0% bill, and a
property test over 1,000 seeded random bills where every split adds
back exactly.
17. With one ERROR check broken, the export refuses and names the
check.
18. Open the ﬁle with exceljs  and check every sheet's layout and Tally
codes.
R10
19. 16 rows, CFA/C/22442 to CFA/C/22457, with B11's number marked
voided, "Billed to the wrong table", B09 and B10 marked On Hold, the
rest Paid, and no missing numbers.
20. Deleting B11's stored document directly makes a "Missing number"
row appear for CFA/C/22452, and C6 fails.
Every report
21. Each one's xlsx  export opens and its totals equal the JSON
response.
22. Each one's roles, from the contract's permission table.
Run the full suite at the end. Every test that passed before must still
pass.
10. Non-negotiable rules that apply
"Reports only add up values frozen onto records when the event
happened. A report never recomputes tax."
"Tax arithmetic lives in server/utils/tax.js . Nowhere else." The
payment split lives there.
"Every report goes through the one shared report engine."
"Every label on a screen or an export comes from docs/GLOSSARY.md ."
"A totals row is the exact sum of its rows. An average is a sum divided
by a sum."
"Store timestamps in UTC. Convert to India time only for display." R4
converts hours in the aggregation, using DISPLAY_TIMEZONE .
11. Checks and golden day
Every report here is proven against the golden day, to the paisa.
If a number differs from docs/TEST-DATA.md , do not change the
expected number. Find which side is wrong and tell me.
12. Docs to update
1. docs/API-CONTRACT.md  M19: anything the build had to settle that
the contract left open, especially R9's on-hold Tally code and the
payment split rule.
2. docs/PROJECT-STATE.md :
1. The date line.
2. "Current stage": "Next: P16, menu, captain and table reports."
3. Decision log, dated today: "The Tally by-method block splits
each bill's net sales, CGST and SGST across its payments and
account charge with the largest remainder method, in
splitBillAcrossPayments  in tax.js . Both Tally blocks
always total the same. | Caffeza's old export worked ﬁgures
backwards from rounded amounts and its two blocks
disagreed."
4. Every place the build differed from the contract, as a decision
row, and the contract updated to match.
5. "What changed recently": a P15 entry at the top, and the oldest
moved to the archive.
3. docs/prompts/README.md : mark P15 as Done.
13. Out of scope
Screens and charts. That is P18.
R1 Today. That is P18.
R11 to R18. That is P16 and P17.
Tally XML vouchers. Excel only for now.
Changing or removing any M6 endpoint beyond what the contract says.
14. Done when
1. npm test  passes, with before and after counts recorded.
2. npm run lint  and npm run build  pass.
3. By hand, with seed:demo  data or a staging-like setup: call each of
the nine endpoints for a recent date and download R9 and R10 as
Excel.
4. Every doc in section 12 is updated.
5. Commits on main , one line each, for example:
add day close sales by day and hours reports
add payments platform money and cash till reports
split bills across payments in tax
add gst tally and invoice register reports
update docs for p15
6. Push main .
7. Print a short summary: commits, ﬁles changed, test counts before
and after, and every place the build differed from the contract.
