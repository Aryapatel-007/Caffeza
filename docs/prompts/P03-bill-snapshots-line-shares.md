# P03 Bill snapshots and line shares

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P02.

---

## 1. What to build, in one sentence

Freeze onto every order line its category, and onto every bill its captain, covers, opening time, and each line's exact share of the discount and GST, so every report can add up frozen values that always balance to the bill.

## 2. Module

M3 Billing with GST, plus one additive change to M2 order lines.

## 3. Why

Reports in M19 must never recompute tax, never read a live menu, and never read today's category for an old sale. `CLAUDE.md` says so.
Today a bill does not store which category each line belongs to, who the captain was, how many guests sat down, or how much of the discount and GST belongs to each line.
Without those, a category report has to read the live menu, a captain report has to join back to orders, and an item report cannot split the discount. Caffeza's old captain report was ₹16,392 short of its own day total for exactly this kind of reason.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P03-bill-snapshots-line-shares.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count. If anything fails before you start, stop and tell me.

## 5. Files to read first

1. `docs/GLOSSARY.md` sections 2 and 3. Section 3 is the line share rule. Follow it exactly.
2. `docs/TEST-DATA.md` sections 2 and 3. Section 3 has the exact expected shares.
3. `docs/RECONCILIATION-RULES.md` checks C1 and C2.
4. `docs/DB-SCHEMA.md` section 9 `orders` and section 12 `bills`.
5. `docs/API-CONTRACT.md` section 12 order endpoints and section 14 bill endpoints.
6. `server/utils/tax.js` and `server/utils/money.js`, in full.
7. `server/utils/units.js`, for how this repo already does exact integer maths with `BigInt`.
8. `server/services/billService.js`, in full.
9. `buildLineSnapshots` in `server/services/orderService.js`.
10. `server/models/Order.js`, `server/models/Bill.js`, `server/models/Category.js`, `server/models/User.js`.
11. `server/tests/tax.test.js` and `server/tests/bills.test.js`, to follow their style.

---

## 6. The new fields

All additive. Every new field has a default of `null`, so old documents still read and still validate.

### 6a. On `orders.lines[]`, frozen when the line is added

| Field | Type | Source |
|---|---|---|
| `categoryId` | ObjectId or null | The menu item's `categoryId` when the line is added |
| `categoryName` | String or null | That category's `name` when the line is added |

Frozen at add time, not at bill time, for the same reason price and name are.
If an item moves category between the order and the bill, the sale belongs to the category it was ordered under.

### 6b. On `bills`, frozen when the bill is created

| Field | Type | Source |
|---|---|---|
| `captainId` | ObjectId | `order.openedBy` |
| `captainName` | String | That user's `name`, read when the bill is created |
| `guestCount` | Number or null | `order.guestCount` |
| `orderOpenedAt` | Date | `order.openedAt` |

"Captain" means the person who opened the order. `docs/GLOSSARY.md` section 8 defines it.

### 6c. On `bills.lines[]`

| Field | Type | Source |
|---|---|---|
| `categoryId` | ObjectId or null | Copied from the order line. Null for lines on orders created before this change. |
| `categoryName` | String or null | Same |
| `discountShareInPaise` | Number | This line's share of the bill discount. Integer, 0 or more. |
| `taxableInPaise` | Number | `lineTotalInPaise − discountShareInPaise` |
| `taxInPaise` | Number | This line's share of its tax rate's GST. Integer, 0 or more. |

`discountShareInPaise`, `taxableInPaise` and `taxInPaise` are always written on every bill created or re-discounted after this change.
On older bills they are absent. Reports in M19 treat an absent share as "not recorded". Do not back-fill old bills. Caffeza's production database will start empty, and demo data is rebuilt with `npm run seed:demo`.

---

## 7. The line share arithmetic

### 7a. Where it lives

In `server/utils/tax.js`, and nowhere else. `CLAUDE.md`: "Tax arithmetic lives in `server/utils/tax.js`."

`computeBillTotals` does not change at all.
Its numbers are tested to the paisa, and the five real Caffeza bills in `docs/TEST-DATA.md` match it exactly.
The new code reads its output and splits it. It never changes it.

