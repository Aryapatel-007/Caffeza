# P25 Z Chaat, the cashier, and integrations: Swiggy, Zomato, Pine Labs and Tally

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Repository:** https://github.com/Aryapatel-007/Caffeza
**Depends on:** P23, online takeaway orders and table reservations, which is built. P24, advance payment, dish photos and the new public page, may or may not be built yet. This prompt does not touch online payments, dish photos or the public page, so it works either way. Check which in `docs/prompts/README.md`.
**Size:** very large. Fourteen parts, A to N. Each part ends in its own commits and is ticked in a progress table, so a later session can carry on from the first unfinished part.

---

## 1. What to build, in one sentence

Move the system from Cafezza to its new client, Z Chaat, removing the mock data; fix bill printing so it fills the page; let captains bill; let staff cancel an item after a bill is made; count cash by notes and coins; and add a general integrations module, M21, so any restaurant can receive Swiggy and Zomato orders, take Pine Labs card and UPI payments from the bill, and send closed days into TallyPrime or Tally.ERP 9.

## 2. Who this is for

The live client is now **Z Chaat**, an Indian street food restaurant in Kudasan, Gandhinagar.
Cafezza is no longer the client. Its files are archived, not deleted.
Everything in this prompt is built for **any** restaurant. Nothing names Z Chaat in code. Z Chaat's details live only in its setup file, its profile document and its own records in the database.

---

## 3. You are a new session. Do this first

You have none of the history behind this project. These steps give it to you.

1. If the repository is not on this machine, run `git clone https://github.com/Aryapatel-007/Caffeza.git` and work inside it. If it is, run `git pull` on `main`.
2. Run `git log --oneline -1`. It must be `54e78cd` or later. If it is older, stop and tell me.
3. Run `npm ci` at the root.
4. If there is no `.env` at the root, copy `.env.example` to `.env` and **stop and ask me for `MONGO_URI`**. Never guess it, never commit it. The database is a MongoDB Atlas cluster, and this machine's IP address must be on its Network Access list, which I add by hand.
5. If there is no `server/.env.test`, copy `server/.env.test.example` to it. Tests use an in-memory database and need no Atlas access.
6. Read `CLAUDE.md` in full. It loads the project's state, plan, conventions and glossary, and lists the long specs to read when a task needs them. Every rule in it applies here.
7. Save this entire prompt, exactly as given, to `docs/prompts/P25-zchaat-cashier-integrations.md`.
8. Read section 5, "How this prompt runs", before any code.

This repository is **public**.
Anything committed is readable by anyone.
That is why section 6 exists.

---

## 4. What is true about each partner, and what must not be guessed

Checked on 8 October 2026. Build on these facts. Where a fact is not known, this prompt says so, and you must not invent it.

### 4a. Swiggy and Zomato

1. Neither platform publishes an open API for restaurants or POS software.
2. A POS receives their orders only after the platform approves it as an integration partner, or through an approved middleman such as UrbanPiper or Deliverect.
3. The API documents, addresses, payload fields, signature rules and test credentials come from the platform **with that approval**. They are not public.
4. So this prompt builds everything around the platform connection completely, plus a **sandbox platform** that behaves like one, and a clearly defined adapter for each real platform.
5. A real adapter is implemented **only** from the platform's own document, placed in `partner-docs/`, section 6. If there is no document for a platform, its adapter is built as "waiting for partner approval", as Part H says. **Never guess an endpoint, a field name or a status code for Swiggy or Zomato.**

### 4b. Pine Labs

Pine Labs publishes its in-store cloud integration openly: https://developer.pinelabs.com/in/instore/cloud-integration
Read that page before Part I. In short:

1. The billing system posts a bill amount with **UploadBilledTransaction**. The response carries a `PlutusTransactionReferenceID`, the PTRID.
2. The card machine picks up that PTRID, by the cashier choosing it or entering it, and takes the payment by card, UPI or another allowed mode.
3. The billing system reads the result with **GetStatus**, or Pine Labs posts it to a postback address the merchant registers.
4. There are also **CancelTransaction** and Force Cancel.
5. `MerchantID` and `SecurityToken` are issued by Pine Labs to the merchant and go on every call. `StoreId` and `ClientId` identify the store and its terminals.
6. `Amount` is in **paise**, which matches this system's money rule.
7. `AllowedPaymentMode` is a code: 0 means every mode enabled on the terminal, 1 card, 10 UPI sale, 11 UPI Bharat QR, and others listed on that page.
8. A split payment uses one upload per part, each with its own `SequenceNumber` starting at 1, and its own PTRID.
9. Success has `ResponseCode` 0. GetStatus returns `TransactionData` as Tag and Value pairs, such as `RRN`, `ApprovalCode`, `TID`, `PaymentMode` and `AmountInPaisa`.
10. The UAT base address shown is `https://www.plutuscloudserviceuat.in:8201`. The production address is **not** published. It comes from Pine Labs with the merchant's credentials.
11. Cancel and Force Cancel fields, and the exact URL path of each call, are not on the public page. They come in the integration document Pine Labs sends with the credentials.

So: implement Pine Labs from the public page. Keep the base address and every path in the connection's settings, never in code. Where the public page is silent, read `partner-docs/pinelabs/` if present. If a detail is still missing, build to the public page, mark the gap in `docs/INTEGRATIONS.md`, and tell me.

### 4c. Tally

Both versions are in use: **TallyPrime** and the older **Tally.ERP 9**. This prompt supports both.

1. Both accept data as **XML posted over HTTP** to Tally's own server, port **9000** by default, once it is switched on in Tally's settings. https://help.tallysolutions.com/xml-integration/
2. Both can also **import an XML file** through their own import menu.
3. The XML is an `ENVELOPE` with a `HEADER` whose `TALLYREQUEST` is `Import Data`, and a `BODY` with `IMPORTDATA`, `REQUESTDESC` holding `REPORTNAME` (`Vouchers` or `All Masters`) and `STATICVARIABLES` with `SVCURRENTCOMPANY`, then `REQUESTDATA` holding `TALLYMESSAGE` elements, each with a `VOUCHER` or `LEDGER`.
4. In a ledger entry, a **debit** has `ISDEEMEDPOSITIVE` `Yes` and a **negative** `AMOUNT`. A **credit** has a positive `AMOUNT`. Tally's own receipt voucher example shows exactly this.
5. Native JSON exchange exists only from **TallyPrime 7.0**. Tally.ERP 9 has none. So **use XML only**, the one format both versions accept.
6. Tally runs on the accountant's or restaurant's own Windows computer. **Our cloud server cannot reach port 9000 there.** Part K builds a small bridge program that runs on that computer.
7. Tally's documentation confirms altering a voucher by its Master ID, and finding errors through `LINEERROR` in the response. It does not clearly document a stable external ID for re-sending, and its pages show more than one response shape. So this prompt **never alters or replaces a voucher in Tally**, and parses responses defensively.
8. Both versions have a free **Educational mode**. In it, vouchers can be dated only on the 1st, 2nd and 31st of a month. Manual test data must fall on those dates.

Version differences found while testing go into a version profile in code, Part J, and into `docs/INTEGRATIONS.md`. Never branch on the version anywhere else.

---

## 5. How this prompt runs

1. Work through the parts **in order**.
2. When you start Part A, add this table to a P25 entry at the top of "What changed recently" in `docs/PROJECT-STATE.md`:

```
P25 progress
- [ ] A Spec
- [ ] B Move to Z Chaat, remove mock data
- [ ] C Bill printing
- [ ] D Captains bill
- [ ] E Cancel an item after billing
- [ ] F Cash by notes and coins
- [ ] G Integrations foundation
- [ ] H Swiggy and Zomato
- [ ] I Pine Labs
- [ ] J Tally vouchers
- [ ] K Tally bridge
- [ ] L Integration screens
- [ ] M Onboarding runbook
- [ ] N Full check
```

3. Tick a line only when that part is committed and pushed.
4. **If this session is running out of room**, finish the part you are on, commit, push, tick it, and stop with a summary. A new session given this same prompt reads the table and starts at the first unticked part.
5. After each part, run the tests that part touched. Run the **whole** suite in Part N.
6. Parts B and C are the most urgent for Z Chaat. Do not reorder them.
7. Three places in Part B say **stop and ask me**. Stop there, ask, and continue in the same session after I answer.
8. If a part needs something only I can give, such as a credential or a partner document, and this prompt does not say to stop, build that part as far as it can go, write the gap into `docs/INTEGRATIONS.md` or the Z Chaat profile, and carry on.

**Resuming:** if `docs/PROJECT-STATE.md` already has a P25 progress table, skip every ticked part, re-read the files list in section 8, and begin at the first unticked part.

---

## 6. Secrets, partner documents and backups in a public repository

1. In Part A, before anything else, add `partner-docs/` and `backups/` to `.gitignore`.
2. I put partner documents in `partner-docs/swiggy/`, `partner-docs/zomato/` and `partner-docs/pinelabs/`, on my machine only. They are often under a confidentiality agreement. **Never commit them, and never copy text from them into the repository**, including docs, tests or fixtures. Write field mappings in your own words in code comments.
3. Partner credentials are typed into the Integrations screen by an owner and stored encrypted. They are never in a file, an environment variable, a log line, an error message, an audit line, a test fixture or an API response.
4. Example payloads in tests are made up by you, in the shapes this prompt defines, never copied from partner documents.
5. `backups/` holds the exports Part B makes before removing anything. They contain real restaurant data. Never commit them.

---

## 7. Modules

| Part | Module |
|---|---|
| B | Phase 2 onboarding, plus a new purge tool |
| C | Printing, from P05, M3 |
| D | M3 Billing, M7 Settings |
| E | M3 Billing, M2 Orders, M10 Payments |
| F | M16 Settlement and Day Close, M10 Payments |
| G to M | **New M21 Integrations**, owner Arya, three areas sharing one foundation: order channels, payment terminals, accounting |

---

## 8. Files to read first

Read these before Part A. Re-read the relevant ones at the start of each later part.

