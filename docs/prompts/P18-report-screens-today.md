# P18 Report screens and Today

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P17.

---

## 1. What to build, in one sentence

Build R1 Today on the server, then one report screen on the client that renders any report envelope, with date presets, filters, the filter sentence, the check strip, drill-down links, charts, Excel and A4 print, and replace the old M6 report screens with it.

## 2. Module

M19 Reports v2: R1 on the server, and every report screen on the client.

## 3. Why one screen for all

Every report from P14 to P17 returns the same envelope.
One screen that renders an envelope well means nineteen reports look and behave the same, and a fix in one place fixes all of them.
The old M6 screens each draw their own tables, so they disagree on formatting and none of them can drill down.

## 4. The spec is already written

The M19 contract from P13 defines R1 and the envelope.
`docs/REPORT-SPEC.md` section 1 says how a report must look and behave. Treat it as the screen spec.
`docs/DESIGN-SYSTEM.md` is the look. The new look arrives in P20. Use the existing tokens and components now, so P20 can restyle without restructuring.
**Build exactly what they say.** If the contract is silent on something you need, stop and ask.

---

## 5. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P18-report-screens-today.md`.
2. `git pull`. `git status` should show only that file.
3. `docs/prompts/README.md` must show P17 as Done. If not, stop.
4. Run `npm test` and record the count. It should match P17's "after" count. If anything fails, stop and tell me.

## 6. Files to read first

1. `docs/REPORT-SPEC.md` sections 1 and 2, and R1.
2. The M19 contract: the envelope, R1, and the permission table.
3. `docs/DESIGN-SYSTEM.md`, all of it.
4. `docs/GLOSSARY.md` section 1, rules for words and numbers.
5. On the client: `client/src/features/reports/` all of it, `client/src/components/charts/`, `client/src/utils/formatDate.js`, the money formatting helper, `RequireFeature.jsx` from P02, the Bill List page from P14, the printing code from P05, and `App.jsx`.
6. On the server: the P14 engine and one P15 definition.

---

## 7. Part A. R1 Today, on the server

A definition like the others, registered, for the current business date only, as the contract describes.

1. Tiles: bill total so far, net sales so far, bills, covers, average per cover, open tables with their running item totals, unpaid bills, and the same weekday last week up to the same time of day.
2. Panels: money so far by method with On Hold and unpaid, the top 5 items by quantity, and alerts: every void, every No Charge, every discount over 20%, every item cancelled after preparation.
3. Use `computeDayFigures` for the day's figures, so Today and Day Close can never disagree.
4. "Same weekday last week up to the same time" compares bills billed before the same India time on the business date seven days earlier.
5. Open tables and their running totals come from frozen order line values, never the menu.

Tests: with the clock at 26 September 6:00 PM during the golden day fixture, the tiles show exactly the bills billed by then, and the alerts list exactly the events before then. At 6:00 PM that is B01 to B07, with bill total ₹5,854.00, with no void, no discount over 20% and no cancellation after preparation yet, since those all come later. Whether the No Charge N01 is in the alerts depends on the time the fixture gives it: read that time from `goldenDay.js` and expect accordingly.
Work out each expected figure from `docs/TEST-DATA.md` sections 2 and 3, write them into the test, and add them to `docs/TEST-DATA.md` as a new subsection "R1 at 6:00 PM".

## 8. Part B. The report screen

One page component, `client/src/features/reports/ReportPage.jsx`, that takes a report id and renders its envelope.

**Top of the page**
1. Title.
2. Date controls: one date for R1 and R2, a range for the rest, with presets: Today, Yesterday, This week, Last 7 days, This month, Last month, Custom. "Today" means the current business date, from `businessDateToday()`, never the calendar date.
3. The report's own filters, built from the contract, as simple pickers.
4. Every filter lives in the page address, so a link or a refresh opens the same report, and drill-down links work.
5. The filter sentence, exactly as the server sent it.
6. The open-day banner, when `openDays` is not empty, in the wording of `docs/REPORT-SPEC.md` section 1.
7. The check strip: green "All N checks passed", amber for a warning, red for an error, with the check's message and a link that opens the Bill List filtered to the bills in its `refs`. The strip never hides the report.

**The body**
1. Each section from the envelope: a heading, a chart where section 9 says so, and a table.
2. Tables use `DataTable` from `components/charts`, with columns formatted by type: money with ₹ and Indian grouping and two decimals, counts with grouping, percents from basis points with two decimals, minutes with one decimal, times in India time 12-hour, dates as "26 Sep 2026".
3. Negative money shown with a minus sign, in the `mirch` token.
4. The totals row, visibly separated, always shown.
5. Every cell with a drill down is a link to the Bill List, carrying the drill query from the envelope.
6. Wide tables scroll sideways inside their own box. The first column stays fixed while scrolling. The page itself never scrolls sideways.

**The bottom**
"Excel" downloads the report with `format=xlsx`.
"Print" prints the page on A4 through a print stylesheet: filter sentence, check results and tables, with navigation and buttons hidden, and tables never cut through a row.

**Loading and errors**
A plain loading state. A 403 says the report needs a different role, in words. Any other error shows the server's message and a retry button.