### 7b. Two new exported functions

`largestRemainderSplit(amount, weights)`
Splits a whole number of paise across weights so the parts add up exactly to `amount`.

1. If `amount` is 0, or every weight is 0, return all zeros.
2. Each part's exact share is `amount × weight ÷ total weight`. Give each part the whole paise of its share, rounded down.
3. Hand out the paise left over, one at a time, to the parts with the biggest leftover fraction.
4. A tie goes to the earlier part.

Do the multiplication with `BigInt`.
`amount` can be up to `MAX_PAISE`, 10 crore paise, and a weight can be just as large, so the product can pass `Number.MAX_SAFE_INTEGER`. `units.js` already uses `BigInt` for the same reason.
Compare leftover fractions as `BigInt` remainders too, never as floating point.
Throw on a negative amount, a negative weight, or a non-integer, using the same assertion style as the rest of `tax.js`.

`allocateLineShares(lines, totals)`
`lines` are bill lines, each with `lineTotalInPaise` and `taxRateBps`.
`totals` is exactly what `computeBillTotals` returned for those lines.
It returns an array in the same order as `lines`, each item `{ discountShareInPaise, taxableInPaise, taxInPaise }`.

For each tax rate in `totals.taxBreakdown`, separately:

1. Take that rate's lines, in bill order.
2. The rate's discount is the sum of those lines' totals minus the slab's `taxableInPaise`.
3. Split that discount across the rate's lines with `largestRemainderSplit`, weighted by `lineTotalInPaise`.
4. Each line's `taxableInPaise` is its line total minus its discount share.
5. Split the slab's `taxInPaise` across the same lines with `largestRemainderSplit`, weighted by each line's `taxableInPaise`.

Before returning, check C2 itself:
the discount shares add up to `totals.discountAmountInPaise`,
and for each rate, line `taxableInPaise` adds up to the slab's `taxableInPaise` and line `taxInPaise` adds up to the slab's `taxInPaise`.
If any of these fails, throw an `Error` naming the rate and the difference.
That can only happen through a bug in this code, and a bill with shares that do not balance must never be saved.

### 7c. Why "inside each tax rate"

`computeBillTotals` already shares the discount between tax rates, in `apportionDiscount`.
That split is part of the frozen arithmetic and stays as it is.
Line shares then work inside each rate, so the line figures always add up to the slab figures already on the bill.

### 7d. Expected results

These come from `docs/TEST-DATA.md` section 3, produced by the repo's own `computeBillTotals`.
Your tests must reproduce every number.

B01, 10% discount on ₹530.00, all 5%:

| Line | Line total | Discount share | Taxable | GST share |
|---|---|---|---|---|
| Sev Poori | 18000 | 1800 | 16200 | 810 |
| Tiramisu Brownie | 32000 | 3200 | 28800 | 1440 |
| Extra Charges | 3000 | 300 | 2700 | 135 |

Bill: CGST 1193, SGST 1192, round-off +15, total 50100.

B02, flat 7307 on ₹1,450.00, all 5%. This matches Caffeza's own real bill C22276.

| Line | Line total | Discount share | Taxable | GST share |
|---|---|---|---|---|
| Indian Platters | 45000 | 2268 | 42732 | 2137 |
| Chilli Garlic Noodle Bowl | 40000 | 2016 | 37984 | 1899 |
| Mocha Flower | 28000 | 1411 | 26589 | 1329 |
| Roasted Papad | 8000 | 403 | 7597 | 380 |
| Laccha Tawa Paratha | 8000 | 403 | 7597 | 380 |
| Roasted Papad | 8000 | 403 | 7597 | 380 |
| Roasted Papad | 8000 | 403 | 7597 | 380 |

Bill: CGST 3443, SGST 3442, round-off +22, total 144600.

B08, flat 20000 on ₹505.00, both lines at 0%:

| Line | Line total | Discount share | Taxable | GST share |
|---|---|---|---|---|
| Ferrero Hazelnut Shake | 33000 | 13069 | 19931 | 0 |
| Masala Pav Sandwich | 17500 | 6931 | 10569 | 0 |

Bill: total 30500.

B14, flat 1383 on ₹540.00, all 5%:

