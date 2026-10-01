# P06 Delivery and platform orders

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P05.

---

## 1. What to build, in one sentence

Add a delivery order type for Zomato and Swiggy orders entered by hand, with the platform and its order number frozen on the order and the bill, and bill platform orders at 0% GST because the platform pays the GST on them.

## 2. Module

M17 Delivery and Platform Orders, new.
It touches M2 (order types, order creation, line snapshots, KOT ticket) and M3 (bill fields).
Platform payouts, meaning money the platforms send later, are not here. They are designed in P07 and built in P09.

## 3. Why

Caffeza took 4 delivery orders on 26 September, all through Zomato or Swiggy, and their current POS bills them in a separate "Sales 0%" group.
Under section 9(5) of the GST law, a food delivery platform collects and pays the GST on restaurant orders placed through it. So the restaurant's own bill for those orders carries no GST.
This is `TO CONFIRM` with Caffeza's CA, so it is a setting, defaulted to how Caffeza works today.

Today our order types are only `DINE_IN` and `TAKEAWAY`.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P06-delivery-platform-orders.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. `docs/prompts/README.md` must show P05 as Done. If not, stop and tell me.
4. Run `npm test` and record the count. It should match the "after" count in P05's entry in `docs/PROJECT-STATE.md`. If anything fails before you start, stop and tell me.

## 5. Files to read first

1. `docs/GLOSSARY.md` section 7, platform terms.
2. `docs/CAFFEZA-PROFILE.md` sections 3, 5 and 10.
3. `docs/TEST-DATA.md` bills B07 and B08.
4. `docs/API-CONTRACT.md` section 12 on creating orders, section 14 on bills, and the M7 settings section.
5. `docs/DB-SCHEMA.md` section 9 `orders`, section 12 `bills`, section 17 settings.
6. `server/models/Order.js`, especially the order type list, the table rules and `occupiesTable`.
7. `server/validators/orderValidators.js`, creating an order.
8. `server/services/orderService.js`, `buildLineSnapshots` and order creation.
9. `server/services/billService.js`, `createBill` and `toBillLine`.
10. The KOT ticket layout from P05.
11. `client/src/features/orders/`, the screen that opens a new order.

---

## 6. The platform list

Create `server/config/platforms.js`, a frozen list, the same style as `cancelReasons.js` from P04:

| Code | Name | Order type it applies to |
|---|---|---|
| `ZOMATO` | Zomato | `DELIVERY` |
| `SWIGGY` | Swiggy | `DELIVERY` |

Zomato Gold, Dineout and EazyDiner are not on this list.
Those guests sit at a table, so the order is `DINE_IN`, and only the payment goes through the app. They become payment methods in P08.

Mirror the list, codes and names only, in `client/src/features/orders/platforms.js`, with no imports, and add a test that the two match, like P04's reason mirror.

---

## 7. The data

All additive.

### 7a. Settings

New group `settings.delivery`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `platformCollectsGst` | Boolean | `true` | When true, an order placed through a platform on the list is billed at 0%. `TO CONFIRM` with the CA. |

Changing it writes `SETTINGS_CHANGED`, through the existing settings audit code.
It only affects orders created after the change. An order freezes its tax treatment when it is created.

### 7b. Orders

| Field | Type | Notes |
|---|---|---|
| `orderType` | String | The enum gains `DELIVERY`. Append only. |
| `platform` | Object or null | `{ code, name, orderId }`. Required for `DELIVERY`, null otherwise. `name` is frozen from the list. |
| `taxTreatment` | String | `NORMAL` or `PLATFORM_COLLECTS`. Default `NORMAL`. Set once, when the order is created, never changed after. |
| `lines[].menuTaxRateBps` | Number or null | The item's own GST rate, kept for reference when the line itself is billed at 0%. Null on `NORMAL` orders. |

`platform.orderId` is the platform's own number for the order, like `249377796192385`. Trimmed, 3 to 40 characters, letters and digits only.