1. `CLAUDE.md`, and through it `docs/PROJECT-STATE.md`, `docs/CAFFEZA-BUILD-PLAN.md`, `docs/CONVENTIONS.md`, `docs/GLOSSARY.md`.
2. `docs/prompts/P23-online-orders-reservations.md` and `docs/prompts/P24-online-payments-photos-look.md`, and the M14 section of `docs/API-CONTRACT.md`. P23 already built a collection called `onlineorders`, an incoming request alert with a chime, a spoken announcement and a banner, and the staff screens for incoming requests. **Part H reuses that alert and those screens. It must not build a second one, and it must not reuse the name `onlineorders`.**
3. `docs/API-CONTRACT.md`: the M3 bills, M10 Payments, M16 Settlement and Day Close, M17 Delivery and Platform Orders, M18 Kitchen Stations, M7 settings, M8 audit trail and M19 R9 Tally Export sections.
4. `docs/DB-SCHEMA.md`: orders, bills, payment methods, accounts, platform payouts, cash movements, day closures, settings, and sections 26 to 30. New sections in this prompt start at **31**.
5. `docs/RECONCILIATION-RULES.md` and `docs/TEST-DATA.md`.
6. `docs/DEPLOYMENT.md`, its environment variables, and its note that version 1 runs as **one** server instance.
7. `server/server.js`, `server/config/env.js`, `server/models/index.js`.
8. `server/controllers/orderController.js`, especially `createOrder`, `cancelOrderLine` and `rethrowPlatformConflict`. Order creation lives in the controller today.
9. `server/services/orderService.js`, `kitchenService.js`, `billService.js` (all of it, especially `createBill`, `applyDiscount`, `recordPayment` and `voidBill`), `billPermissionService.js`, `paymentMethodService.js`, `payoutService.js`, `dayCloseService.js` and its `blockersFor`, `dayFiguresService.js`, `receiptService.js`, `authService.js` and its `verifyPin`, `settingsService.js`.
10. `server/routes/billRoutes.js`, `orderRoutes.js`, `settingsRoutes.js`.
11. `server/utils/money.js`, `server/utils/tax.js` and its `splitBillAcrossPayments`, `server/utils/time.js`, `server/utils/colour.js`.
12. `server/config/platforms.js`, `cancelReasons.js`, `discountReasons.js`.
13. `server/services/reports/definitions/tallyExport.js`, the existing R9 Excel export.
14. `server/scripts/setupRestaurant.js`, `importMenu.js`, `provisionRestaurant.js`, `loadMockDays.js`, `seedMockDays.js`, `lib/asTest.js`, and `setup/README.md` and `setup/caffeza.json`.
15. `e2e/cloudFlow.spec.js` and `e2e/cloud.config.js`.
16. On the client: `client/src/features/printing/` (all of it), `features/billing/BillScreenPage.jsx`, `ReceiptPreviewPage.jsx`, `VoidBillPanel.jsx`, the payment panel, `features/settlement/DayClosePage.jsx`, the cash drawer screen, the order screen and `OrderLineList.jsx`, the kitchen screen, the settings page and its sections, and `client/src/components/ui/`.
17. `docs/DESIGN-SYSTEM.md`, version 2, for every screen.

---

## Part A. Spec first

Write the spec, then commit it on its own, before any code: `spec p25 zchaat cashier and integrations`.

1. First, on its own commit, add `partner-docs/` and `backups/` to `.gitignore`: `ignore partner docs and backups`.
2. `docs/API-CONTRACT.md`:
   1. In the M3, M10 and M16 sections: every endpoint and rule from Parts C to F.
   2. A new section **"M21 Integrations"** with every endpoint from Parts G to K, each with roles, request, response, rules and error codes, and a permission table in the style of the other modules.
3. `docs/DB-SCHEMA.md`: one section per new collection, numbered from 31, with fields, indexes and the reason for each index, and every new field on existing collections and settings.
4. `docs/CONVENTIONS.md` section 3: the new error codes.
5. `docs/GLOSSARY.md`: new terms: cash count, tendered, change, refund owed, print request, bill printer, platform order, order channel, sandbox platform, item mapping, payment terminal, terminal payment, PTRID, Tally voucher, ledger mapping, Tally bridge.
6. The new audit actions and reason codes from every part, in the M8 section.
7. `docs/CAFFEZA-BUILD-PLAN.md` section 2: add M21, with one sentence saying it is a product module, not a client module.

Where this prompt leaves a small detail open, choose what fits the existing code, write it in the spec, and list it in your summary.

---

## Part B. Move to Z Chaat, and remove the mock data

### B1. See what is in the cloud database. Read only.

New script `server/scripts/listRestaurants.js`, `npm run db:restaurants`, reading only.
It prints the database host and name first, then one row per restaurant: id, name, created date, and counts of users, orders, bills and day closures.

Run it against the cloud database.
**Stop and ask me which restaurants to remove.** Show me the list. Do not decide yourself which ones are mock data.

### B2. A careful purge tool

New script `server/scripts/purgeRestaurant.js`, `npm run purge:restaurant`:

```
npm run purge:restaurant -- --restaurant <id> --confirm "<exact restaurant name>"
npm run purge:restaurant -- --restaurant <id> --confirm "<exact restaurant name>" --apply
```

1. Without `--apply` it changes nothing. It prints the host and database, then, for every model in `server/models/index.js`, how many documents belong to that restaurant, and whether any stored files, such as logos and dish photos, belong to it.
2. `--confirm` must match the restaurant's name exactly, or it refuses.
3. With `--apply`, **first** it exports every document of that restaurant, collection by collection, as Extended JSON files into `backups/<restaurant name>-<date and time>/`, and stops if any export fails. Only then does it delete, collection by collection, the restaurant document last. It prints each count as it goes. Running it again after a failure finishes the job.
4. Every collection is found through the model registry. A model added later is covered without editing the script. A test checks this, the same way P01's index test does.
5. Rule change, written in the decision log: **this is the only tool that hard deletes, and only for restaurants I name as mock or test data.** It must never be run on a restaurant that has traded for real. The non-negotiable "never hard delete a bill" still holds for everything else.

Run it as a dry run on each restaurant I named in B1, show me the counts, and **stop and ask me to confirm** before `--apply`.
After I confirm, apply it, and run `npm run db:restaurants` again to show what is left.

### B3. Remove the mock data tools

The ten-day mock loader was built for "Cafezza Demo". Remove it:

1. Delete `server/scripts/loadMockDays.js`, `server/scripts/seedMockDays.js`, and any helper only they use.
2. Remove `seed:mock` and `seed:mock:golden` from both `package.json` files.
3. Move `setup/caffeza-zomato-menu.csv` to `setup/archive/caffeza/`.
4. Keep `seed:demo` and `seed:golden`. They are for a local database and tests only, and already refuse a cloud host unless it is listed in `SEED_DEMO_ALLOWED_HOSTS`.
5. **Remove the cloud host from `SEED_DEMO_ALLOWED_HOSTS` in `.env`**, and say so in your summary, because the cloud database now holds a real restaurant.
6. `e2e/cloudFlow.spec.js` creates bills in the cloud database. The cloud database now holds Z Chaat's real bills, and `CLAUDE.md` says never to create a bill in production to test something. Make `npm run e2e:cloud` refuse to start unless a new variable, `E2E_CLOUD_DATABASE`, is set and equals the database name in `MONGO_URI`, and add a line to `docs/DEPLOYMENT.md` saying it must only ever point at a separate staging database. Change it to use a restaurant named in a second variable, `E2E_CLOUD_RESTAURANT`, instead of "Cafezza Demo".

### B4. Archive Cafezza

Move, with `git mv`, keeping history:

| From | To |
|---|---|
| `docs/CAFFEZA-PROFILE.md` | `docs/archive/caffeza/CAFFEZA-PROFILE.md` |
| `setup/caffeza.json`, `setup/caffeza-menu.csv` | `setup/archive/caffeza/` |
| `docs/brand/cafezza-*` | `docs/archive/caffeza/brand/` |

Keep in place: `docs/CAFFEZA-BUILD-PLAN.md`, because it is the history of P00 to P22 and other docs link to it. Add two lines at its top saying it was written for Cafezza, that the live client is now Z Chaat, and pointing to the Z Chaat profile.
Keep the golden day in `docs/TEST-DATA.md` and its tests exactly as they are. Their dish names come from Cafezza's menu, but they are a test fixture, not a client. Add one line to `docs/TEST-DATA.md` saying so.

Update every link to a moved file. Leave dated history entries alone.

### B5. Nothing restaurant-specific in the code

Search `server/` and `client/src/` for "Caffeza" and "Cafezza".

1. Comments describing history can stay.
2. Any user-visible text, default value, constant or behaviour that belongs to Cafezza becomes generic or a setting. Known examples: the On Hold Tally code `P03` in `tallyExport.js`, moved into a setting in Part J; anything in `useDeviceSettings.js`, `guestTokens.js`, `labels.js`, `LineOptionsPanel.jsx`, `colour.js` and `Restaurant.js` that names it. Read each one and decide.
3. List every change in your summary.

### B6. The Z Chaat profile

Write `docs/clients/zchaat/PROFILE.md` in the style of the archived Cafezza profile, from these facts, read from their menu and table cards on 8 October 2026:

| Fact | Value |
|---|---|
| Name on the menu | "Z. Chaat", with the line "Indian Street Food" |
| Lines on their cards | "Swaad bhi, Yaad bhi!" and "Ek Baar Try Karoge... Baar Baar Aaoge!" |
| Address | E-19/20, Ground Floor, Siddhraj Z Square, Podar International School Road, Kudasan, Gandhinagar 382421 |
| Phones | 76008 58900 and 76008 59800 |
| Order types | Dine in, takeaway, home delivery |
| Tax | Prices are exclusive of taxes, by their own terms. 5% GST, split CGST 2.5% and SGST 2.5%. Their catering plans say "+ 5% tax". |
| Payments accepted | Cards and UPI, by their own terms |
| Open | Seven days a week |
| Jain | Jain options on request. "Jain" is already one of the quick notes to the kitchen. |
| Their terms | "Orders once placed cannot be cancelled". This is about guests. Staff still need Part E, for mistakes. |
| Menu | 97 dishes in 14 categories, in `setup/zchaat-menu.csv`, section 9 of this prompt |
| Catering | Plan A ₹649 and Plan B ₹749 per person, plus 5%, each a set of choices from the menu |
| Brand colours, measured from their menu file | Brick red `#A64220`, saffron `#F4A026`, cream `#F6EFD8` and `#EDE6CE` |
| Feedback | A table card asks guests to scan a QR code to leave a review |

And a "To confirm" section with every one of these:

1. Legal name, GSTIN and FSSAI number. All three must print on every bill.
2. Tables: how many, their names, and their sections.
3. Kitchen stations, and which categories go to each. The suggestion in B7 is only a starting point.
4. Staff: names, phone numbers and roles.
5. Payment methods, including whether Card and UPI go through a Pine Labs machine, and which platforms they use: Swiggy, Zomato, Zomato Gold, Dineout, EazyDiner or others.
6. Business hours, and so the business day start.
7. **Water Bottle ₹50 and Aerated Drinks ₹70.** If these are sold at their printed MRP, GST must not be added on top. Store them before tax so the bill lands on the MRP, as was done for Cafezza's water bottle, for example ₹47.62 for ₹50.
8. Breads, "Plain/Butter": is butter the same price?
9. Catering: billed as the two plan items per person with the choices in a note, as the menu file does now, or another way.
10. Invoice prefix and starting number, set by hand on cutover day.
11. On Hold accounts, if any.
12. The review link for the QR code on the bill, Part C5.
13. The logo, as a PNG or SVG with a transparent background, for the Appearance page.
14. Tally version, company name and ledger names, Part J.
15. Pine Labs Merchant ID, Security Token, Store ID and terminal Client IDs, Part I.

Add the profile to the "Read these when the task needs them" table in `CLAUDE.md`, replacing the Cafezza profile row.

### B7. The Z Chaat setup files

