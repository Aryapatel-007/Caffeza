# Go-live readiness

Where Caffeza's go-live stands at the end of the build plan, on 2 October 2026, after P21.
`docs/GO-LIVE.md` is the checklist; this file says, gate by gate, what is proven and what still needs a person.
Nothing below is marked proven unless a test in this repository proves it.

---

## 1. What is proven by tests

| Run | Result |
|---|---|
| `npm test` | 930 tests, 930 passing, 0 failing, in 6 minutes 45 seconds |
| `PERF=1 npm test` | 931 tests, 931 passing. R19 over a full year, 66,430 bills, answers in 404 ms against a 2 second budget |
| `npm run e2e` | 1 test, the whole golden day through the screens, passing in 1.0 minute (1 minute 10 seconds with the client build) |
| `npm run lint` | Clean |
| `npm run build` | Builds |

What `npm run e2e` proves, in `e2e/goldenDay.spec.js`:
every row of `docs/TEST-DATA.md` section 2b is done on screen by the person it names, on their own device size (owner and captains on a 380 by 800 phone, manager and cashier on a 1280 by 800 computer, the two stations on a 768 by 1024 tablet), with the server's and every browser's clock at the row's time.
Along the way it checks:
the bill for Table 5 prints with `CFA/C/22442`, `GSTIN` and `501.00`;
each station sees only its own dishes at 1:12 PM;
every payment leaves its bill Paid at the timeline's total;
Table 35 and Table 30 show Open with their guests at 6:20 PM;
Table 16 waits in the billing strip at 8:06 PM;
B16 reads `CFA/C/22454` and Table 4's bill `CFA/C/22457`;
Thecha Paneer Chilli is gone from the kitchen at 9:01 PM;
B14's payment at 12:02 AM counts on 26 September and the bills list still opens on 26 September;
the manager never sees expected cash at Day Close, a note is demanded for ₹3,400.00, and the day closes.
The next morning, on the owner's phone: R2 "Balanced, with 1 note" with the bill total, net sales, GST, expected, counted and difference; R3, R5, R8, R10, R11, R12, R15, R16 and R17 at TEST-DATA's figures; R3's Excel file with net sales 8886.32; R11's Pizza figure drilling to exactly five bills; and W-330 Office at ₹0.00 after its ₹504.00 collection.

Screenshots for a person to look at are written to `e2e/screenshots/` on every run.

---

## 2. The gates in `docs/GO-LIVE.md` section 1

| # | Gate | Status |
|---|---|---|
| 1 | The golden day passes end to end | **Proven by a test**: `npm run e2e`, `e2e/goldenDay.spec.js`, and the API golden day in `server/tests/goldenDay.test.js`. It must be run again on the exact release that is deployed. |
| 2 | Their CA has signed off on GST | **Waiting on their CA**: a printed sample bill covering 5%, a discount, an MRP item and a platform delivery at 0%, and written answers to the five CA questions in section 3 below. |
| 3 | The bill prints properly on their printer | **Ready, needs a person**: Rishi prints on Caffeza's own printer model, at their paper width, with "Grilled Tofu Cream Cheese Avocado Focaccia Bagel". The layout is tested; paper is not. |
| 4 | Stations get their tickets | **Ready, needs a person**: Arya sends a test order on staging and watches it reach Live Kitchen and Beverages on their own tablets. Routing to the right station is proven by the e2e test's 1:12 PM check, on a test server. |
| 5 | Staff have practised on staging | **Ready, needs a person**: both developers run the training in `docs/GO-LIVE.md` section 2 with every captain, cashier and station. |
| 6 | The restore drill has been done | **Ready, needs a person**: Arya, `docs/DEPLOYMENT.md` section 8, with the date recorded. |
| 7 | The backup internet works | **Waiting on Caffeza** for the second line to be installed, then Rishi unplugs the main line during a test bill. |
| 8 | The owner has checked the menu | **Waiting on Caffeza**: their full menu or an export of it, then the owner's written sign-off on staging. `setup/archive/caffeza/caffeza-menu.csv` is still partial. |
| 9 | Every staff login works | **Waiting on Caffeza**: names and phone numbers for every person (all eight staff phones in `setup/archive/caffeza/caffeza.json` are TO CONFIRM), then each signs in once on their own device. |
| 10 | On Hold opening balances are agreed | **Waiting on Caffeza**: the owner's written list of what each account owes on cutover day. |
| 11 | Monitoring is on | **Ready, needs a person**: Arya stops staging once and confirms the uptime alert arrives. P30 (2026-10-10), keeping the free server awake: the wake address, the heartbeat from open screens and the GitHub Actions workflow are built; cron-job.org (main pinger), StatusCake (second pinger and the alarm) and the `KEEP_AWAKE_URL` repository variable are **not set up yet**, DEPLOYMENT.md section 14. |
| 12 | Support is arranged | **Ready, needs a person**: both developers put the support card at the counter. |

---

## 3. Everything still TO CONFIRM

From `docs/archive/caffeza/CAFFEZA-PROFILE.md` section 15 and `setup/archive/caffeza/caffeza.json`, as one list.

