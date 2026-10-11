# P35 The same dish once on the bill, and each drink its own dish

**Model:** Sonnet, high effort.
**Branch:** none. Commit directly to `main`.
**Repository:** https://github.com/Aryapatel-007/Caffeza
**Depends on:** P29 (bill revisions) and P34. Written against commit `9134f2e`.

---

## 1. What to build, in one sentence

Two fixes Z Chaat asked for: when a table orders the same dish in two rounds, the bill shows it once as "2 × Roti" instead of "1 × Roti" twice (Part A), and the four sizes of "Aerated Drinks" (Sprite, Diet Coke, Coke, Thums Up) become four separate dishes on the menu (Part B).

## 2. Modules

Part A is M3 Billing with GST, display only.
Part B is M1 Menu Management.
They touch different files and do not depend on each other. Do Part A first, then Part B.

## 3. Why

**Part A.** A guest orders 1 Roti. Twenty minutes later they order 1 more.
That is two order lines, because each round went to the kitchen on its own ticket. That part is right and stays.
The bill copies each order line to its own bill line, so it shows:

```
1 × Roti      ₹40.00
1 × Roti      ₹40.00
```

Z Chaat wants:

```
2 × Roti      ₹80.00
```

**Part B.** Today the captain taps Aerated Drinks, a sheet opens, and they choose Coke from the sizes.
That is an extra tap for one of the most common orders in the cafe.
The bill also prints "Aerated Drinks (Coke)", where Z Chaat wants "Coke".
The four drinks are really four products, so they become four dishes, each with its own tile.

---

## 4. You are a new session. Do this first

1. **Pull first.** If the repository is not on this machine, `git clone https://github.com/Aryapatel-007/Caffeza.git` and work inside it. If it is, `git checkout main` and `git pull`.
2. `git log --oneline -1` must show `9134f2e` or later. If not, stop and tell me.
3. `npm ci` at the root.
4. If there is no `.env`, copy `.env.example` to `.env` and **stop and ask me for the values**. Never guess them, and never guess `MONGO_URI`.
5. If there is no `server/.env.test`, copy `server/.env.test.example` to it.
6. Save this entire prompt, exactly as given, to `docs/prompts/P35-same-dish-once-and-drinks-as-dishes.md`, and add a P35 row to `docs/prompts/README.md`.
7. Run `npm test` once and record the count.
8. Keep this progress table in `docs/PROJECT-STATE.md` under a P35 entry, and tick each part as it is committed, so a later session can carry on:

```
P35 progress
- [ ] A Same dish once on the bill
- [ ] B Each drink its own dish (code and tests)
- [ ] B Live run on Z Chaat (needs Arya's "apply")
- [ ] C Full check and docs
```

## 5. Files to read first

For Part A:
1. `server/models/Bill.js`, the bill line schema.
2. `server/services/billService.js` `createBillInSession` and `toBillLine`.
3. `server/services/receiptService.js` `buildInvoiceData` and `layoutReceipt`.
4. `server/controllers/billController.js`, every place that sends a bill back with `bill.toJSON()`.
5. `server/utils/money.js` `sumPaise`.
6. `client/src/features/billing/BillScreenPage.jsx`, the line list and `canRemove`.
7. `client/src/features/billing/RemoveItemPanel.jsx` and `CancelItemsPanel.jsx`.
8. `client/src/features/printing/invoiceHtml.js`, both the full-page invoice and `thermalBillHtml`.
9. `client/src/features/billing/ReceiptPreviewPage.jsx`.
10. API-CONTRACT M3: `GET /bills/:billId`, section 16.1 (the invoice) and section 16.8.1 (removing items).

For Part B:
1. `server/models/MenuItem.js`. Note the unique index on `{ restaurantId, branchId, nameLower }`. It covers switched-off items too.
2. `server/models/Recipe.js`, `server/models/PlatformItemMapping.js`, `server/models/MenuPhoto.js`. All three can point at an item, and the first two at one of its sizes (`variantId`).
3. `server/scripts/migrateReadyToServed.js`. Follow its shape: a dry run by default, `--apply` to write, a report, and a second run that finds nothing to do.
4. `server/scripts/importMenu.js`, to see how the menu file's `size` column becomes sizes.
5. `setup/zchaat-menu.csv`, rows 99 to 102.
6. `server/tests/setupScripts.test.js`, the Z Chaat menu test that counts items and rows.
7. `docs/clients/zchaat/PROFILE.md` section 3 and section 15 item 7, the open question about printed MRP prices.
8. `server/utils/transaction.js`.