1. Write `setup/zchaat-menu.csv` **exactly** as given in section 9 of this prompt.
2. Extend `importMenu.js` to accept an optional seventh column, `description`, which fills the menu item's existing `description` field. Files with six columns keep working. Update `setup/README.md`. Add tests: a file with descriptions, a file without, and a description containing commas and quotes.
3. Write `setup/zchaat.json` in the same shape as the archived `caffeza.json`:
   1. Restaurant: name "Z Chaat", city Gandhinagar, state Gujarat, the address and phone above. Legal name, GSTIN and FSSAI number `"TO CONFIRM"`.
   2. Settings: tax exclusive at 5%; business day start 300 until confirmed; inventory and attendance off until Z Chaat asks; platform-collected GST on.
   3. Receipt: header line 2 "Indian Street Food", footer "Swaad bhi, Yaad bhi!".
   4. Appearance: warm neutral tone; brand pair `#A64220` with `#F6EFD8` on it, which measures 5.3 to 1; wordmark "Z. Chaat"; second language Gujarati. `#A64220` cannot be the accent, because it sits too close to the red Late state, just as Cafezza's brown was refused. Pick the accent preset nearest to it that the colour rules accept, and say which in your summary.
   5. Stations, as a starting point to confirm: "Chaat Counter" for Bhel and Chaat Darbar; "Tandoor" for Kulcha and Breads; "Beverages" for Desi Tadka Sharbat, Beverages and Roll Cut Kulfi; "Kitchen" for everything else, as the default station.
   6. Tables, staff, accounts, logos and payment method details: `"TO CONFIRM"`, so the setup script skips them.
4. Run `npm run setup:restaurant` and `npm run import:menu` as **dry runs** with these files, and show me the output.

### B8. Create Z Chaat in the cloud database

**Stop and ask me** for the owner's phone number and my go-ahead.
Then run `npm run provision:restaurant` for Z Chaat, then the setup script and the menu import with `--apply`.
Do not set the invoice series. That is done by hand on cutover day, as `docs/GO-LIVE.md` says.

### B9. Tests for Part B

1. The purge tool's dry run changes nothing. With `--apply` on a test restaurant in the in-memory database, every collection has nothing left for it, the backup files exist and contain every document, and another restaurant is untouched.
2. A wrong `--confirm` name is refused.
3. Every model in the registry is covered by the purge tool.
4. `setup/zchaat.json` and `setup/zchaat-menu.csv` pass a dry run: 97 items in 14 categories, 105 rows with sizes.
5. A guard test: no file under `server/` or `client/src/`, outside comments, tests and `docs`, contains "Caffeza" or "Cafezza" as user-visible text or a default value. Write the check carefully, so comments do not trip it.

Commits, for example: `add read only restaurant list`, `add purge tool with backup`, `remove mock data tools`, `archive cafezza`, `make cafezza defaults generic`, `add z chaat profile and setup files`, `import menu descriptions`.

---

## Part C. Bill printing that fills the page

### C1. The cause

Reported: a printed bill fills only a small part of the paper, at the top left.

`client/src/features/printing/printText.js` writes `@page { size: 80mm auto; margin: 0 }`.
**`80mm auto` is not a valid page size in CSS.** `size` takes one or two lengths, or a keyword, but not a length with `auto`. Chrome ignores the whole rule, falls back to the printer's own paper, usually A4, and the receipt prints as an 80 mm strip in its top left corner.

Confirm this first: open the print dialog for a bill in Chrome, choose "Save as PDF", and check the PDF's page size. Write what you found in your summary.

### C2. One printer setting per device

Replace the device's paper width with a **printer** setting: `THERMAL_80`, `THERMAL_58`, `A4` or `A5`.
A device that had 80 or 58 becomes `THERMAL_80` or `THERMAL_58` on its next load. Keep the single storage key from P05.
Show the choice on the "This device" page and the receipt preview page, with one line under each choice saying what it is for.

### C3. Thermal rolls

1. Lay the receipt out in the hidden frame first, with a real width, not 0, then measure its height.
2. Set `@page { size: <width>mm <measured height + 4>mm; margin: 0 }` with both lengths, so Chrome makes one page exactly the size of the receipt.
3. Put this in a pure function, `pageCss({ printer, contentHeightMm })`, so a server test can import and check it, the way P01 tested the client's business date mirror.
4. KOTs and the Day Close print use the same code and the same setting.

### C4. Full page, A4 and A5

A shop with an ordinary printer must get a proper full-page tax invoice, not a stretched roll.

1. A new endpoint, `GET /bills/:billId/invoice`, same roles as the receipt, returns the bill as structured data: restaurant name, legal name, address, phone, GSTIN, FSSAI number, invoice number, date and time in India time, order type, table, captain, guests, each line with quantity, rate and amount, discount, net sales per GST rate, CGST, SGST, round-off, bill total, payments, and the footer.
2. **The text receipt and this data come from one function in `receiptService.js`**: build the data once, then lay it out as text for thermal paper, or return it as data for the full page. A test checks every amount is identical in both, for every golden day bill.
3. The client lays it out as an A4 or A5 page: the logo at the top if the restaurant has a light-ground logo, the restaurant's details, an invoice box, a line table, the tax table, the totals with the bill total largest, the payments, and the footer. Margins 12 mm. Black on white, whatever the screen theme. Nothing cut through a row.
4. KOTs and the Day Close on A4 or A5 print as a large, simple block at the top of the page. They are short and do not need a full layout.

### C5. Review link on the bill

A new optional receipt setting, `reviewLinkUrl`, an `https` address up to 300 characters, owner only, audited like every setting.
When set, every printed bill, thermal and full page, ends with a QR code for it and the words "Scan to review us".
Draw the QR code on the client with the `qrcode` package, as an SVG, about 30 mm square on thermal paper.

### C6. Tests for Part C

1. `pageCss` gives two lengths for each thermal size, and never `auto`.
2. Receipt text and invoice data agree, for every golden day bill.
3. The invoice endpoint's roles match the receipt's.
4. `reviewLinkUrl` refuses `http`, anything not a web address, and anything over 300 characters.

By hand, in section 15: print one bill on each of the four settings to "Save as PDF" and check the page size and that the bill fills it.

Commits, for example: `fix thermal page size`, `add printer choice per device`, `add full page tax invoice`, `print a review qr on bills`.

---

## Part D. Captains can bill

Asked for by the owner: the captain who serves the table makes the bill.

### D1. Settings

A new group, `settings.billing`, owner only, audited:

| Field | Default | Meaning |
|---|---|---|
| `captainsMayBill` | `true` | A WAITER may create the bill for a dine-in or takeaway order |
| `captainsMayTakePayment` | `false` | A WAITER may also record payments on those bills |

### D2. On the server

1. `POST /bills` accepts WAITER when `captainsMayBill` is on, for orders that are not delivery orders. Platform orders are billed by the integration, Part H.
2. `POST /bills/:billId/payments` accepts WAITER only when `captainsMayTakePayment` is also on.
3. Put both rules in `billPermissionService.js`, where every bill permission already lives. Discounts, voids and corrections do not change.

### D3. Printing a captain's bill at the counter

A captain's phone usually has no printer.

1. Bills gain, additively: `printRequestedAt`, `printRequestedBy`, `lastPrintedAt`, `printCount`.
2. `POST /bills/:billId/print-request`, for every role that can read the bill: asks for the bill to print at the counter.
3. `GET /bills/print-queue`, for OWNER, MANAGER and CASHIER: bills whose print request is newer than their last print, oldest first.
4. `POST /bills/:billId/printed`: records a print, adding 1 to `printCount`.
5. A device setting on the counter computer, "Print bills sent by captains", like the KOT auto-print from P05: it checks the queue every 5 seconds, prints each bill once on its own printer, and records it. It remembers what it printed on the device, so a reload never prints twice.
6. The captain's order screen shows **Make bill** when the order can be billed. After the bill is made, it shows **Print at counter**, and **Print here** if this device has a printer set.
7. A bill printed for the second time or later says "Duplicate" at the top.

### D4. Tests for Part D

1. With the defaults, a WAITER creates a bill for a dine-in order, and is refused one for a delivery order.
2. A WAITER is refused a payment unless `captainsMayTakePayment` is on.
3. With `captainsMayBill` off, a WAITER is refused, exactly as before.
4. A print request appears in the queue once, and leaves it after `printed`. A second print request puts it back, and the second print says "Duplicate".

Commits, for example: `let captains bill`, `print captains bills at the counter`.

---

## Part E. Cancel an item after the bill is made

Today an item can be cancelled only before billing. Afterwards, staff must void the bill and start again by hand.

### E1. Why it works this way

An invoice number is a legal record and is never edited. So cancelling an item after billing means, in one step:
void the bill, cancel the item, and make a new bill for what is left, carrying over the discount and the payments.
Voiding already removes a bill's payments from the day's figures, so the money stays right.

### E2. The endpoint

`POST /bills/:billId/cancel-lines`

```json
{
  "lines": [{ "lineId": "...", "wasPrepared": true }],
  "reasonCode": "MODIFICATION",
  "note": "Guest changed their mind",
  "approval": { "approverId": "...", "pin": "1234" }
}
```

Who:
1. OWNER and MANAGER, with no `approval`.
2. CASHIER and WAITER, only with an `approval` from an OWNER or MANAGER of the same restaurant, checked with `authService.verifyPin`, which issues no session and already locks after 5 wrong PINs.

Reasons: the existing line cancel reasons. `OTHER` needs a note, as everywhere.
Whole lines only. If the existing line cancel already supports part of a line's quantity, support it here the same way.

Refused, each with a plain message:
1. The bill's business day is closed. The existing `assertDayOpen` refuses it.
2. The bill is already voided.
3. It is a platform delivery order. Part H handles those.
4. A line is not on this bill.

### E3. What happens, in one transaction

1. Void the bill with reason `ITEMS_CHANGED`, and the note "Items cancelled after billing:" followed by their names.
2. Cancel the chosen order lines with the given reason and `wasPrepared`, through the same code as the existing line cancel, including stock and KOT handling.
3. If live lines remain, create a new bill for the order. `createBill` runs its own transaction today. Refactor it so its core runs inside a transaction it is given, with no change in behaviour.
4. Re-apply the old bill's discount: same reason and funding. A percent stays the same percent. A flat amount stays the same, but never more than the new item total.
5. Carry the payments over, in this order: platform and card and UPI payments first, then cash. Record each again on the new bill with the same method and frozen details, a new field `carriedFromBillId`, and the original `receivedAt` and business date, until the new bill total is covered.
6. What is left over:
   1. Cash: the screen says "Give back ₹X in cash". Nothing is recorded, because the voided payment no longer counts and the new one is smaller, so expected cash is already right.
   2. Anything else: a **refund owed**, in a new collection, E4.
7. If the old bill was charged to an On Hold account, charge the new bill to the same account for whatever is not paid.
8. If no live lines remain, cancel the whole order with the same reason, and treat every payment as left over.
9. Write audit `BILL_LINES_CANCELLED_AFTER_BILLING` with the old and new bill numbers, the amount difference, who did it and who approved it. OWNER only in the audit trail.

The response gives the new bill, the voided bill's number, cash to give back, and refunds owed.

### E4. Collection `refunds`

| Field | Notes |
|---|---|
| `restaurantId`, `branchId` | From `baseSchema` |
| `billId`, `voidedBillId`, `billNumber`, `voidedBillNumber` | |
| `method`, `methodName`, `methodKind` | Frozen from the payment |
| `amountInPaise` | |
| `businessDate` | |
| `status` | `OWED` or `REFUNDED` |
| `refundedAt`, `refundedBy`, `reference` | Set when a manager records the refund made on the card machine or by UPI |