A new unique partial index stops the same platform order from being entered twice:
`{ restaurantId, 'platform.code': 1, 'platform.orderId': 1 }`, unique, with `partialFilterExpression: { 'platform.orderId': { $type: 'string' }, isCancelled: false }`.
A cancelled order frees its platform number, so a mistyped entry can be cancelled and entered again.
Register nothing new in `models/index.js`, since `Order` is already there. `db:indexes` will build the new index on deploy.

### 7c. Bills

| Field | Type | Notes |
|---|---|---|
| `platform` | Object or null | Copied from the order |
| `taxTreatment` | String | Copied from the order. Old bills read as `NORMAL`. |

`orderType` already exists on bills and gains `DELIVERY` through the order.

---

## 8. Rules

### 8a. Creating a delivery order

| Rule | Error |
|---|---|
| `DELIVERY` without `platform` | 400 VALIDATION_FAILED |
| `platform.code` not on the list | 400, listing the allowed codes |
| `platform.orderId` missing or malformed | 400 |
| `DELIVERY` with a `tableId` or a `guestCount` | 400. A delivery order has no table and no guests. |
| The same platform order number already on a live order | 409 DUPLICATE, message "Swiggy order 249377796192385 is already entered as order {orderNumber}." Catch the duplicate key from the index, the way `createBill` catches its own. |

`customerName` and `customerPhone` stay optional, exactly as they are.
A delivery order never occupies a table, so `occupiesTable` stays false.
The roles that may open orders today may open delivery orders.

### 8b. Tax treatment

When a `DELIVERY` order is created with a platform from the list, and `settings.delivery.platformCollectsGst` is true, the order's `taxTreatment` is `PLATFORM_COLLECTS`.
Every other order is `NORMAL`.

In `buildLineSnapshots`, for a `PLATFORM_COLLECTS` order:
the line's `taxRateBps` is 0,
and `menuTaxRateBps` keeps the item's own rate.
Everything else in the snapshot is unchanged.

This keeps `computeBillTotals` and `allocateLineShares` completely untouched.
They see lines at 0% and produce a 0% slab, exactly as P03's test for B08 already proves.
`CLAUDE.md` says tax arithmetic lives only in `tax.js`. This prompt changes no arithmetic. It only decides, at the moment a line is added, which rate is frozen onto it.

### 8c. Billing

`createBill` copies `platform` and `taxTreatment` onto the bill.
Nothing else in billing changes.
Discounts work on delivery bills exactly as on any other bill. Who paid for a discount, the restaurant or the platform, arrives with discount reasons in P08.
Payments on delivery bills accept the methods that exist today. P08 restricts them to the platform's own method.

### 8d. The KOT ticket

For a delivery order, line 3 of the ticket from P05 reads, for example:
`DELIVERY  SWIGGY 249377796192385`
and the customer name below it when there is one.

---

## 9. The client

1. On the screen where a new order starts, add "Delivery" beside dine-in and takeaway.
2. Choosing Delivery asks for the platform, as one big button each, and the platform order number, with a numeric keyboard on phones.
3. The order screen header shows the platform and its order number instead of a table.
4. The order list and the bill screen show the platform and number wherever they show a table today.
5. A 409 for a duplicate platform number shows the message from the server, with a link to the existing order.

Follow `docs/DESIGN-SYSTEM.md`. The flow must work on the cashier's computer with a keyboard, because delivery orders are usually typed in at the counter.

---

## 10. The spec, first

Before writing code, update and commit, as `add delivery and platform orders spec`:

1. `docs/API-CONTRACT.md`: a new section "M17 Delivery and Platform Orders" with the platform list, the rules in section 8, the request and response examples, and its permission table. Update section 12's order creation and section 14's bill shape to point at it.
2. `docs/API-CONTRACT.md` M7 section: the `delivery` settings group.
3. `docs/DB-SCHEMA.md` sections 9, 12 and 17: the new fields, the new index, and the new settings group.
4. `docs/GLOSSARY.md` section 7: change "Platform-paid GST" to say the stored value is `taxTreatment: PLATFORM_COLLECTS`.