---

## 6. Non-negotiable rules that apply, quoted

"Every database record has a `restaurantId`. Every query filters by it. No exceptions."
"Store all money as whole paise integers. Never as a decimal or float."
"Money arithmetic lives in `server/utils/money.js`. Tax arithmetic lives in `server/utils/tax.js`. Nowhere else."
"Copy price, item name, and tax rate into the order when it is created. Never read them live from the menu at bill time." Part A's rows use only frozen bill line values. In Part B, this is why old orders and bills are safe.
"Never hard delete a bill, order, or stock entry. Mark it cancelled or voided and keep it." In Part B, the old item is switched off, never deleted.
"GST rates are settings, never hardcoded." The new dishes copy the item's stored rate.
"Reports only add up values frozen onto records when the event happened." Reports are not touched.
"Schema changes are additive: new fields with defaults, nothing renamed or removed." Neither part changes a schema.
"Never create a bill in production to test something."

---

## 7. Part A. The same dish shows once on the bill

### A1. The rule

Bill lines stay exactly as they are stored. One order line, one bill line.
They are still needed: each one traces back to its order line, and removing or cancelling works per line.

What changes is a new, computed list called `itemRows`, made from the bill's lines.
Two bill lines join one row only when **all** of these are the same:

1. `menuItemId`
2. `itemName`
3. `variantName` (both null counts as the same)
4. `addOnNames`, as a set: the same names, in any order
5. `unitPriceInPaise`
6. `taxRateBps`

So these stay as separate rows, on purpose:
1. The price changed on the menu between the two rounds. Each round keeps the price it was ordered at.
2. A different size, like Half and Full.
3. Different extras.

Each row:

| Field | Value |
|---|---|
| `itemName` | From the lines |
| `variantName` | From the lines, or null |
| `addOnNames` | From the first line of the row |
| `quantity` | Sum of the lines' quantities |
| `unitPriceInPaise` | From the lines |
| `taxRateBps` | From the lines |
| `lineTotalInPaise` | Sum of the lines' `lineTotalInPaise`, through `sumPaise` |
| `orderLineIds` | Every line's `orderLineId`, in bill order |

Rows are in the order of each row's first line on the bill.

Write it once, as a pure function `groupBillLines(lines)` in a new `server/utils/billLines.js`.
Add up money only with `sumPaise` from `server/utils/money.js`.
The client never groups lines itself. It reads `itemRows` from the server.
`itemRows` is computed when a bill is read. It is **never stored**.

### A2. Endpoints

No new endpoint. No request body changes. Two responses gain one field each. Both are additive: `lines` stays exactly as it is.

**`GET /api/v1/bills/:billId`**
Roles: unchanged.
Response: unchanged, plus `itemRows`.

```json
{
  "success": true,
  "data": {
    "id": "…",
    "billNumber": "…",
    "lines": [
      { "orderLineId": "a1", "menuItemId": "m7", "itemName": "Roti", "variantName": null, "addOnNames": [], "quantity": 1, "unitPriceInPaise": 4000, "taxRateBps": 500, "lineTotalInPaise": 4000 },
      { "orderLineId": "b2", "menuItemId": "m7", "itemName": "Roti", "variantName": null, "addOnNames": [], "quantity": 1, "unitPriceInPaise": 4000, "taxRateBps": 500, "lineTotalInPaise": 4000 }
    ],
    "itemRows": [
      { "itemName": "Roti", "variantName": null, "addOnNames": [], "quantity": 2, "unitPriceInPaise": 4000, "taxRateBps": 500, "lineTotalInPaise": 8000, "orderLineIds": ["a1", "b2"] }
    ],
    "revisable": true,
    "revisableReason": null
  }
}
```

(The other bill fields are left out above. They do not change.)

Every other bill response built from `bill.toJSON()` in `billController.js` gains `itemRows` the same way, so a screen never sees a bill without it. Do it in one helper, not in each handler.

**`GET /api/v1/bills/:billId/invoice`**
Roles: unchanged.
Response: unchanged, plus `itemRows` beside `lines`, built by `buildInvoiceData` from the same `groupBillLines`.

**`POST /api/v1/bills/:billId/remove-lines`**
Unchanged. It already takes several lines at once. The screen now sends every line the person picked from a row.

### A3. Database fields

None added. None changed.
Read only: `bills.lines[]`: `orderLineId`, `menuItemId`, `itemName`, `variantName`, `addOnNames`, `quantity`, `unitPriceInPaise`, `taxRateBps`, `lineTotalInPaise`.
The bill screen also reads `orders.lines[].firedAt` from the order it already loads, to say when each round was sent.