`POST /refunds/:refundId/done`, OWNER and MANAGER, with a required reference.
Refunds owed appear on the Day Close screen and in R2 and R5 as their own line, and as a **warning** on Day Close, never a blocker.
Refunds move no money in this system. They record money returned outside it.

### E5. The screen

On a bill, OWNER, MANAGER, CASHIER and, when captains may bill, WAITER see **Cancel an item**.
It lists the bill's lines with a tick each, the reason buttons, the note, and "Was it already made?" per line, default yes.
For a CASHIER or WAITER, it then asks a manager to pick their name and type their PIN on the same screen.
The confirmation states the consequence in real numbers, for example for golden day B05 with the shake cancelled: "Bill CFA/C/22446 for ₹795.00 will be voided. A new bill for ₹449.00 will be made. Give back ₹346.00 in cash."
Afterwards it opens the new bill, ready to print.

### E6. Tests for Part E

1. Golden day B05: Half & Half Pizza, Ferrero Hazelnut Shake and Water Bottle, paid ₹500.00 cash and ₹295.00 UPI. Cancel the shake. B05 is voided. A new bill with its own invoice number has item total ₹427.61, GST ₹21.38, round-off ₹0.01, bill total ₹449.00, worked out with the repo's own `computeBillTotals`. UPI ₹295.00 is carried first, then ₹154.00 of the cash. The response says give back ₹346.00 in cash. C1 to C4 pass for the day.
2. A paid card bill with an item cancelled leaves a refund owed for the difference, and Day Close shows it as a warning.
3. A discounted bill keeps its discount reason, percent or capped flat amount.
4. Cancelling every line cancels the order and leaves every payment over.
5. A CASHIER without approval is refused. With a WAITER's PIN as the approver, refused. With a MANAGER's correct PIN, accepted. Five wrong PINs lock the manager's PIN.
6. On a closed day, refused.
7. A bill charged to an account: the new bill is charged to the same account, and the account's balance is right.
8. The invoice register shows the voided number with its reason and the new number, with no gap.

Commits, for example: `let createBill run in a given transaction`, `cancel lines after billing`, `add refunds owed`, `add cancel an item to the bill screen`.

---

## Part F. Cash by notes and coins

The cashier counts how many of each note and coin, and the system adds them up.

### F1. Denominations are a setting

`settings.cash.denominations`, owner only, audited: a list of `{ valueInPaise, kind }`, kind `NOTE` or `COIN`, each active or not.
Default, India: notes ₹500, ₹200, ₹100, ₹50, ₹20, ₹10; coins ₹20, ₹10, ₹5, ₹2, ₹1. ₹2000 is in the list but inactive, because it is withdrawn from circulation.
Values unique and above 0. At least one active.

### F2. One shape everywhere

`cashCount: [{ valueInPaise, count }]`, counts whole numbers from 0 to 10,000.
**The server always works out the total itself.** A client total is never trusted.
One helper in `money.js`, `sumCashCount(cashCount, denominations)`, refusing any value that is not an active denomination.

### F3. Where it is used

1. **Opening float.** `POST /cash-movements` for `OPENING_FLOAT` accepts `cashCount`. With it, the amount is its total. Stored on the movement.
2. **Day Close.** `POST /day-close` accepts `cashCount` instead of `countedCashInPaise`. With both, they must agree. The count is stored on the day closure. **The blind count rule does not change**: a manager still never sees the expected figure. The Day Close print lists each denomination, its count and its value.
3. **Taking a cash payment.** The payment panel's Cash choice shows a note and coin counter: tap ₹500 twice, and it shows "Received ₹1,000. Change ₹205", with a suggested set of notes to give back, worked out from the active denominations, largest first. The payment records the amount applied to the bill, never the amount handed over, plus a new optional `tender` on the payment: `{ cashCount, tenderedInPaise, changeInPaise }`. The server checks that tendered is at least the amount and that change equals tendered minus amount. Typing an amount on the keypad without counting notes still works.

### F4. The counter

One component, `CashCounter`, used in all three places: one row per active denomination, largest first, with a minus button, the count, a plus button, and the row's value, all at least 48 px tall; a field to type a count directly; and the running total in the hero size. Notes and coins in two groups.

### F5. Reports

R2 and R7 show the counted denominations for closed days that have them. Days without a count by denomination show the total only.

### F6. Tests for Part F

1. `sumCashCount` totals correctly, and refuses an inactive or unknown denomination, a negative count and a fraction.
2. Golden day: close 26 September with a count of 6 × ₹500, 2 × ₹200 = ₹3,400.00: the day closes with counted ₹3,400.00, difference −₹4.00, and the stored count.
3. A count and a counted total that disagree are refused.
4. A cash payment of ₹795.00 with ₹1,000 tendered records ₹795.00 and change ₹205.00. A tender below the amount is refused.
5. The manager's Day Close response still leaves out expected cash.

Commits, for example: `add cash denominations setting`, `count cash by notes on float and day close`, `count notes and give change on cash payments`.

---

## Part G. Integrations foundation

Everything the three integration areas share.

### G1. Encrypted secrets

1. New `server/utils/secretBox.js` with `encryptJson(value)` and `decryptJson(box)`, AES-256-GCM from Node's `crypto`, a fresh 12-byte IV each time, the auth tag stored beside the ciphertext, and a `keyId` on each box.
2. New environment variable **`INTEGRATION_SECRETS_KEY`**: 32 random bytes, base64, read only in `env.js`.
3. Required in production. Startup fails with: "INTEGRATION_SECRETS_KEY must be set in production. Make one with: openssl rand -base64 32".
4. In development and test, when absent, use a fixed development key and log a warning once. Never in production.
5. Add it to `.env.example` and `server/.env.test.example`, and to `docs/DEPLOYMENT.md`'s environment table, with: losing this key makes every saved partner credential unreadable, and they must be entered again.

### G2. Collection `integrationconnections`

One per restaurant, branch and provider.

| Field | Notes |
|---|---|
| `restaurantId`, `branchId` | From `baseSchema` |
| `provider` | `SWIGGY`, `ZOMATO`, `SANDBOX_PLATFORM`, `PINE_LABS`, `TALLY` |
| `environment` | `SANDBOX`, `UAT`, `PRODUCTION` |
| `status` | `DRAFT`, `ACTIVE`, `PAUSED`, `ERROR` |
| `credentials` | The encrypted box. Never returned by any endpoint. |
| `credentialHints` | For each secret field, its last 4 characters only |
| `config` | Plain settings, validated by the provider's own schema |
| `webhookKeyHash` | SHA-256 of the random key in this connection's webhook address. Unique, partial on not null. |
| `lastSuccessAt`, `lastErrorAt`, `lastError` | `lastError` is a plain sentence with no secret in it |

Unique `{ restaurantId, branchId, provider }`. Register the model in `server/models/index.js`.
`SANDBOX_PLATFORM` connections are refused when `NODE_ENV` is `production`.

### G3. Provider registry

`server/services/integrations/providers.js`: per provider, its kind (`ORDER_CHANNEL`, `PAYMENT_TERMINAL`, `ACCOUNTING`), name, `availability` (`READY` or `WAITING_FOR_PARTNER`), credential schema, config schema, and which fields to mask.
Provider-specific rules are reached only through this registry. No `if (provider === 'SWIGGY')` elsewhere.

### G4. Collection `integrationevents`

One line per call to or from a partner: `connectionId`, `provider`, `direction` `IN` or `OUT`, `kind`, `externalId`, `outcome` (`OK`, `FAILED`, `DUPLICATE`, `IGNORED`, `REJECTED`), `httpStatus`, `durationMs`, `request` and `response` with every secret field and customer phone number replaced by `[hidden]` and cut to 16 KB, `error`, `at`.
A TTL index removes lines after 180 days. These are diagnostics, not financial records.
One helper, `redactForLog(value, provider)`, used by every write, with a test that a credential never appears in a stored line.

### G5. Collection `integrationjobs`

Outgoing partner calls are queued, so a slow partner never holds up a cashier.
Fields: `connectionId`, `type`, `payload`, `dedupeKey` (unique, partial on not null), `status` (`QUEUED`, `RUNNING`, `DONE`, `FAILED`, `DEAD`), `runAfter`, `lockedUntil`, `attempts`, `maxAttempts`, `lastError`.
`server/services/integrations/jobRunner.js`: `runDueJobs({ limit })` claims jobs one at a time with `findOneAndUpdate`, runs each through the registry, and records the result. Retries wait 30 seconds, 2 minutes, 10 minutes, 30 minutes, then 2 hours. After `maxAttempts`, `DEAD`, with an alert.
`startJobLoop()` runs every 5 seconds, started by `server.js` only outside tests. Tests call `runDueJobs` directly. A comment says it assumes one server instance.

### G6. Acting without a signed-in person

1. Read how `server/scripts/lib/asTest.js` builds a request without HTTP.
2. Build `server/services/integrations/systemActor.js` with `asIntegration(restaurantId, branchId, provider)`, a request-like context every service accepts.
3. It acts as a per-restaurant **integration user**, created when a connection is first saved, named like "Swiggy (automatic)", that **cannot sign in**. Check the sign-in code really refuses it, and test that.

### G7. Order creation as a service

Move the creation logic out of `createOrder` in `orderController.js` into a service function in `orderService.js`, keeping the controller thin. No change in behaviour. Every existing order test passes unchanged. Own commit: `move order creation into the order service`.

### G8. Webhooks

`POST /api/v1/hooks/:provider/:webhookKey`:
1. `express.raw`, limit 256 KB, before the JSON parser, so the exact bytes are available for a signature.
2. No sign-in and no tenant middleware. The connection is found by the SHA-256 of the key. An unknown key is 404 with no detail.
3. Its own rate limiter.
4. The provider's `verifyWebhook` runs first. A failure is 401 and a `REJECTED` event, and nothing else.
5. A verified request is stored as an `IN` event and handed to a job. The reply returns within a second.
6. The key is shown once, inside the full address, on the connection screen, with "Make a new address".

### G9. Connection endpoints

| Method and path | Roles |
|---|---|
| `GET /integrations` | OWNER, MANAGER. Every provider with its availability and this restaurant's connection, without credentials. |
| `PUT /integrations/:provider` | OWNER. Create or update. Credentials sent empty keep the stored ones. |
| `POST /integrations/:provider/test` | OWNER |
| `POST /integrations/:provider/pause`, `/resume` | OWNER |
| `POST /integrations/:provider/webhook-key` | OWNER. A new address, returned once. |
| `GET /integrations/:provider/events` | OWNER, MANAGER. Newest first, paged. |

Audit, OWNER only: `INTEGRATION_CONNECTED`, `INTEGRATION_CREDENTIALS_CHANGED`, `INTEGRATION_PAUSED`, `INTEGRATION_RESUMED`.

### G10. Tests for Part G

1. `secretBox` round-trips, rejects a changed ciphertext, and another key cannot read it.
2. Production without `INTEGRATION_SECRETS_KEY` refuses to start.
3. Save a connection with a credential like `SECRET-VALUE-123`, then search every collection and every response for it. It appears nowhere except inside the encrypted box.
4. Webhook: unknown key 404, bad signature 401 with nothing changed.
5. Jobs: retries on schedule then `DEAD`; a used `dedupeKey` is not queued twice; two runners never run one job.
6. The integration user cannot sign in.
7. Every existing order test passes after G7.

---