**Remembered choices**
The last date range used for each report is remembered on the device.

## 9. Charts

Use only the chart components already in `components/charts`, adding a small new one only where none fits.

| Report | Chart |
|---|---|
| R1 | Tiles, using `StatTile` |
| R3 | Net sales per day as columns |
| R4 | Net sales per hour as columns, and the weekday by hour grid as shaded cells |
| R5 | Money in hand and platform money per day |
| R11 | Categories ranked by net sales, using `RankedBars` |
| R12 | Captains ranked by net sales |

Every chart keeps the table twin under it, as `ReportShell.jsx` does today, so no number is reachable only by hovering.
Charts never show a number the table does not.

## 10. The reports index

`/reports` becomes a list of every report the signed-in user may open, grouped:

| Group | Reports |
|---|---|
| Today and days | R1 Today, R2 Day Close, R3 Sales by Day, R4 Hours and Weekdays |
| Money | R5 Payments, R6 Platform Money, R7 Cash Till, R17 On Hold Accounts |
| Tax and accounts | R8 GST, R9 Tally Export, R10 Invoice Register |
| Menu and people | R11 Menu Performance, R12 Captains, R13 Tables and Table Time |
| Controls | R14 Discounts, R15 Cancellations and Voids, R16 No Charge, R18 Activity Log |
| Bills | R19 Bill List |

Each entry shows the report's question from `docs/REPORT-SPEC.md` section 2, in one line.
Reports the user's role cannot open are not shown. The server still refuses them.
R9 opens straight to its download, with its date range picker.

The old labour and stock reports stay reachable only when their features are switched on, under a group "Other", using their existing screens.

## 11. Replacing the old screens

1. Route `/reports/sales`, `/reports/payments`, `/reports/tax`, `/reports/discounts` and the old Today page to their new equivalents, so old links and bookmarks still work.
2. Delete the old page components for those reports once nothing imports them: `SalesPage.jsx`, `PaymentsPage.jsx`, `TaxPage.jsx`, `DiscountsPage.jsx`, and the old `TodayPage.jsx`. Keep `LabourPage.jsx` and `StockPage.jsx`.
3. Keep `ReportShell.jsx` only if something still uses it. Move anything worth keeping, such as `lastNDays`, into the new code first.
4. Server endpoints from M6 stay. Only client screens are removed.

## 12. Phones

The owner reads reports on a phone more than anywhere else.
1. Every report screen works at 380 pixels wide.
2. Tiles stack in one column.
3. Tables scroll inside their box, with the first column fixed.
4. Filters collapse into one "Filters" button that opens them.

---

## 13. Tests

**Server**
1. R1 at 6:00 PM on the golden day, as section 7 describes.
2. R1 refuses any role the contract excludes.
3. R1's figures equal `computeDayFigures` for the same moment, for the fields they share.

**Client**
This repo has no client test runner. Check each of these by hand in section 16, with the golden day loaded on a local database.

---

## 14. Non-negotiable rules that apply

"Every label on a screen or an export comes from `docs/GLOSSARY.md`." Labels come from the server's envelope and `labels.js`, never typed in a component.
"Store timestamps in UTC. Convert to India time only for display." Through `formatDate.js` only. The P01 guard test will catch a `toLocaleString`.
"Check permissions on the server for every endpoint. Hiding a button in React is not security."
"Reports only add up values frozen onto records." The client adds up nothing. Every total comes from the server.

## 15. Checks and golden day

The check strip shows the server's results exactly.
R1 is proven at 6:00 PM on the golden day.

---

## 16. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand, with the golden day loaded through a small script that runs `tests/helpers/goldenDay.js` against a local database, and 26 September closed:
   1. Open every report for 26 September and compare each headline figure with `docs/TEST-DATA.md` section 4.
   2. Click Pizza's net sales in R11 and land on a Bill List of B03, B05, B07, B12 and B14.
   3. Break one check as in `docs/TEST-DATA.md` section 6, reload, see the red strip, follow its link, then restore the data.
   4. Download R3 as Excel and print R2 on A4 to a PDF.
   5. Open R11 and R12 at phone width.
4. `docs/PROJECT-STATE.md`: the date line, "Next: P19, floor plan.", M19 becomes DONE with the note "Every report built and proven against the golden day", a P18 entry at the top with the oldest moved to the archive, and any place the build differed from the contract as a decision row.
5. `docs/prompts/README.md`: mark P18 as Done.
6. Commits on `main`, one line each, for example:
   `add today report`
   `add one report page for every report`
   `add reports index and charts`
   `replace old report screens`
   `update docs for p18`
7. Push `main`.
8. Print a short summary: commits, files added, changed and deleted, test counts before and after, and anything that did not match by hand.

The small script in 3 is for local use only. Put it in `server/scripts/loadGoldenDay.js`, make it refuse to run unless `NODE_ENV` is development or test and the database host is localhost, the same guard `seedDemo.js` uses, and add `"seed:golden"` to the package files.

---

## 17. Out of scope

The new visual design and themes. That is P20.
Letting the owner choose which tiles show on Today. That is P20.
Server-side PDF.
Scheduled reports by email or WhatsApp.