### A4. Screens and printed bills

Everywhere a bill's items are shown to a person, use `itemRows`:
1. The bill screen's item list (`BillScreenPage.jsx`).
2. The thermal bill (`thermalBillHtml`). "Total Qty" stays the sum of quantities, which does not change.
3. The full-page A4 and A5 invoice (`invoiceHtml.js`).
4. The receipt text on the server (`layoutReceipt`), which the receipt endpoint and the receipt preview use.
5. A captain's bill printed at the counter. It uses the same print code, so check it, do not rebuild it.

React keys: use `orderLineIds.join('-')`, never the array index.

**Removing an item from a merged row.** On a revisable bill, each row keeps its Remove button.
1. A row made of **one** line: exactly as today.
2. A row made of **several** lines: the remove sheet first asks "Which one?", listing each line of the row as its own choice:
   "1 × Roti, sent 8:05 PM"
   "1 × Roti, sent 8:40 PM"
   Use the order line's `firedAt`, in India time, through `formatDate.js`. A line not sent to the kitchen says "Not sent".
   The person picks one or more. Then the sheet carries on as today: reason, "Was it already made?", preview, confirm.
3. "Was it already made?" is asked when any picked line reached the kitchen. The answer goes on each picked line that reached the kitchen, and on no other.
4. A manager's PIN is needed when **any** picked line needs one, by today's `removeNeedsApproval` rule.
5. The preview sentence names what is going: "2 × Roti ₹80.00 comes off bill … The bill becomes ₹…".
6. `canRemove` keeps its rule on the underlying lines: a bill keeps at least one line. If removing every picked line would empty the bill, the confirm button stays off and says why. The server already refuses it; this only saves a tap.

**Cancelling items on a paid bill (`CancelItemsPanel.jsx`).** Keep it per line, because each line is cancelled on its own.
When the same dish appears on more than one line, add when it was sent to each label, the same words as above, so the cashier can tell them apart.

### A5. Permission rules

Nothing changes. Every role sees exactly what it saw before, laid out differently.
Removing and cancelling keep their roles, their approval rules and their server checks.

### A6. Validation rules

No input changes, so no new request validation.
`groupBillLines` throws on a line with a missing `orderLineId`, a non-integer money value or a quantity under 1. A real bill never has these, so a throw means a bug, and it should be loud.

### A7. Spec first

Before any Part A code, commit `spec item rows on the bill`:
1. API-CONTRACT M3: `itemRows` on `GET /bills/:billId` and the other bill responses, its grouping rule from A1, and that it is computed, never stored.
2. API-CONTRACT M3 section 16.1: `itemRows` on the invoice.
3. API-CONTRACT M3 section 16.8.1: the screen may send several lines from one row.
No DB-SCHEMA change. Say so in the commit message body.

### A8. Tests

New file `server/tests/billItemRows.test.js`:
1. Roti ordered and fired, then Roti ordered and fired again, then billed: `itemRows` has one Roti row, quantity 2, line total twice the price, and both order line ids. `lines` still has two lines.
2. The price of Roti changed on the menu between the two rounds: two rows, each at its own price.
3. Half and Full of the same dish: two rows.
4. The same dish with different extras: two rows. The same extras in a different order: one row.
5. On every bill of the golden day: the rows' line totals add up exactly to `subtotalInPaise`, and the rows' quantities to the lines' quantities.
6. `GET /bills/:billId/invoice` carries the same `itemRows` as `GET /bills/:billId`.
7. The receipt text for test 1 prints Roti once, with quantity 2.
8. Removing one of the two Roti lines through `remove-lines` leaves one row, "1 × Roti", and the bill keeps its number.
9. `groupBillLines` throws on a line with a decimal money value.

If any existing receipt or invoice snapshot changes, it can only be because a golden day bill has the same dish on two lines. If so, update that snapshot on purpose, and name the bill in the commit message.

Commit: `show the same dish once on the bill`.

---

## 8. Part B. Each drink is its own dish

### B1. What the script does

`npm run menu:sizes-to-dishes -- --restaurant "Z Chaat" --item "Aerated Drinks"` is a dry run. It reads and reports, and changes nothing.
Adding `--apply` writes.
Add the script to `server/package.json` and the root `package.json`, the same way `migrate:ready-to-served` is.

For the named item, in the named restaurant:

1. **One new dish per size**, in the same category:
   - `name`: the size's name, like "Coke".
   - `priceInPaise`: the size's own price. Sizes store absolute prices, not a difference from the item.
   - `taxRateBps`: the item's.
   - `isAvailable`: the size's.
   - `isActive`: true.
   - `description`: the item's, or null.
   - `variants`: none.
   - `addOns`: a copy of the item's extras, with new ids.
   - `displayOrder`: right where the old item sat, in the order of its sizes, so the drinks appear in the same place on the menu.
2. **Recipes** (only matters when inventory is on): a recipe on a size becomes the new dish's item-level recipe (`variantId: null`). If a size has no recipe of its own and the item has an item-level recipe, the new dish gets a copy of that.
3. **Platform item mappings** (Swiggy, Zomato, sandbox): a mapping pointing at a size moves to the new dish, with `variantId: null`. A mapping pointing at the item with no size is listed in the report and left alone, because nobody can tell which drink it meant.
4. **Photo**: if the old item has one, each new dish gets a copy.
5. **The old item is switched off**, `isActive: false`. Never deleted. Its name stays taken in the database, which is fine.
6. Every write happens inside one transaction. If anything fails, nothing is written.

The report prints, for each new dish: name, price in rupees, GST, available or not, and what recipe, mappings and photo it got. Then what happens to the old item.

A second run, with the old item already switched off, prints "Nothing to do: Aerated Drinks is already switched off." and exits.

What it does not touch:
1. Open orders and existing bills. Their lines have the name, size and price frozen on them, so they keep "Aerated Drinks (Coke)". That is correct.
2. Kitchen routing. It follows the category, which does not change.
3. Prices. They are copied exactly as stored. Whether ₹70 is a printed MRP that includes GST is still an open question for Z Chaat (PROFILE section 15 item 7). Do not change it here.

### B2. Endpoints

None added. None changed.
The menu screens read the new dishes through the existing `GET /menu` and `GET /menu-items`.

### B3. Database fields

| Collection | Fields written |
|---|---|
| `menuitems` (new documents) | `restaurantId`, `branchId`, `categoryId`, `name`, `nameLower`, `description`, `priceInPaise`, `taxRateBps`, `isAvailable`, `isActive`, `variants`, `addOns`, `displayOrder` |
| `menuitems` (the old item) | `isActive` set to false |
| `recipes` | new documents for the new dishes, as in B1 |
| `platformitemmappings` | `menuItemId` and `variantId` on mappings that pointed at a size |
| `menuphotos` | a copy per new dish, if the old item had a photo |

No new field anywhere. No schema change.
Every query and every new document carries the restaurant's `restaurantId`, and the branch's `branchId`.

### B4. Permission rules

This is a script run by a developer with the database address in their `.env`, not an endpoint. No role can call it from the app.
For the same change by hand, an OWNER or MANAGER already can: add four dishes in the menu builder and switch the old one off. The script exists so recipes, mappings and photos move too, with nothing missed.

### B5. Validation rules

The script stops, writes nothing, and says why, when:
1. `--restaurant` or `--item` is missing or empty.
2. No restaurant has exactly that name, or more than one does.
3. No item in that restaurant has exactly that name.
4. The item is already switched off. This is the "Nothing to do" case, and exits with success.
5. The item has no sizes.
6. Any size name is empty or longer than the menu item name limit in `MenuItem.js`.
7. Two sizes have the same name, ignoring case.
8. Any size name is already the name of another item in that restaurant and branch, switched on **or** off, ignoring case. List every clash.
9. Any other argument is given. Unknown arguments are refused, not ignored.

### B6. Z Chaat's menu file

In `setup/zchaat-menu.csv`, replace the four "Aerated Drinks" rows with four plain rows, same category, no size:

```
Beverages,Sprite,,70.00,5,yes,
Beverages,Diet Coke,,70.00,5,yes,
Beverages,Coke,,70.00,5,yes,
Beverages,Thums Up,,70.00,5,yes,
```

In `docs/clients/zchaat/PROFILE.md`, the two places that say "Aerated Drinks ₹70" (section 3, the tax table, and section 15 item 7) now name the four drinks. The MRP question itself stays open.
The Z Chaat test in `setupScripts.test.js` now expects 100 items and still 105 rows. Change those numbers on purpose, and say so in the commit message.

### B7. Tests