| Line | Line total | Discount share | Taxable | GST share |
|---|---|---|---|---|
| Cheesy Tornado | 36000 | 922 | 35078 | 1754 |
| Sev Poori | 18000 | 461 | 17539 | 877 |

Bill: CGST 1316, SGST 1315, round-off −48, total 55200.

B16, flat 3900 on ₹780.00, all 5%:

| Line | Line total | Discount share | Taxable | GST share |
|---|---|---|---|---|
| Mumbaiya Pav Bhaji Platter | 45000 | 2250 | 42750 | 2138 |
| Ferrero Hazelnut Shake | 33000 | 1650 | 31350 | 1567 |

Bill: CGST 1853, SGST 1852, round-off −5, total 77800.

B05, no discount, ₹757.61 at 5%, the water bottle stored at 4761:

| Line | Line total | Discount share | Taxable | GST share |
|---|---|---|---|---|
| Half & Half Pizza | 38000 | 0 | 38000 | 1900 |
| Ferrero Hazelnut Shake | 33000 | 0 | 33000 | 1650 |
| Water Bottle | 4761 | 0 | 4761 | 238 |

Bill: CGST 1894, SGST 1894, round-off −49, total 79500.

---

## 8. Where the code changes

### 8a. Order lines: `buildLineSnapshots` in `server/services/orderService.js`

After loading the menu items, load their categories in one scoped query: every distinct `categoryId` among the items, using `scoped(req)` like the item query above it.
Add `categoryId` and `categoryName` to each snapshot.
If an item's category cannot be found, which should not happen, store `categoryId` and set `categoryName` to null. Do not block the order over it.

### 8b. Bills: `server/services/billService.js`

`toBillLine` copies `categoryId` and `categoryName` from the order line, as null when the order line has none.

`createBill`:
1. Read the captain's name from `User`, scoped to the tenant, inside the same transaction. If the user cannot be found, use the text "Unknown" rather than fail the bill.
2. Set `captainId`, `captainName`, `guestCount` and `orderOpenedAt` from the order.
3. After `computeBillTotals`, call `allocateLineShares(lines, totals)` and write the three share fields onto each line before `Bill.create`.

`applyDiscount`:
It recomputes `totals` today. After that, call `allocateLineShares(bill.lines, totals)` and write the shares onto each line, in the same save.

Move the share-writing into the existing `applyTotals` helper so both paths use one piece of code. `applyTotals` will need the lines as well as the totals.

Nothing else in billing changes. Payments, voids and bill numbers stay exactly as they are.

### 8c. Responses

Every place a bill is returned now includes the new top-level fields and the new line fields.
Every place an order line is returned now includes `categoryId` and `categoryName`.
Check the serialisers, `serialiseOrder` and the bill equivalent, so nothing new is dropped and nothing private is added.

The receipt does not change in this prompt.

---

## 9. The spec, first

Before writing code, update and commit, as `add bill snapshot and line share spec`:

1. `docs/DB-SCHEMA.md` section 9: the two new OrderLine fields.
2. `docs/DB-SCHEMA.md` section 12: the four new bill fields and the five new bill line fields, with the rule from section 7b in a short paragraph.
3. `docs/API-CONTRACT.md` sections 12 and 14: the new fields in every response example that shows an order line or a bill.

---

## 10. Permissions

None change. No new endpoint.

## 11. Validation

No new inputs. Every new field is set by the server and never accepted from a request.
Make sure the existing strict request schemas still reject these fields if a client tries to send them.

---

## 12. Tests

### 12a. Unit tests for `tax.js`, in `server/tests/tax.test.js`

1. `largestRemainderSplit`: zero amount, all-zero weights, one weight, equal weights with leftover paise going to the earlier parts, a case where a later part has the bigger fraction and wins, and a very large amount and weight that would overflow without `BigInt`.
2. It throws on a negative amount, a negative weight and a decimal.
3. `allocateLineShares` reproduces every table in section 7d exactly.
4. A bill with lines at two different tax rates and a discount: every share is within its own rate, and C2 holds for each rate.
5. **Property test.** Generate at least 2,000 random bills: 1 to 15 lines, quantities 1 to 5, prices from 1 paisa to ₹5,000, tax rates from 0, 500, 1200 and 1800, with no discount, a percent discount, or a flat discount that fits. For every one, C1 and C2 hold to the paisa. Use a fixed seed so a failure can be repeated, and print the seed and the failing bill when one fails.

