# P21 The golden day, end to end

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P20B.

---

## 1. What to build, in one sentence

Play the whole golden day through the real screens in a real browser, each staff member on their own kind of device, at the real times, then check every report against `docs/TEST-DATA.md`, and write a go-live readiness report saying exactly what is proven and what still needs a person.

## 2. Module

M19 proof, and the end of the build plan. After this, `docs/GO-LIVE.md` takes over.

## 3. Why

Every earlier test drives the API.
Caffeza's staff will drive screens: a captain's thumb on a phone, a cook on a tablet in night mode, a cashier on a keyboard.
A screen can call the right endpoint with the wrong amount, hide the button a role needs, or show a number with the wrong label.
Only a test that uses the screens the way staff will can catch those.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P21-golden-day-end-to-end.md`.
2. `git pull`. `git status` should show only that file.
3. `docs/prompts/README.md` must show P20B as Done. If not, stop.
4. Run `npm test` and record the count. It should match P20B's "after" count. If anything fails, stop and tell me.

## 5. Files to read first

1. `docs/TEST-DATA.md`, all of it, especially section 2b, the timeline.
2. `docs/GO-LIVE.md`, all of it.
3. `docs/DESIGN-SYSTEM.md`, now version 2, section 14.
4. `server/tests/helpers/goldenDay.js` and `server/scripts/loadGoldenDay.js`.
5. `server/utils/time.js` with the test clock, and `createApp` in `server/server.js` with the client folder option from P12.
6. The client printing code from P05.
7. Every screen the timeline touches: floor, order, kitchen, bill and payment, delivery, takeaway, No Charge, accounts, cash drawer, Day Close, settings, and the report screens.

---

## 6. Part A. A server for browser tests

`server/scripts/e2eServer.js`.

1. It refuses to start unless `NODE_ENV` is `test`.
2. It starts an in-memory MongoDB replica set, the same way `tests/helpers/testDatabase.js` does.
3. It sets every environment variable the server needs before importing any server module, with fresh random secrets, `CLIENT_ORIGIN` at its own address, and `TRUST_PROXY` false.
4. It builds the app with `createApp`, serving the already-built `client/dist` through the option P12 added, and listens on `127.0.0.1:5055`.
5. It starts a second, separate control listener on `127.0.0.1:5056`, which is **not part of the app** and exists only inside this script:
   `POST /clock` with `{ at }` calls `setClockForTests`.
   `POST /reset` empties the database and sets up the golden restaurant, without playing the day.
   `GET /ready` answers when both are up.
6. The app itself gains no route. Add a test that `createApp()` has no route containing `clock` or `reset`.

Split `goldenDay.js` so its restaurant setup can run on its own: `setupGoldenRestaurant()` returns the restaurant, every staff member's phone and password, and the menu ids, and `playGoldenDay()` plays the timeline through the API as before. Every existing test that uses it must still pass unchanged.

The golden restaurant's staff need passwords a browser can type. Use whatever the user creation API allows. If it only generates passwords, capture them from its response.

## 7. Part B. Playwright

1. Add `@playwright/test` as a development dependency at the root, and install Chromium for it.
2. `e2e/playwright.config.js`: Chromium only, one worker, a long timeout per test, traces and screenshots kept on failure, and a `webServer` that runs `npm run build` once and then `node server/scripts/e2eServer.js` with `NODE_ENV=test`.
3. Root script: `"e2e": "playwright test --config e2e/playwright.config.js"`. It is **not** part of `npm test`, because it takes minutes.
4. Add `e2e/test-results/` and `e2e/screenshots/` to `.gitignore`.

**The browser clock.**
Every page's clock must match the server's.
A helper `at(time)` in `e2e/helpers/clock.js` sets the server clock through `POST /clock`, then calls `page.clock.setFixedTime` on every open page. Install `page.clock` on each page when it opens.

**Printing.**
Browsers in tests cannot print to paper.
Add one small hook to the client's printing code: before printing, if `window.__E2E_PRINT__` is a function, call it with the text and the width, and skip the real print.
Set that function only from an `addInitScript` in the tests, which records every print.
Nothing in the app ever sets it.

**Page helpers.**
One file per screen in `e2e/pages/`, each with plain functions named for what a person does: `openTable(page, 'Table 5', 2)`, `addItems(page, [...])`, `sendToKitchen(page)`, `markReady(page, 'KOT', ...)`, `billTable(page)`, `pay(page, [['CASH', '501.00']])`, `applyDiscount(page, ...)`, and so on.
Find elements by role and visible text, as a person would, never by CSS class.

## 8. Part C. The day, through the screens

One test file, `e2e/goldenDay.spec.js`, one long serial test, with a `test.step` per timeline row so a failure names the exact moment.

**Who is on which device**

| Person | Device | Size |
|---|---|---|
| Owner | Phone | 380 by 800 |
| Manager | Computer | 1280 by 800 |
| Counter, the cashier | Computer | 1280 by 800 |
| Each captain | Phone | 380 by 800 |
| Live Kitchen, Beverages | Tablet | 768 by 1024, night theme |

Each person signs in through the sign-in screen in their own browser context.

**Before the day, at 10:30 AM on 26 September**
The owner sets the invoice series on the Invoice numbers settings screen: prefix `CFA/C/`, starting number 22442, with a reason. Everything else comes from `setupGoldenRestaurant()`.

**The day**
Follow every row of `docs/TEST-DATA.md` section 2b, in order, calling `at()` with each row's time first.
Every action is done on the screen by the person the row names, never through the API.
Between opening and billing an order, the station marks its items ready on the kitchen tablet, and the captain marks them served, if the screens require it.

**Check along the way, on screen**

| Moment | Check |
|---|---|
| 1:12 PM | Live Kitchen's tablet shows the tickets for Table 7 and Table 12 without their drinks. Beverages shows Mocha Flower and Caffe Latte. |
| After each payment | The bill shows Paid, and the total paid matches the timeline |
| 12:30 PM | The bill for Table 5 printed, and its recorded text contains `CFA/C/22442`, `GSTIN` and `501.00` |
| 6:20 PM | The floor shows Table 35 and Table 30 as Open, each with its guest count |
| 8:06 PM | The floor's billing strip shows Table 16 waiting to pay |
| 8:41 PM | B16's bill reads `CFA/C/22454` |
| 9:01 PM | The kitchen screen no longer shows Thecha Paneer Chilli |
| 11:55 PM | Table 4's bill reads `CFA/C/22457` |
| 12:02 AM, 27 Sep | B14's payment is accepted. The bills list, on its default date, still shows 26 September, not 27 |
| 12:30 AM, 27 Sep | The manager's Day Close screen never shows an expected cash figure. After entering ₹3,400.00, a note is required. After closing, it shows Closed. |

**The next morning, 9:00 AM on 27 September, the owner on the phone**

| Report | Check on screen |
|---|---|
| R2 Day Close, 26 Sep | "Balanced, with 1 note". Bill total ₹9,269.00. Net sales ₹8,886.32. GST ₹382.57. Expected cash ₹3,404.00. Counted ₹3,400.00. Difference −₹4.00. |
| R3 Sales by Day | 15 bills, 27 covers, average per cover ₹267.09 |
| R5 Payments | Cash ₹1,754.00, Card ₹1,481.00, UPI ₹1,472.00, Zomato Gold ₹1,998.00, Dineout ₹778.00, Zomato ₹305.00, Swiggy ₹930.00, On Hold ₹551.00 |
| R8 GST | 5% net sales ₹7,651.32, CGST ₹191.31, SGST ₹191.26, platform-collected ₹1,235.00 |
| R10 Invoice Register | 16 numbers, CFA/C/22442 to CFA/C/22457, 22452 voided, no missing number |
| R11 Menu Performance | Pizza net sales ₹1,800.78, share 20.26% |
| R12 Captains | Khuman Singh bill total ₹2,735.00 |
| R15 Cancellations and Voids | Wasted value ₹390.00 |
| R16 No Charge | One, ₹230.00 |
| R17 On Hold Accounts | E-210 Office ₹47.00, W-330 Office ₹504.00 |

Then download R3 as Excel from the owner's screen, open the file in the test with `exceljs`, and check that its net sales total is 8886.32.
Then tap R11's Pizza figure and land on a bill list showing exactly five bills.

**The collection, 1:15 PM on 27 September**
Counter records W-330 Office paying ₹504.00 in cash. The owner reopens R17: W-330 Office shows ₹0.00.

## 9. Part D. Screenshots for a person to review

At these moments, save a full-page screenshot to `e2e/screenshots/`, named for the moment and device:
the floor at 7:45 PM on the captain's phone,
the kitchen at 8:35 PM on the Live Kitchen tablet,
Table 4's bill at 11:55 PM on the cashier's computer,
Day Close at 12:30 AM on the manager's computer,
R2 and R11 on the owner's phone the next morning,
and the floor and R2 again with the theme switched to Day and Night.

These are for Arya and Caffeza to look at. The test does not compare pixels.

## 10. Part E. The readiness report

Write `docs/GO-LIVE-READINESS.md`:

1. **What is proven by tests**, with the counts: `npm test`, the opt-in speed test's timing, `npm run e2e` with its duration, lint, build.
2. **Every gate in `docs/GO-LIVE.md` section 1**, one row each, with a status of exactly one of:
   "Proven by a test", naming the test,
   "Ready, needs a person", saying who and what,
   "Waiting on Caffeza", saying for what,
   or "Waiting on their CA", saying for what.
3. **Every `TO CONFIRM`** still in `docs/CAFFEZA-PROFILE.md` section 15 and `setup/caffeza.json`, as one list.
4. **Every open item** in `docs/PROJECT-STATE.md`'s known problems and open questions.
5. **A plain verdict** in two or three sentences: what must happen before the first real bill, and in what order.

Nothing in it is marked proven unless a test in this repo proves it.

---

## 11. Tests

1. `npm run e2e` passes, end to end.
2. `createApp()` has no `clock` or `reset` route.
3. `e2eServer.js` refuses to start when `NODE_ENV` is not `test`.
4. Every existing test still passes after splitting `goldenDay.js`.

## 12. Non-negotiable rules that apply

"Never create a bill in production to test something." Everything here runs against an in-memory database, through a script that refuses to run outside test.
"Secrets live in `.env`." The e2e server makes its own throwaway secrets and writes none to disk.
"Check permissions on the server for every endpoint." Each person signs in as their real role, so every permission is exercised through the screens.

## 13. Checks and golden day

This is the golden day's final form. If any figure on screen differs from `docs/TEST-DATA.md`, **do not change the expected figure.** Find out whether the screen, the API, or the test data is wrong, and tell me which, with the evidence.

---

## 14. Docs to update

1. `docs/GO-LIVE.md` section 3, stage 1: add "Run `npm run e2e` on the release candidate before each pilot day."
2. `docs/CAFFEZA-BUILD-PLAN.md` section 4: milestone F is done.
3. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Build complete. Next: the gates in `docs/GO-LIVE.md`, tracked in `docs/GO-LIVE-READINESS.md`."
   3. Decision log, dated today: "The golden day is played through the real screens with Playwright, each role on its own device size, with the server and browser clocks moved together. A control listener inside the e2e script moves the clock, and the app has no test routes. | Staff use screens, not the API, and nothing that sets a clock may ever reach production."
   4. "What changed recently": a P21 entry at the top, and the oldest moved to the archive.
4. `docs/prompts/README.md`: mark P21 as Done.

---

## 15. Out of scope

Pixel comparison of screenshots.
Testing on real phones or real printers. That is gate 3 and gate 4 in `docs/GO-LIVE.md`, done by a person.
Running against staging or production.
Any new feature.

---

## 16. Done when

1. `npm test`, `PERF=1 npm test`, `npm run lint`, `npm run build` and `npm run e2e` all pass, with counts and timings recorded.
2. The screenshots exist and have been opened by you once, and anything that looks broken against `docs/DESIGN-SYSTEM.md` section 14 is listed.
3. `docs/GO-LIVE-READINESS.md` is written.
4. Every doc in section 14 is updated.
5. Commits on `main`, one line each, for example:
   `split golden day setup from play`
   `add e2e server with clock control`
   `add playwright and page helpers`
   `play the golden day through the screens`
   `add go-live readiness report`
6. Push `main`.
7. Print a short summary: commits, test counts and timings, the e2e duration, every check that needed a fix and what was fixed, and the readiness report's verdict.