## Part H. Swiggy and Zomato

### H1. The order channel adapter

`server/services/integrations/channels/adapter.js` documents the interface in JSDoc:

| Member | Purpose |
|---|---|
| `capabilities` | Which of `acceptReject`, `foodReady`, `itemAvailability`, `storeStatus`, `menuPush` it supports |
| `verifyWebhook({ rawBody, headers, connection })` | True or false |
| `parseWebhook({ rawBody, headers })` | A list of normalised events, H2 |
| `acceptOrder(connection, platformOrderId, { prepMinutes })` | |
| `rejectOrder(connection, platformOrderId, reasonCode)` | Our reason, mapped to the platform's |
| `markFoodReady(connection, platformOrderId)` | |
| `setItemAvailability(connection, [{ externalItemId, externalVariantId, available }])` | |
| `setStoreStatus(connection, { open })` | |
| `pushMenu(connection, menu)` | Optional |
| `testConnection(connection)` | |

Three adapters:
1. **`SANDBOX_PLATFORM`**, built completely: signs webhooks with HMAC-SHA256 of the raw body using a secret in its credentials, in a header `x-sandbox-signature`. Its outgoing calls write `OUT` events and return success, unless its config asks it to fail, so tests can exercise failures. Every capability.
2. **`SWIGGY`** and **`ZOMATO`**: if `partner-docs/swiggy/` or `partner-docs/zomato/` holds that platform's API document, implement the adapter completely from it, with a test file using your own made-up payloads in the platform's shape. Otherwise create it with `availability: WAITING_FOR_PARTNER` and every method throwing `PartnerSpecMissingError`, message "Swiggy has not approved this integration yet, so live orders cannot be received. Use the Sandbox platform to practise." An owner cannot activate it.

### H2. Normalised shapes

```js
// One incoming platform order, whatever the platform.
{
  platformOrderId,        // string
  placedAt,               // Date, UTC
  acceptBy,               // Date or null
  customerName,           // string or null. Phone numbers are dropped in parseWebhook.
  items: [{
    externalItemId, externalVariantId,   // variant may be null
    name, quantity,                      // quantity is an integer above 0
    unitPriceInPaise,                    // what the platform charged
    addOns: [{ externalId, name, priceInPaise }],
    note,
  }],
  packagingChargeInPaise,   // 0 when none
  merchantDiscountInPaise,  // paid for by the restaurant
  platformDiscountInPaise,  // paid for by the platform. Never on our bill.
  totalInPaise,
  paymentMode,              // 'PREPAID' or 'CASH_ON_DELIVERY'
  deliveredBy,              // 'PLATFORM' or 'RESTAURANT'
  instructions,
}
// Events: { type, platformOrderId, order? }
// ORDER_PLACED, ORDER_CANCELLED, RIDER_ASSIGNED, RIDER_ARRIVED, ORDER_PICKED_UP, ORDER_DELIVERED
```

### H3. Item mapping, collection `platformitemmappings`

`connectionId`; `externalItemId` and `externalVariantId`, unique together per connection; `externalName`, as last seen; `menuItemId`, `variantId`, and `addOnMap` from external add-on ID to ours.
Endpoints: list, save one, delete one, OWNER and MANAGER, and `GET .../unmapped` listing every external item seen with no mapping. Optional CSV import, reusing the menu import's CSV parser.

### H4. Collection `platformorders`

**Not** `onlineorders`, which P23 uses for website takeaways.

| Field | Notes |
|---|---|
| `connectionId`, `provider` | |
| `platformOrderId` | Unique per connection |
| `status` | `RECEIVED`, `NEEDS_ATTENTION`, `ACCEPTED`, `REJECTED`, `CANCELLED_BY_PLATFORM`, `PICKED_UP`, `DELIVERED`, `FAILED` |
| `attentionReasons` | Like `UNMAPPED_ITEMS`, `CASH_ON_DELIVERY`, `RESTAURANT_DELIVERY`, `NO_PLATFORM_PAYMENT_METHOD`, `PACKAGING_NOT_MAPPED`, `DAY_CLOSED` |
| `order` | The normalised order |
| `orderId`, `billId` | Ours, once they exist |
| `acceptBy`, `decidedBy`, `decidedAt`, `rejectReasonCode` | |
| `receivedAt`, `history` | Every status change, with time and who |

A duplicate `ORDER_PLACED` writes a `DUPLICATE` event and changes nothing.

### H5. What happens to a platform order

**Placed.**
1. Create the `platformorders` record.
2. It needs attention, and is never accepted automatically, when an item is unmapped, it is cash on delivery, it is delivered by the restaurant, no active payment method has a matching `platformCode`, or it has a packaging charge and no packaging item is set. Delivery by the restaurant and cash on delivery are handled by staff by hand.
3. With the connection's `autoAccept` on, the store open, and nothing needing attention, accept straight away. Otherwise it waits on the incoming requests screen P23 built, H7.

**Accepted.**
1. Call `acceptOrder` first, with a short timeout. If it fails, nothing is created here, and the screen says why.
2. Then, in one transaction, create our `DELIVERY` order through the service from G7, with `platform: { code, name, orderId }`, so the existing duplicate guard applies, and the tax treatment from `settings.delivery`.
3. Lines use the mapped items, **with the platform's unit price frozen on each line**, because that is what the customer was charged. Add an optional price override to `buildLineSnapshots` for this path only, and a new line field `priceSource`, `MENU` by default, `PLATFORM` here.
4. A packaging charge becomes one line of the connection's `packagingItemId`, at the platform's price.
5. With `autoFire` on, the default, fire it to the stations straight away.
6. If step 2 fails after the platform accepted: `FAILED`, an alert "Accepted on Swiggy but not created here. Enter it by hand.", and the details kept on screen.

**Rejected:** `rejectOrder` with a reason from a new list, `server/config/platformRejectReasons.js`, mirrored on the client: `ITEM_OUT_OF_STOCK` Item out of stock, `KITCHEN_BUSY` Kitchen too busy, `STORE_CLOSING` Closing soon, `OTHER` Other with a note. Audit `PLATFORM_ORDER_REJECTED`.

**Food ready:** when every line is ready in the kitchen, queue `markFoodReady`.

**Picked up**, from the platform, or "Handed over" by staff:
1. `createBill`, as the integration user.
2. A merchant discount through `applyDiscount`, reason `MERCHANT_PROMO`, funded by the restaurant. A platform-funded discount never goes on our bill.
3. Pay with the method whose `platformCode` matches, through `recordPayment`.
4. If our total and the platform's differ by more than the round-off, still bill it, and raise an alert with both figures.

**Cancelled by the platform:** not yet fired, cancel it, reason `PLATFORM_CANCELLED`; fired, cancel with `wasPrepared` true for lines the kitchen made; billed, void with `PLATFORM_CANCELLED`; on a closed day, change nothing, mark `NEEDS_ATTENTION` with `DAY_CLOSED`, and alert the owner.
Append `PLATFORM_CANCELLED`, "Cancelled by the platform", to the line cancel, order cancel and void reason lists, server and client. Append only.

### H6. Availability and store status

1. When an item or variant is switched out of stock or back, queue `setItemAvailability` for every active channel where it is mapped. Hook in where availability is saved today.
2. Open and Closed per platform, OWNER and MANAGER, calls `setStoreStatus`.
3. `pushMenu` only from a "Send menu" button, if supported. Availability is the default, not prices.

### H7. On the incoming requests screen from P23

Platform orders appear in the same list, alert, chime, spoken announcement and banner as P23's website requests, using the same device settings, labelled with the platform's name and number, with a countdown to `acceptBy`, Accept with prep minutes, Reject with a reason, and the reasons an order needs attention with a link to fix each, such as mapping an item there and then.
Extend P23's code. Do not copy it.

### H8. Config

`autoAccept` default false, `autoFire` default true, `defaultPrepMinutes` default 20, `packagingItemId` default null.

### H9. Day Close

Add to `blockersFor`: a platform order of that date still `RECEIVED`, `NEEDS_ATTENTION`, or `ACCEPTED` and not picked up.

### H10. Developer tool

`npm run sandbox:order -- --restaurant <id> --file <order.json>`, refusing production, signs and posts a sample order to that restaurant's sandbox webhook. Three samples in `setup/sandbox-orders/`: simple prepaid, with a merchant discount and packaging, with an unmapped item. Use Z Chaat dish names in them.

### H11. Tests for Part H

1. Sandbox order, all mapped, auto-accept off: waits. Accept: one `DELIVERY` order with platform fields, lines at the platform's prices with `priceSource` `PLATFORM`, fired to the right stations, the accept call recorded.
2. Auto-accept on: accepted and fired with no person, captain is the integration user.
3. Unmapped item: `NEEDS_ATTENTION`. After mapping, it can be accepted.
4. Duplicate webhook: one order.
5. Platform accept fails: nothing created.
6. Pickup: billed, merchant discount applied, paid by the platform method, C1 to C4 hold.
7. Golden day B08 as a sandbox Zomato order with a merchant discount of 20000: bill total 30500, line shares 13069 and 6931, exactly as `docs/TEST-DATA.md`.
8. Cancellation before firing, after firing and after billing, and on a closed day.
9. Out of stock queues one availability job per active channel where mapped, none elsewhere.
10. A Swiggy connection with no partner document cannot be activated, and says why.
11. Day Close is blocked by an accepted order not yet picked up.
12. Platform orders and P23's website requests both appear on the incoming screen, with one alert each.

---

## Part I. Pine Labs

### I1. Connection

Credentials, encrypted: `merchantId`, `securityToken`.
Config: `baseUrl`, required, with the UAT address from 4b as the default only in `UAT`; `paths` for upload, status and cancel, each required, no code default; `storeId`; `terminals: [{ name, clientId }]`, at least one; `autoCancelMinutes`, default 5; `postbackEnabled`, default false.

### I2. Linking payment methods

Payment methods gain `terminalProvider`, `PINE_LABS` or null, and `terminalPaymentMode`, required with a provider, for example Card 1 and UPI 10.
`settings.payments.requireTerminalForLinkedMethods`, default true: a linked method cannot be recorded by hand, except by OWNER or MANAGER with a reason when the machine is down. Audit `TERMINAL_BYPASSED`.

### I3. Collection `terminaltransactions`

| Field | Notes |
|---|---|
| `connectionId`, `billId`, `billNumber` | |
| `methodCode`, `allowedPaymentMode`, `amountInPaise` | |
| `transactionNumber`, `sequenceNumber` | Unique together per connection. Letters and digits only, since bill numbers contain `/`. Check the allowed characters on the Pine Labs page. |
| `terminal` | `{ name, clientId }` |
| `ptrid` | Unique, partial on not null |
| `status` | `CREATED`, `WAITING`, `APPROVED`, `DECLINED`, `CANCELLED`, `EXPIRED`, `UNKNOWN` |
| `result` | `{ rrn, approvalCode, tid, mid, paymentMode, amountInPaise, maskedCard }`. `maskedCard` only as the terminal sends it, masked. Never a full card number. |
| `paymentId` | Unique, partial on not null, so one approval is never two payments |
| `startedBy`, `startedAt`, `finishedAt`, `lastCheckedAt` | |

### I4. The flow