**From Caffeza**
1. The exact spelling of the trade name on the bill ("Cafezza" or "Caffeza"), the legal name, address, phone and FSSAI number (`restaurant.legalName`, `fssaiLicenseNumber`, `address.line1`, `address.pincode`, `contactPhone`).
2. Whether the tagline "Be Caffeinated" goes on the bill (`settings.receipt.headerLine2`).
3. The full category list, full item list, and whether the menu can be exported to a spreadsheet.
4. The full list of kitchen stations and which categories go to each.
5. Printed KOTs, kitchen screens, or both.
6. Printer models, and whether each is USB or network.
7. Names and phone numbers of the owner, manager, cashiers, captains and the two station logins (`staff[0]` to `staff[7]`), and whether "User Support" becomes the "Counter" cashier login.
8. The commission rate for each platform method (`paymentMethods[3]` to `[7]`), and whether "Dine out" means Swiggy Dineout.
9. Who applies platform discounts at the till today.
10. The outstanding balance of E-210 Office and W-330 Office on cutover day (`accounts[0]`, `accounts[1]`).
11. The physical table layout, for Arrange tables.
12. Whether they want inventory or attendance at launch. Both are built and switched off.
13. The accent colour, chosen on the Appearance page during training (`settings.appearance.accentPreset`).
14. The suggested discount reasons, and the open question beside them in the profile.

**From their CA**
1. CGST and SGST: one rounding per tax rate, as built, or each half rounded per item, as their current system does.
2. Continue the `CFA/C/` series, as set up, or start a new one.
3. 0% on platform delivery orders under section 9(5), as built behind `settings.delivery.platformCollectsGst`.
4. How No Charge orders should be recorded.
5. Whether the tagline and legal name layout on the bill is acceptable.

---

## 4. Every open item in `docs/PROJECT-STATE.md`

**Open questions**
1. The exact access token payload names, if API-CONTRACT ever names them differently from `middleware/authenticate.js`.
2. Everything in section 3 above.
3. Which cloud host, against `docs/DEPLOYMENT.md` section 2.
4. Who applies platform discounts at the till; today only OWNER and MANAGER, with a setting for cashiers, default off.
5. Whether kitchen station logins may cancel items, as Caffeza's do today.
6. Whether a cashier may charge a bill to an On Hold account.

**Known problems still open**
1. No CA has reviewed the GST output on a real printed bill (gate 2).
2. No bill has printed on a real thermal printer (gate 3).
3. Arya has not read the modules Rishi built off-owner: M1, M4, M5, M6, M7, M8, M10, M16 to M20.
4. A variant or add-on can be removed while a recipe or an open order line points at it.
5. There is no price history for menu items.
6. Two tablets on the availability board do not see each other's toggles until they refetch.
7. The attendance clock screen has no all-roles read for its grid (attendance is off for Caffeza).
8. `operationsReportService.js` still reads the business-day start directly rather than through `settingsService`.
9. Two error-copy maps, M1's and M2's, where the design asks for one.
10. `provisionRestaurant.js` has its own copy of the optional-transaction code.
11. The kitchen display polls every ten seconds.
12. `GET /kots` filters a derived status after paging; harmless below 50 open tickets.
13. Client date filters assume the business day starts at 5:00 AM. Caffeza's does.
14. The redundant single-field `restaurantId` index.

**Found by P21**
15. A No Charge order's kitchen ticket stays on the station board, and turns late, until the station marks it ready. In the golden day nobody does, so Table 29's ticket is still on Live Kitchen at 8:35 PM. Staff should mark it ready when the food goes out; whether No Charge should clear it is a product decision.
16. The order screen merges a second tap on a dish into the unsent line of the same dish. To enter B02's three Roasted Papad as three lines, as the timeline says, the captain sends to the kitchen between them. Totals are the same either way.
17. The golden restaurant has no KITCHEN login, so the two station tablets in the e2e test sign in as the manager. Caffeza's setup file does have the two station logins.
18. A printed bill's time bar on the floor counts from when the table opened, not from when the bill printed, because the floor read does not carry the print time (DESIGN-SYSTEM section 13a).


**Found by P30, 2026-10-10** (`docs/PERFORMANCE-BASELINE.md`)
19. The server is on Render's free plan, by Rishi's choice. It sleeps after 15 minutes with no request, and the first screen after that, including the first till of the morning, waits for it to start: about a minute by Render's own account. The cold start was not measured, because Z Chaat was in service the whole session; the baseline file has the command to run before opening. This wait is the price of the free plan, and it goes away on a paid plan with no code change.
20. The server is in Singapore and the database in Mumbai. Every query crosses between them. The plan is `docs/DEPLOYMENT.md` section 15.
21. The live screens were React's development build, about twice the JavaScript and slower to render, because the client's build read `NODE_ENV=development` from the root `.env`. Fixed in P32.

---

## 5. Verdict

The software is built and proven against the golden day, through the API and through the real screens on each device. Nothing in the code blocks a pilot. What blocks the first real bill is people:
first Caffeza's answers (menu, staff, accounts, printer, the second internet line), so staging can be set up from `setup/archive/caffeza/caffeza.json` and the menu import;
then their CA's sign-off on a printed sample bill and on the invoice series;
then the printer, station, restore, monitoring and backup-line checks on staging, the staff training, and `npm run e2e` once more on the release being deployed, before the first pilot day.