New file `server/tests/sizesToDishes.test.js`, on the in-memory database:
1. An item "Aerated Drinks" with four sizes at ₹70, one size switched off: after `--apply`, four new dishes in the same category, each ₹70.00 at 5%, the switched-off size's dish not available, and the old item switched off.
2. The new dishes sit where the old item sat in the category, in size order.
3. A recipe on the Coke size becomes Coke's item-level recipe. A size with no recipe gets a copy of the item-level recipe.
4. A platform mapping on the Coke size points at the new Coke dish with no size. A mapping on the item with no size is left alone and listed in the report.
5. A photo on the old item is copied to each new dish.
6. The dry run writes nothing. Count every collection before and after.
7. A second run says "Nothing to do" and writes nothing.
8. A size named like an existing switched-off item is refused, the clash is named, and nothing is written.
9. A restaurant B item with the same name is never read or changed.
10. An order opened before the run still bills "Aerated Drinks (Coke)" at its frozen price after the run. A new order can add "Coke" and bills it as "Coke".
11. Unknown arguments are refused.

Commits: `add a script that turns an item's sizes into dishes`, then `zchaat menu: aerated drinks as four dishes`.

### B8. Running it on Z Chaat

Only after Part A and Part B pass every test, and the code is pushed.

1. Run the dry run against the cloud database in `.env`:
   `npm run menu:sizes-to-dishes -- --restaurant "Z Chaat" --item "Aerated Drinks"`
2. Show me the full report.
3. **Stop and wait for me to say "apply".** Do not run `--apply` on your own. This changes the live menu during service.
4. When I say so, run it with `--apply`, then run the dry run once more and show me "Nothing to do".
5. Check through `GET /menu` as Z Chaat's owner, or by reading the database: Beverages shows Sprite, Diet Coke, Coke and Thums Up, and no Aerated Drinks.

If I am not there to answer, finish Part C without the live run, and say clearly in the summary that it is waiting for me.

---

## 9. Part C. Full check

1. `npm test`, the whole suite. Every test that passed before must still pass. Record the counts before and after.
2. `npm run lint` and `npm run build`.
3. By hand, through the screens, on the local e2e server or the golden day:
   1. Open a table, send 1 Roti, send 1 more Roti, bill it. The bill screen shows "2 × Roti" once.
   2. Print it on 80 mm thermal and on A4, to PDF. Both show Roti once, quantity 2.
   3. Remove one Roti through "Which one?". The bill shows "1 × Roti" and keeps its number.
   4. After running the Part B script on a local copy: the menu shows Coke as its own tile, one tap adds it, and the bill prints "Coke".
   5. The bill screen and the menu at 380 wide: no sideways scroll.
   List anything you could not check, and why.

---

## 10. Out of scope

1. The order screen and the kitchen tickets. They stay one line per round, because the kitchen cooks in rounds.
2. Joining lines in the database, or changing how a bill is created.
3. Removing part of one line, like 1 of a line of 2. Not supported today, and not added here.
4. Reports. They already group by item. In R11, old sales stay under "Aerated Drinks (Coke)" and new ones show under "Coke". That is the honest history.
5. Tally, platform orders and the card machine.
6. A button in the menu builder to split sizes. Add one only if a second restaurant asks.
7. Changing any price, including the MRP question.
8. Splitting any other item. The script can do it later, one item at a time, when asked.

## 11. How to know it is finished

1. The Part A spec commit comes before any Part A code.
2. Every test in A8 and B7 passes, and the whole suite passes, with counts before and after.
3. The checks by hand in Part C are done, or each one not done is listed with the reason.
4. On Z Chaat: the dry run report was shown, I said apply, it was applied, and a second run says "Nothing to do". If I did not say apply, the task stops at the dry run and says so.
5. `docs/PROJECT-STATE.md`: the date line, the P35 entry at the top of "What changed recently" with its progress table and the live report, and two decision log rows, dated today:
   "A bill shows the same dish once, as item rows computed from its lines when it is read; the lines themselves are unchanged. | Z Chaat asked for 2 × Roti, not 1 × Roti twice. Each round must still trace to its own order line and kitchen ticket."
   "Z Chaat's Aerated Drinks became four dishes, Sprite, Diet Coke, Coke and Thums Up, through `npm run menu:sizes-to-dishes`. The old item is switched off, not deleted. | One tap per drink at the table, and the bill prints the drink's own name. Old bills keep the name they were sold under."
6. `docs/prompts/README.md`: P35 marked Done, or "Done, live run waiting" if B8 is waiting.
7. Push `main`. The server deploys on push to Render, and the screens on push to Vercel.
8. Print a short summary: commits, test counts before and after, what you checked by hand, and the live report.