### 12b. Integration tests, in `server/tests/bills.test.js` and `server/tests/orders.test.js`

6. Adding a line to an order stores the item's `categoryId` and `categoryName`.
7. Moving the menu item to another category afterwards does not change the order line, and the bill still shows the old category.
8. Creating a bill stores `captainId`, `captainName`, `guestCount` and `orderOpenedAt` matching the order.
9. Renaming the captain after billing does not change `captainName` on the bill.
10. Build B02 through the real API: an order with its seven lines, a bill, then a flat discount of 7307 through `applyDiscount`. The bill's lines carry exactly the shares in section 7d, and the bill total is 144600.
11. Applying a second discount replaces the shares. Removing a discount, if the API allows it, sets every discount share to 0 and recomputes GST shares.
12. A bill created from an order whose lines have no category, simulating an order from before this change, still bills, with null category fields and correct shares.
13. A client sending `discountShareInPaise` or `captainName` in a request is refused by the existing strict schemas.

Run the full suite at the end. Every test that passed before must still pass.

---

## 13. Non-negotiable rules that apply

"Copy price, item name, and tax rate into the order when it is created. Never read them live from the menu at bill time." This prompt adds category to that list.
"Store all money as whole paise integers. Never as a decimal or float."
"Tax arithmetic lives in `server/utils/tax.js`. Nowhere else."
"Reports only add up values frozen onto records when the event happened."
"Schema changes are additive: new fields with defaults, nothing renamed or removed."

## 14. Checks and golden day

C1 and C2 from `docs/RECONCILIATION-RULES.md` must hold for every bill this code creates. The property test in 12a.5 is the proof.
The golden day bills B01, B02, B05, B08, B14 and B16 in `docs/TEST-DATA.md` are reproduced to the paisa by tests 3 and 10.
B08 is a 0% bill. Platform orders arrive in P06. Here, test it with lines whose `taxRateBps` is 0.

---

## 15. Docs to update

1. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P04, cancel reasons and the variant check."
   3. Decision log, dated today:
      "Order lines freeze `categoryId` and `categoryName` when added. Bills freeze `captainId`, `captainName`, `guestCount` and `orderOpenedAt`. | Reports must not read the live menu or join back to orders. A sale belongs to the category it was ordered under."
      "Each bill line stores its discount share, taxable value and GST share, split by the largest remainder method inside each tax rate, in `allocateLineShares` in `tax.js`. `computeBillTotals` is unchanged. | Category and item reports add up exactly to the bill. The split reproduces Caffeza's real bill C22276."
      "Old bills are not back-filled with shares or categories. | Caffeza's production database starts empty, and demo data is rebuilt by `npm run seed:demo`."
   4. "What changed recently": a P03 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
2. `docs/prompts/README.md`: mark P03 as Done.

---

## 16. Out of scope

Any change to `computeBillTotals`, `apportionDiscount`, rounding or round-off.
Wiring `tax.pricingMode` or `tax.roundOffEnabled`.
Delivery orders, platform fields and 0% tax treatment. That is P06.
Printing the captain or categories on the receipt.
Any report. Reports start at P13.
Back-filling old bills or orders.

---

## 17. Done when

1. `npm test` passes, with before and after counts recorded, including the 2,000-bill property test.
2. `npm run lint` and `npm run build` pass.
3. Locally: run `npm run seed:demo`, open one discounted bill through `GET /bills/:billId`, and see the shares on every line adding up to the bill's discount and GST.
4. Every doc in section 15 is updated.
5. Commits on `main`, one line each, for example:
   `add bill snapshot and line share spec`
   `add largest remainder line shares to tax`
   `freeze category on order lines`
   `freeze captain covers and line shares on bills`
   `update docs for p03`
6. Push `main`.
7. Print a short summary: commits, files changed, test counts before and after, and the B02 shares as stored by the API.