---

## 11. Tests

**Orders**
1. A Swiggy delivery order is created with its platform, no table, `occupiesTable` false and `taxTreatment` `PLATFORM_COLLECTS`.
2. Every row of the table in section 8a.
3. The same Swiggy number twice is 409 with the existing order number in the message. The same number on Zomato is allowed. After cancelling the first, the number can be entered again.
4. With `platformCollectsGst` false, a new delivery order is `NORMAL`, and an order created before the change keeps `PLATFORM_COLLECTS`.
5. A line on a `PLATFORM_COLLECTS` order stores `taxRateBps` 0 and `menuTaxRateBps` 500.

**Bills, using the golden day**
6. B07: a Swiggy order with Half & Half Pizza, Ferrero Hazelnut Shake and Caffe Latte bills at item total 93000, GST 0, round-off 0, total 93000, with one 0% slab, and `platform` and `taxTreatment` copied.
7. B08: a Zomato order with Ferrero Hazelnut Shake and Masala Pav Sandwich, then a flat discount of 20000 with the reason text "Merchant promo TAKE200", bills at total 30500, with line shares 13069 and 6931 and both GST shares 0.
8. A dine-in bill on the same day is unaffected: still 5%.

**Ticket**
9. The KOT ticket for a delivery order shows the platform and number, and no table.

**Mirror**
10. The client and server platform lists match.

Run the full suite at the end. Every test that passed before must still pass.

---

## 12. Non-negotiable rules that apply

"Copy price, item name, and tax rate into the order when it is created. Never read them live from the menu at bill time." The 0% rate is decided and frozen when the line is added, never at bill time.
"GST rates are settings, never hardcoded." Whether platforms collect GST is a setting.
"Tax arithmetic lives in `server/utils/tax.js`. Nowhere else." This prompt adds none.
"Schema changes are additive."

## 13. Checks and golden day

C1 and C2 must hold on delivery bills. Tests 6 and 7 reproduce B07 and B08 from `docs/TEST-DATA.md` to the paisa.
C5 will later group delivery bills by platform. The frozen `platform.code` on the bill is what it groups by.

---

## 14. Docs to update

1. `docs/CAFFEZA-PROFILE.md` section 15: under "From their CA", mark item 3 as built as a setting, `settings.delivery.platformCollectsGst`, defaulting to 0%.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P07, the settlement spec."
   3. Module status: M17 becomes IN PROGRESS, "Delivery orders and 0% platform tax built in P06. Payouts come in P09."
   4. Decision log, dated today:
      "Delivery orders carry a platform and its order number, frozen on the order and the bill. A platform order number can be live on only one order at a time. | Orders are typed in by hand from a second screen, and entering one twice is the likeliest mistake."
      "A platform order's lines are frozen at 0% GST, with the item's own rate kept in `menuTaxRateBps`, when `settings.delivery.platformCollectsGst` is true. The tax arithmetic is untouched. | Section 9(5): the platform pays the GST. Pending CA confirmation, so it is a setting."
   5. "What changed recently": a P06 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
3. `docs/prompts/README.md`: mark P06 as Done.

---

## 15. Out of scope

Importing orders from Zomato or Swiggy automatically. Orders are typed in by hand.
Payment methods, commission, and who funded a discount. That is P07 and P08.
Recording payouts from platforms. That is P09.
Own delivery by the cafe's own rider. Caffeza does not do it.
Packaging charges and delivery charges.

---

## 16. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand: enter a Swiggy order at the counter, fire it, see the platform on the KOT, bill it, and see GST 0 on the bill and the printed receipt.
4. By hand: enter the same Swiggy number again and get the duplicate message.
5. Every doc in section 14 is updated.
6. Commits on `main`, one line each, for example:
   `add delivery and platform orders spec`
   `add delivery order type and platform fields`
   `freeze zero gst on platform orders`
   `add delivery to the order screens`
   `update docs for p06`
7. Push `main`.
8. Print a short summary: commits, files changed, test counts before and after, and anything that surprised you.