| Method and path | What it does |
|---|---|
| `POST /bills/:billId/terminal-payments` | `{ method, amountInPaise, terminalClientId }`. Same roles as taking a payment, including Part D's captain rule. Checks the bill can take it, uploads, stores the PTRID, returns `WAITING`. |
| `GET /terminal-payments/:id` | The status. When `WAITING` and not checked in 3 seconds, calls GetStatus first. |
| `POST /terminal-payments/:id/cancel` | Cancel. |
| `POST /api/v1/hooks/PINE_LABS/:webhookKey` | Postback, when enabled. A hint only: always confirmed with GetStatus. |

When approved:
1. In one transaction: mark `APPROVED` only if not already, and record the payment through `recordPayment`, `reference` the RRN.
2. Add to the payment, additively, `terminal: { provider, ptrid, rrn, approvalCode, tid, paymentMode }`.
3. An approved amount that differs from the requested amount: record nothing, `UNKNOWN`, alert. A manager sorts it out.

A job checks every `WAITING` record every 30 seconds until it finishes, or `autoCancelMinutes` plus 5 minutes pass, then `EXPIRED` after a final check.
Day Close blocker: a terminal payment of that date `WAITING` or `UNKNOWN`.

### I5. On the payment panel

Next to Part F's cash counter, a linked method shows **Send to machine**, using this device's terminal, a device setting beside the printer. Then a waiting state with the PTRID large enough to read from the machine, and Cancel, until approved, declined or expired.

### I6. Tests for Part I

Use a small fake Pine Labs server in the tests, answering the three calls in the shapes from 4b.
1. Start and approve: one payment, RRN as reference, the terminal fields. The bill is paid.
2. Two GetStatus calls after approval and a postback: still one payment.
3. Declined, cancelled, expired: no payment.
4. A different approved amount: `UNKNOWN`, no payment, an alert.
5. Golden day B05: ₹500.00 cash and ₹295.00 UPI through the terminal, sequence 1: paid in full.
6. A linked method by hand: refused for a CASHIER; a MANAGER with a reason succeeds and writes `TERMINAL_BYPASSED`.
7. Day Close blocked by a waiting terminal payment.
8. The security token never appears in an event line.

---

## Part J. Tally vouchers

### J1. Connection config

No secrets.

| Field | Notes |
|---|---|
| `version` | `TALLY_PRIME` or `TALLY_ERP9` |
| `companyName` | Exactly as in Tally, for `SVCURRENTCOMPANY` |
| `granularity` | `DAILY_SUMMARY`, the default, or `PER_BILL` |
| `voucherTypes` | Names for `sales`, `receipt`, `payment`, `journal`. Defaults `Sales`, `Receipt`, `Payment`, `Journal`. |
| `ledgers` | The mapping in J2 |
| `exportPayouts` | Default false |
| `delivery` | `FILE` or `BRIDGE` |

### J2. Ledger mapping

| Head | Example | Side |
|---|---|---|
| Sales, one per GST rate in use | Sales @ 5% | Credit |
| Sales where the platform pays GST | Sales, aggregator, section 9(5) | Credit |
| CGST output, SGST output | Output CGST, Output SGST | Credit |
| Round-off | Round Off | Credit when positive, debit when negative |
| Each payment method, including P24's online payments if built | Cash, Card Settlement, UPI Collections, Swiggy Receivable, Razorpay | Debit |
| On Hold | One combined ledger, or one per account | Debit |
| Cash paid out, cash paid in | Petty Expenses, Petty Cash Received | Debit, Credit |
| Payouts, when exported | Bank, and commission per platform | Debit |

Checked before any build: every head with an amount on a date must have a ledger, or the export refuses, listing what is missing.

### J3. What each closed business day becomes

Only **closed** days. Every figure read from frozen values. Use `splitBillAcrossPayments`, exactly as R9 does.
1. **Sales**, one per day or one per bill. Credits: sales by rate, platform sales, CGST, SGST, round-off. Debits: each payment method's share, each On Hold charge. Voided bills and No Charge orders never. Per bill, the voucher number is the invoice number.
2. **Receipts**: each On Hold collection on that date.
3. **Payments**: each cash paid out, and the reverse for paid in.
4. **Payouts**, only with `exportPayouts`: bank with the amount received, commission with the difference, against the platform's receivable for the gross amount.

Part E's bills need nothing extra: the voided bill is left out, the new bill carries its payments, and a refund owed moves no money in this system.
**Every voucher balances to the paisa**, or the build fails, naming the voucher and the difference.

### J4. The builder

Pure functions in `server/services/integrations/tally/`:
1. `buildDay(req, connection, businessDate)` returns plain vouchers: type, date, number, narration, entries `{ ledger, side, amountInPaise }`.
2. `toTallyXml(vouchers, profile)` writes the envelope from 4c.
3. Rupees with exactly two decimals through a new `money.js` helper, integer arithmetic only. Debits negative with `ISDEEMEDPOSITIVE` `Yes`, credits positive.
4. Every ledger name, narration and company name escaped for XML.
5. Each narration ends `ERP export 26 Sep 2026, batch <id>`.
6. **Version profiles**, `profiles.js`, one per version, holding everything that may differ: date format, encoding, allowed tags, response parser. Both start the same. Change one only when a real test shows a difference, and record it in `docs/INTEGRATIONS.md`.
7. Only tags shown in Tally's own documentation. No `REMOTEID` unless documented for both versions.

### J5. Responses

Any `LINEERROR` means that voucher failed, text kept. Counters such as `CREATED`, `ALTERED` and `ERRORS`, when present, compared with what was sent. Anything not understood is `UNKNOWN`, never success.
Real responses from both versions, with made-up names, become fixtures in `server/tests/fixtures/tally/` once seen in Part K's manual check.

### J6. Collection `tallyexports`

`connectionId`, `businessDate`, `granularity`, `version`, `status` (`BUILT`, `DOWNLOADED`, `QUEUED`, `POSTED`, `PARTIAL`, `FAILED`, `UNKNOWN`, `STALE`), `voucherCount`, `debitInPaise`, `creditInPaise`, `xml`, `xmlSha256`, `builtFromCloseAt`, `response`, `lineErrors`, `createdBy`, `createdAt`, `postedAt`.
Reopening a day makes its exports `STALE`.
**No double posting:** a date already `POSTED` or `DOWNLOADED` cannot be exported again until an owner confirms "I have deleted the vouchers for 26 Sep 2026 from Tally." Audit `TALLY_EXPORT_REDONE`.

### J7. Endpoints

| Method and path | Roles |
|---|---|
| `GET /integrations/tally/days?from&to` | OWNER, MANAGER |
| `POST /integrations/tally/exports` | OWNER, MANAGER. `{ from, to }`, one export per closed date. |
| `GET /integrations/tally/exports/:id/file` | OWNER, MANAGER. Marks `DOWNLOADED`. |
| `POST /integrations/tally/exports/:id/send` | OWNER, MANAGER. Queues it for the bridge. |
| `POST /integrations/tally/exports/:id/redo` | OWNER, with the confirmation |
| `GET /integrations/tally/ledger-masters/file` | OWNER. Plain ledgers under a parent group chosen per head. GST details on tax ledgers are set by the accountant. |

Audit `TALLY_EXPORT_POSTED`.

### J8. R9 stays

R9's Excel export stays. Its On Hold code `P03` moves into a per-restaurant setting, empty for new restaurants, where the row then shows "On Hold" with no code.

### J9. Tests for Part J

1. Golden day, 26 September, daily summary. Credits: Sales @ 5% 7,651.32, platform sales 1,235.00, CGST 191.31, SGST 191.26, round-off 0.11. Debits: Cash 1,754.00, Card 1,481.00, UPI 1,472.00, Zomato Gold 1,998.00, Dineout 778.00, Zomato 305.00, Swiggy 930.00, E-210 Office 47.00, W-330 Office 504.00. Both sides 9,269.00.
2. The paid out: a payment voucher, Petty Expenses 350.00 against Cash.
3. 27 September after the collection in `docs/TEST-DATA.md` section 5: a receipt voucher, Cash 504.00 against W-330 Office.
4. Per bill: 15 sales vouchers numbered with invoice numbers, B11 left out, each balanced, together equal to the summary.
5. A negative total round-off goes on the debit side.
6. Ledger names with `&` and `<` are escaped.
7. An unmapped head refuses and names it. An open day refuses.
8. Exporting a date twice is refused. Redo needs the owner and the confirmation.
9. Reopening a day marks its exports `STALE`.
10. 1,000 seeded random closed days: every voucher balances.
11. Test 1's XML matches a stored snapshot for each version profile.
12. A day with a Part E cancellation: the voided bill is not exported, and the vouchers balance.

---

## Part K. The Tally bridge

### K1. The program

`tools/tally-bridge/`, Node 20, no packages, built-in `fetch`:

| Command | What it does |
|---|---|
| `node bridge.js pair <code> --server <url>` | Swaps a one-time code for a token, saved in a config file in the user's app data folder, readable only by that user |
| `node bridge.js check` | Calls Tally on `127.0.0.1:9000`, or `--tally host:port`, and lists open companies |
| `node bridge.js run` | Every 30 seconds asks for work, posts it to Tally, sends the response back, and logs one line per job to a local file |

Plus `start-bridge.cmd` for Windows, and a `README.md` for an accountant, in plain words, with the exact Tally setting to switch on in each version.
The bridge only sends Tally the XML the server gave it, and only sends the server Tally's responses and ledger names.

### K2. Server side, collection `tallybridges`

`connectionId`, `name`, `machineName`, `tokenHash` (SHA-256; the token is never stored), `lastSeenAt`, `tallyVersionSeen`, `companiesSeen`, `pairedBy`, `pairedAt`, `revokedAt`, `revokedBy`.
Pairing codes: 8 characters, 10 minutes, stored hashed, used once.

| Method and path | Who |
|---|---|
| `POST /integrations/tally/bridges/pairing-code` | OWNER |
| `POST /integrations/tally/bridges/:id/revoke` | OWNER. Audit `TALLY_BRIDGE_REVOKED`. |
| `POST /api/v1/tally-bridge/pair` | The bridge, with a code. Audit `TALLY_BRIDGE_PAIRED`. |
| `GET /api/v1/tally-bridge/jobs/next` | The bridge, with its token: `POST_VOUCHERS` with XML, `FETCH_LEDGERS`, `PING`, or none |
| `POST /api/v1/tally-bridge/jobs/:jobId/result` | The bridge: `{ ok, httpStatus, body }`, up to 5 MB |

Its own small token middleware, used only by these routes, with its own rate limiter. Not a user session, and it opens nothing else.

### K3. Checking ledgers first

`FETCH_LEDGERS` asks Tally for its ledger list, written from Tally's documentation for both versions. Posting refuses, listing missing names, when a mapped ledger is not in the company.

### K4. Tests for Part K

1. A valid code pairs once. Used or expired codes are refused.
2. A revoked token is refused everywhere.
3. A bridge token opens nothing else.
4. With a fake Tally server on a local port, `run` posts a queued export and it becomes `POSTED`. A `LINEERROR` makes it `PARTIAL` or `FAILED` with the error kept.
5. A missing ledger refuses the post and names it.

### K5. Manual check

If Tally is installed here, do this; otherwise write it as a checklist in `docs/INTEGRATIONS.md` for me:
1. TallyPrime in Educational mode, a test company, the HTTP server on.
2. A staging restaurant with closed days on the 1st and 2nd of a month, made with the test clock.
3. Create ledgers from the ledger masters file, export both days, post through the bridge, and compare every amount in Tally's Day Book.
4. The same with Tally.ERP 9.
5. Save each version's real responses, with made-up names, as fixtures, and record any difference in the profiles.

---

## Part L. Integration screens and alerts

Follow `docs/DESIGN-SYSTEM.md`. One primary action per screen. Every state through `StateChip`. Every amount through `Money`. Every label from the glossary.

1. **Integrations page** in Settings, OWNER, MANAGER read-only: a card per provider with its state, last success, last error in plain words, and "Waiting for partner approval" where it applies. Each opens its form: secrets show only "ending 7Q2X" with "Replace", plus "Test connection", "Pause", the webhook address with "Make a new address", and the event log.
2. **Item mapping**: unmapped items first, each with a search over our menu.
3. **Tally page**, OWNER and MANAGER: ledger mapping, a calendar of dates showing closed, exported, posted, failed or stale, "Export", "Download file", "Send to Tally", the bridge's state and last seen time, "Pair a new bridge", and import steps for the chosen version.
4. **Alerts**: dead jobs, failed accepts, amount mismatches, unknown terminal payments, platform cancellations on closed days, Tally failures, in the existing alerts on the Today screen and on the Integrations page, each with a plain sentence and a link.

---

## Part M. Onboarding runbook

Write `docs/INTEGRATIONS.md`, for anyone setting up a restaurant:
1. **Swiggy and Zomato**: getting partner approval or using a middleman, what to ask for, keeping their document in `partner-docs/` and never in git, setting up the connection, webhook and mapping, and practising with the sandbox first.
2. **Pine Labs**: what to ask for (Merchant ID, Security Token, Store ID, each terminal's Client ID, the production address and paths), linking payment methods, testing in UAT first.
3. **Tally**: choosing the version, switching on its HTTP server, the ledger mapping, file import steps for each version, installing and pairing the bridge, and never re-posting a day without deleting it first.
4. **What is built and what is waiting**: every gap from this prompt.
5. **Z Chaat checklist**: each item above, `TO CONFIRM`.

Add it to the README's documents table and to `CLAUDE.md`'s "Read these when the task needs them" table.

---

## Part N. Full check

1. `npm test`, the whole suite. Record the count before Part A and now.
2. `npm run lint` and `npm run build`.
3. `npm run e2e`, the golden day through the screens. It must still pass.
4. New Playwright specs:
   1. `e2e/captainBilling.spec.js`: a captain on a phone makes a bill and sends it to the counter; the counter computer prints it once.
   2. `e2e/cancelAfterBilling.spec.js`: a cashier cancels an item on a paid bill with a manager's PIN, and sees the new bill and the cash to give back.
   3. `e2e/platformOrders.spec.js`: with the sandbox platform, an order arrives on the incoming screen, the cashier accepts it, the ticket reaches the station tablet, the station marks it ready, a pickup arrives, and the bill shows paid by the platform's method.
5. `npm run db:indexes` twice. The second run creates nothing.
6. Search the repository, history included, for anything like a credential, any text copied from `partner-docs/`, and any file from `backups/`. There must be none.

---

## 9. The Z Chaat menu file

Write this to `setup/zchaat-menu.csv` exactly, in Part B7. It was read from Z Chaat's menu on 8 October 2026. Two clear spelling mistakes on the menu were corrected: "Red Dargon Sizzler" to "Red Dragon Sizzler", and "Panner Chilly Dry" to "Paneer Chilly Dry".

```csv
# Z Chaat menu, from "Z Chaat Menu May 2026" and the two table cards (main course and Chinese additions), read 8 October 2026.
# Prices in rupees, before GST. GST 5% on every item. Check every TO CONFIRM item in docs/clients/zchaat/PROFILE.md before cutover.
category,item,size,price,gst_percent,available,description
Desi Tadka Sharbat,Aam Panna Soda,,190.00,5,yes,"Raw mango with chilled soda, black salt, roasted cumin and fresh mint. 300ml"
Desi Tadka Sharbat,Masala Jaljeera,,195.00,5,yes,"Spicy tangy jaljeera with mint, lemon and soda. 300ml"
Desi Tadka Sharbat,Nimbu Pudina Jamun Shikanji,,200.00,5,yes,"Lemon, mint, black plum and traditional spices. 300ml"
Desi Tadka Sharbat,Kokum Masala,,220.00,5,yes,"Tangy, spicy kokum with aromatic spices. 300ml"
Desi Tadka Sharbat,Pineapple Ginger Masala,,240.00,5,yes,"Pineapple, ginger and Indian spices. 300ml"
Desi Tadka Sharbat,Jamun Kala Khatta Soda,,225.00,5,yes,"Jamun, kala khatta syrup and soda. 300ml"
Desi Tadka Sharbat,Watermelon Basil Masala Splash,,240.00,5,yes,"Fresh watermelon, basil, lemon and black salt, served chilled. 300gm"
Desi Tadka Sharbat,Mango Lassi,,240.00,5,yes,Ripe mango blended with yogurt and milk. 300ml
Desi Tadka Sharbat,Rajwadi Lassi,,240.00,5,yes,"Rich, creamy royal-style yogurt drink. 300ml"
Desi Tadka Sharbat,Rose Lassi,,240.00,5,yes,Yogurt drink flavoured with rose syrup. 300ml
Bhel,Vitamin Bhel,,290.00,5,yes,"Fresh vegetables, sprouts and tangy chutneys. 250gm"
Bhel,Churmuri Bhel,,275.00,5,yes,"South Indian style puffed rice with carrot, onion, green chilli, coriander and lemon. 250gm"
Bhel,Chana Jor Bhel,,270.00,5,yes,"Chana jor garam with onion, tomato, chutneys and masalas. 250gm"
Bhel,Mumbaiya Bhel Version 2.0,,295.00,5,yes,"Mumbai street style puffed rice with vegetables, chutneys and spices. 250gm"
Bhel,Kachi Keri Bhel,,265.00,5,yes,Summer bhel with raw mango. 250gm
Bhel,Kolkata Jhalmuri Bhel,,270.00,5,yes,Spicy dry puffed rice snack from Bengal. 250gm
Bhel,Mexican Bhel,,295.00,5,yes,"Nachos, puffed rice, corn, beans, salsa, jalapenos and onion with chaat masala. 250gm"
Bhel,Chinese Bhel,,275.00,5,yes,Indian bhel crunch with bold Indo-Chinese flavours. 250gm
Chaat Darbar,Pani Puri With 6 Flavoured Pani,,270.00,5,yes,"Six flavours: spicy, tangy, sweet, fruity and smoky. 250gm"
Chaat Darbar,Dahi Bhalla Chaat,,265.00,5,yes,"North Indian street flavours: sweet, spicy, crunchy and cool. 300gm"
Chaat Darbar,Mango Dahi Bhalla With Palak Patta Chaat,,310.00,5,yes,"Lentil bhallas, ripe mango and crisp spinach leaves with curd, chutneys and chaat masala. 300gm"
Chaat Darbar,Raj Kachori Basket Chaat,,295.00,5,yes,"Edible basket stuffed with aloo, dahi and royal toppings. 250gm"
Chaat Darbar,Karari Aloo Tikki Chaat,,285.00,5,yes,"Crispy aloo tikkis with yogurt, chutneys and garnishes. 300gm"
Chaat Darbar,Tikki Chole Chaat,,290.00,5,yes,Aloo tikkis topped with masala chole and tangy chutneys. 330gm
Chaat Darbar,Corn Cheese Tikki Chaat,,305.00,5,yes,Crispy sweet corn and cheese tikkis. 300gm
Chaat Darbar,Moong Dal Kachori Samosa,,290.00,5,yes,Samosa shell stuffed with spicy moong dal and caramelised onion. 250gm
Chaat Darbar,Kadhi Kachori Chaat,,290.00,5,yes,"Stuffed kachoris with tangy, spicy Rajasthani kadhi. 350gm"
Chaat Darbar,Paneer Tikka Chaat,,300.00,5,yes,Smoky spiced paneer tikka with crunchy chaat elements. 250gm
Chaat Darbar,Tandoori Paneer Nacho Chaat,,295.00,5,yes,"Nachos with smoky tandoori paneer, chutneys and veggies. 250gm"
Chaat Darbar,Loaded Nacho Chaat,,305.00,5,yes,Nacho chips with bold Indian chaat flavours. 250gm
Chaat Darbar,Missal Chaat,,245.00,5,yes,"Maharashtrian missal with a chaat twist, served with masala pav. 250gm"
Chaat Darbar,Sev Poori Chaat,,265.00,5,yes,"Flat puris with potato, onion, tamarind and green chutney and sev. 200gm"
Chaat Darbar,Mini Vada Pav Slider,,300.00,5,yes,Bite-sized Mumbai vada pav served as sliders. 300gm
Chaat Darbar,Chole Bhature,,290.00,5,yes,"Spicy chana masala with soft, puffed bhatura. 350gm"
Chaat Darbar,Mutter Puri With Dum Aloo,,285.00,5,yes,Green pea stuffed puris with Kashmiri-style baby potato curry. 450gm
Chaat Darbar,Masala Pav Bhaji,,270.00,5,yes,Classic Mumbai pav bhaji with herby masala pav. 300gm
Kulcha,Hariyali Stuffed Kulcha,,450.00,5,yes,Stuffed kulcha brushed with butter or ghee. 250gm
Kulcha,Stuffed Chur Chur Naan,,450.00,5,yes,Flaky naan with paneer and potato filling. 250gm
Kulcha,Aloo Pyaaz Ka Kulcha,,450.00,5,yes,Kulcha filled with spiced potato and onion. 250gm
Kulcha,Cheese Kulcha,,460.00,5,yes,Kulcha stuffed with cheese. 250gm
Kulcha,Cheese Garlic Kulcha,,490.00,5,yes,Kulcha stuffed with garlic and cheese. 250gm
Sizzler,Indian Sizzler,,720.00,5,yes,"Veg and cottage cheese tikki, tawa pulao, masala wedges and mini samosa with makhani gravy. 700gm"
Sizzler,Red Dragon Sizzler,,770.00,5,yes,Indo-Chinese favourites on a hot cast-iron platter. 700gm
Sizzler,Mexican Sizzler,,820.00,5,yes,"Mexican rice, sauteed vegetables, cheese corn tikki, nachos and refried beans with chipotle, sour cream and salsa. 700gm"
Sizzler,Paneer Tikka Sizzler,,770.00,5,yes,"Tandoori paneer with Bhojpuri biryani, aloo tikki, mirchi vada and butter masala gravy. 700gm"
Sizzler,Italian Sizzler,,820.00,5,yes,"Cheese corn tikki, penne in pink sauce, butter garlic rice, fries and sauteed veggies. 700gm"
Main Course,Paneer Tikka Methi Garlic,,399.00,5,yes,Paneer tikka in creamy methi garlic gravy.
Main Course,Cheese Butter Masala,,429.00,5,yes,Rich butter masala topped with melted cheese.
Main Course,Grilled Masala Vegetable Twist,,379.00,5,yes,"Grilled vegetables in a smoky, spicy masala."
Main Course,Paneer Makhni,,399.00,5,yes,"Paneer in smooth, buttery makhni gravy."
Main Course,Kadai Ki Tezz Sabji,,389.00,5,yes,Spicy kadai-style mixed vegetables.
Main Course,Jeera Rice,,249.00,5,yes,Basmati rice tempered with cumin.
Main Course,Dal Makhani,,399.00,5,yes,"Slow-cooked black lentils in a rich, creamy gravy."
Breads,Tandoori Roti,Plain,69.00,5,yes,
Breads,Tandoori Roti,Butter,69.00,5,yes,
Breads,Tandoori Naan,Plain,109.00,5,yes,
Breads,Tandoori Naan,Butter,109.00,5,yes,
Breads,Garlic Masala Naan,Plain,159.00,5,yes,
Breads,Garlic Masala Naan,Butter,159.00,5,yes,
Chinese,Manchurian Dry,,349.00,5,yes,Wok-tossed vegetable manchurian.
Chinese,Veg Hakka Noodles,,349.00,5,yes,Wok-tossed hakka noodles with vegetables.
Chinese,Paneer Chilly Dry,,369.00,5,yes,Wok-tossed chilli paneer.
Chinese,Tropical Fried Rice,,349.00,5,yes,Wok-tossed fried rice.
Chinese,Veg Chowmin,,369.00,5,yes,Wok-tossed chowmein noodles with vegetables.
Biryanis,Assamese Biryani,,370.00,5,yes,"Indo-Chinese style biryani with schezwan sauce, spring onion and crispy noodles. 550gm"
Biryanis,Bhojpuri Biryani,,365.00,5,yes,Spicy veg biryani with traditional Bhojpuri spices. 550gm
Biryanis,Nargis Biryani,,370.00,5,yes,"Layered dum biryani with fried onion, spiced vegetables and saffron. 550gm"
Biryanis,Zakkas Biryani,,375.00,5,yes,"Street-style tawa rice with pav bhaji masala, capsicum, tomato and butter. 550gm"
Biryanis,Paneer Bhurji Biryani,,350.00,5,yes,"Scrambled paneer with veggies, layered with biryani rice. 550gm"
Sides,Papad,Roasted,49.00,5,yes,
Sides,Papad,Fry,49.00,5,yes,
Sides,Dahi,,49.00,5,yes,
Sides,Raita,,69.00,5,yes,
Sides,Salad,,79.00,5,yes,
Sides,Bhature,,49.00,5,yes,
Sides,Pav,,49.00,5,yes,
Sides,Kulcha,,69.00,5,yes,100gm
Sides,Masala Papad,,89.00,5,yes,
Sides,French Fries,Salted,175.00,5,yes,200gm
Sides,French Fries,Peri Peri,195.00,5,yes,200gm
Indian Sweet Ka Milan,Gulab Jamun Laccha Rabdi,,240.00,5,yes,Gulab jamuns over creamy laccha rabdi. 200gm
Indian Sweet Ka Milan,Rabdi Jalebi,,270.00,5,yes,"Crispy jalebis with thick, creamy rabdi. 180gm"
Indian Sweet Ka Milan,24 Carat Phirni,,240.00,5,yes,"Ground rice, milk, sugar and saffron. 200gm"
Indian Sweet Ka Milan,Rasmalai,,270.00,5,yes,Paneer balls in saffron milk with cardamom and dry fruits. 180gm
Indian Sweet Ka Milan,Ghewar with Rabdi,,295.00,5,yes,"Rajasthani honeycomb ghewar with rabdi, saffron and dry fruits. 200gm"
Indian Sweet Ka Milan,Kalakand Halwa,,300.00,5,yes,"Kalakand with soft pastry layers, saffron and dry fruits. 180gm"
Indian Sweet Ka Milan,Moti Chur Laddu,,280.00,5,yes,Soft gram flour pearls shaped into laddus. 180gm
Indian Sweet Ka Milan,Laccha Rabdi,,295.00,5,yes,Layered slow-cooked rabdi with nuts and saffron. 200gm
Indian Sweet Ka Milan,Kaju Akhrot Halwa,,300.00,5,yes,Cashew and walnut halwa with milk and ghee. 200gm
Roll Cut Kulfi,Mava Malai,,135.00,5,yes,
Roll Cut Kulfi,Badam Kesar Pista,,155.00,5,yes,
Roll Cut Kulfi,Green Pista,,155.00,5,yes,
Roll Cut Kulfi,Chocolate,,125.00,5,yes,
Beverages,Classic Cold Coffee,,199.00,5,yes,
Beverages,Water Bottle,,50.00,5,yes,
Beverages,Aerated Drinks,Sprite,70.00,5,yes,
Beverages,Aerated Drinks,Diet Coke,70.00,5,yes,
Beverages,Aerated Drinks,Coke,70.00,5,yes,
Beverages,Aerated Drinks,Thums Up,70.00,5,yes,
Beverages,Butter Milk,,90.00,5,yes,
Beverages,Red Bull,,150.00,5,yes,
Beverages,Filter Coffee,,110.00,5,yes,
Beverages,Tapri Tea,,110.00,5,yes,
Catering Packages,Catering Plan A,,649.00,5,yes,"Per person. Desi sharbat any 2, bhel any 1, chaat any 2, mains any 1, biryani any 1, dessert any 1. Write the guest choices in the note."
Catering Packages,Catering Plan B,,749.00,5,yes,"Per person. Desi sharbat any 2, bhel any 2, chaat any 2, mains any 2, biryani any 2, dessert any 2. Write the guest choices in the note."
```

---

## 10. Permissions summary

| Action | OWNER | MANAGER | CASHIER | WAITER | KITCHEN |
|---|---|---|---|---|---|
| Make a bill | yes | yes | yes | when `captainsMayBill` | no |
| Take a payment, including through the terminal | yes | yes | yes | when `captainsMayTakePayment` too | no |
| Ask for a bill to print at the counter | yes | yes | yes | yes | no |
| Cancel an item after billing | yes | yes | with a manager's PIN | with a manager's PIN, when captains may bill | no |
| Mark a refund done | yes | yes | no | no | no |
| Count notes for the opening float | yes | yes | yes | no | no |
| Count notes at Day Close | yes | yes | no | no | no |
| Count notes on a cash payment | yes | yes | yes | when `captainsMayTakePayment` | no |
| See integrations and their logs | yes | yes | no | no | no |
| Change connections and credentials | yes | no | no | no | no |
| Item mapping, store open and closed | yes | yes | no | no | no |
| Accept or reject platform orders | yes | yes | yes | no | no |
| Record a linked method without the terminal | yes | yes | no | no | no |
| Tally mapping, exports, files, send | yes | yes | no | no | no |
| Tally redo, bridge pairing and revoking | yes | no | no | no | no |
| Purge a restaurant | no | no | no | no | no |

Purging is not an endpoint for anyone. It is a script Arya runs by hand.
Webhooks and the bridge routes have no user. They are checked by their own keys and tokens.

## 11. Non-negotiable rules that apply

"Every database record has a `restaurantId`. Every query filters by it. No exceptions." Including every new collection and every webhook, which finds its restaurant only through its connection.
"Store all money as whole paise integers. Never as a decimal or float." Cash counts, Tally's rupee text and Pine Labs amounts included.
"Copy price, item name, and tax rate into the order when it is created." Platform orders freeze the platform's price.
"Check permissions on the server for every endpoint." Captain billing, PIN approval and every integration role.
"Never hard delete a bill, order, or stock entry. Mark it cancelled or voided and keep it." The one exception is the purge tool, for restaurants Arya names as mock or test data, recorded in the decision log.
"Bill numbers are generated on the server, are sequential, and are never reused." Cancelling after billing voids and issues a new number. It never edits one.
"Secrets live in `.env`. Never commit a real secret." Partner credentials are encrypted in the database. The key lives in `.env`.
"Store timestamps in UTC. Convert to India time only for display."
"GST rates are settings, never hardcoded."
"Reports only add up values frozen onto records." Tally vouchers come only from frozen values of closed days.
"Schema changes are additive."
"Tax arithmetic lives in `server/utils/tax.js`. Nowhere else."
"Never create a bill in production to test something." The cloud database now holds Z Chaat's real bills.

## 12. Checks and golden day

Every bill made by a captain, by a cancellation after billing or by an integration passes C1 to C4.
Golden day B05 and B08 are rebuilt as Part E's, Part H's and Part I's tests describe, and match `docs/TEST-DATA.md`.
Golden day 26 September balances at 9,269.00 on each side as Tally vouchers.
If any figure differs from `docs/TEST-DATA.md`, do not change the expected figure. Find which side is wrong and tell me.

## 13. Out of scope

Delivery by the restaurant's own riders, and cash on delivery from platforms: flagged for staff, not automated.
Importing platform settlement reports.
Middlemen such as UrbanPiper as adapters.
Pine Labs online payments, EMI, and refunds through the terminal. Refunds are recorded as done by hand.
Altering or deleting vouchers in Tally. Tally's native JSON.
Purchases, stock or payroll in Tally.
Credit notes for bills from a closed day.
A cash check in the middle of the day. Only the opening float, Day Close and cash payments count notes.
Deleting Cafezza's archived files.
Running more than one server instance.

## 14. Docs to update

1. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": the live client is Z Chaat; Cafezza is archived; P25 and M21.
   3. The module table gains M21.
   4. The P25 progress table, all ticked.
   5. Decision log rows, dated today, for: Z Chaat replaces Cafezza as the live client; the purge tool as the only hard delete, for named mock data, with a backup first; mock loaders removed and `e2e:cloud` limited to a staging database; the printer setting per device and the full-page invoice from the same data as the receipt; captains bill by setting, and print at the counter; cancelling after billing as void, cancel and re-bill with payments carried and refunds owed; cash counted by denomination with the server doing the sums; encrypted partner credentials; webhooks verified, stored, then processed by jobs; platform orders through the same order service at the platform's price; platform adapters only from the platform's own document; terminal approvals confirmed with GetStatus and recorded once; Tally as XML only for both versions, from closed days, never altered or re-posted without confirmation; the bridge as the only way to reach Tally; and every place the build differed from this prompt.
2. `CLAUDE.md`: its opening says the live client is Z Chaat; its "Rules for Caffeza" section becomes "Rules for a live restaurant", same rules, no client name; its reading table points at the Z Chaat profile and `docs/INTEGRATIONS.md`.
3. `docs/prompts/README.md`: add P25, marked Done.
4. `docs/clients/zchaat/PROFILE.md` and `docs/INTEGRATIONS.md`, from Parts B and M.

## 15. Done when

1. Every part's tests pass, and in Part N the whole suite, lint, build, every e2e spec and the index check pass.
2. By hand: a bill printed on each of the four printer settings fills its page; a captain's bill prints at the counter; an item cancelled after billing gives a new bill and the right change; the Day Close count by notes closes the day; the sandbox platform order goes from arrival to paid.
3. Every doc in section 14 is updated.
4. Every part is committed and pushed to `main`, and the progress table is fully ticked.
5. Print a short summary: commits; restaurants removed and what is left in the cloud database; collections and endpoints added; test counts before and after; which partner adapters are fully built and which are waiting; every gap written into `docs/INTEGRATIONS.md` and the Z Chaat profile; and anything that surprised you.
