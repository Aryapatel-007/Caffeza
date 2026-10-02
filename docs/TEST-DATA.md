# Test Data: the Golden Day

This file defines one full business day of fixture data, with every expected number worked out.
Every report test and every check test uses it.

How the numbers were produced:
Each bill was run through the repo's own `computeBillTotals` in `server/utils/tax.js`.
Line shares use the largest remainder rule from `docs/GLOSSARY.md` section 3.
Nothing here was added up by hand.

Five of these bills are real Caffeza bills from 26 September 2026, and they match Caffeza's own totals exactly:
B01 is their C22266, B02 is C22276, B03 is C22262, B04 is C22263, and B06 is C22272.

The fixture builder is written by prompt P14, in `server/tests/helpers/goldenDay.js`.
It creates everything below through the real services, the same way `scripts/seedDemo.js` drives the real API.
Prompt P21 replays the whole day end to end.

---

## 1. Setup

**Restaurant**

| Setting | Value |
|---|---|
| Business day starts | 5:00 AM, `businessDayStartsAtMinutes: 300` |
| Business date under test | `2026-09-26` |
| Tax pricing | Exclusive |
| Invoice prefix | `CFA/C/` |
| Invoice starting number | 22442 |

**Stations:** Live Kitchen, Beverages.

**Staff**

| Name | Role |
|---|---|
| Owner | `OWNER` |
| Manager | `MANAGER` |
| Counter | `CASHIER` |
| Khuman Singh | `WAITER` |
| Budha Singh | `WAITER` |
| Devendra Singh | `WAITER` |
| Ranjeet Paswan | `WAITER` |

**Payment methods:** Cash, Card, UPI as money in hand. Zomato Gold, Dineout, EazyDiner, Zomato, Swiggy as platform money.

**On Hold accounts:** "E-210 Office" and "W-330 Office", both opening at ₹0.

**Menu.** Prices are before tax. Every item is at 5% GST.

| Item | Price | Category | Station |
|---|---|---|---|
| Sev Poori | ₹180.00 | Bhel 2.0 | Live Kitchen |
| Tiramisu Brownie | ₹320.00 | Dessert | Live Kitchen |
| Extra Charges | ₹30.00 | Extras | Live Kitchen |
| Indian Platters | ₹450.00 | Cafezza Mains | Live Kitchen |
| Chilli Garlic Noodle Bowl | ₹400.00 | Deconstructed Bowls | Live Kitchen |
| Mocha Flower | ₹280.00 | Italian Coffees | Beverages |
| Roasted Papad | ₹80.00 | Accompaniments | Live Kitchen |
| Laccha Tawa Paratha | ₹80.00 | Accompaniments | Live Kitchen |
| Creamy Pesto Pasta | ₹430.00 | Pasta | Live Kitchen |
| Cheesy Tornado | ₹360.00 | Pizza | Live Kitchen |
| Caffe Latte | ₹220.00 | Italian Coffees | Beverages |
| Chole Kulcha Platter | ₹350.00 | Cafezza Mains | Live Kitchen |
| Half & Half Pizza | ₹380.00 | Pizza | Live Kitchen |
| Ferrero Hazelnut Shake | ₹330.00 | Cafezza Shakes | Beverages |
| Water Bottle | ₹47.61 | Cold Beverages | Beverages |
| Masala Pav Sandwich | ₹175.00 | Sandwiches & Wraps | Live Kitchen |
| Masala Tea | ₹90.00 | Assorted Teas | Beverages |
| Mexican Bowl | ₹400.00 | Deconstructed Bowls | Live Kitchen |
| College Sandwich | ₹230.00 | Sandwiches & Wraps | Live Kitchen |
| Piri Piri Paneer Pizza | ₹330.00 | Pizza | Live Kitchen |
| Thecha Paneer Chilli | ₹390.00 | Cafezza Mains | Live Kitchen |
| Mumbaiya Pav Bhaji Platter | ₹450.00 | Cafezza Mains | Live Kitchen |

---

## 2. The bills

All times are India time on 26 September 2026, unless marked.
Invoice numbers run from `CFA/C/22442` for B01 to `CFA/C/22457` for B16.

| Bill | Invoice | Type | Table | Covers | Captain | Opened | Billed | Paid |
|---|---|---|---|---|---|---|---|---|
| B01 | CFA/C/22442 | Dine-in | Table 5 | 2 | Khuman Singh | 11:40 AM | 12:30 PM | 12:36 PM |
| B02 | CFA/C/22443 | Dine-in | Table 7 | 3 | Budha Singh | 1:01 PM | 1:52 PM | 1:58 PM |
| B03 | CFA/C/22444 | Dine-in | Table 12 | 4 | Khuman Singh | 1:10 PM | 2:02 PM | 2:09 PM |
| B04 | CFA/C/22445 | Dine-in | Table 2 | 1 | Devendra Singh | 2:20 PM | 2:55 PM | 2:58 PM |
| B05 | CFA/C/22446 | Dine-in | Table 3 | 2 | Budha Singh | 3:05 PM | 3:50 PM | 3:54 PM |
| B06 | CFA/C/22447 | Dine-in | Table 14 | 2 | Khuman Singh | 4:10 PM | 4:58 PM | 5:03 PM |
| B07 | CFA/C/22448 | Delivery, Swiggy | none | 0 | Counter | 5:20 PM | 5:21 PM | 5:21 PM |
| B08 | CFA/C/22449 | Delivery, Zomato | none | 0 | Counter | 6:05 PM | 6:06 PM | 6:06 PM |
| B09 | CFA/C/22450 | Dine-in | Table 35 | 1 | Ranjeet Paswan | 6:05 PM | 6:30 PM | On Hold |
| B10 | CFA/C/22451 | Dine-in | Table 30 | 2 | Ranjeet Paswan | 6:18 PM | 7:10 PM | On Hold |
| B11 | CFA/C/22452 | Dine-in | Table 16 | 2 | Devendra Singh | 7:20 PM | 8:05 PM | Voided 8:09 PM |
| B12 | CFA/C/22453 | Dine-in | Table 16 | 2 | Devendra Singh | 7:20 PM | 8:11 PM | 8:15 PM |
| B13 | CFA/C/22454 | Dine-in | Table 11 | 3 | Khuman Singh | 8:30 PM | 9:40 PM | 9:44 PM |
| B14 | CFA/C/22455 | Dine-in | Table 4 | 2 | Budha Singh | 10:51 PM | 11:55 PM | 12:02 AM, 27 Sep |
| B15 | CFA/C/22456 | Takeaway | none | 0 | Counter | 9:10 PM | 9:12 PM | 9:13 PM |
| B16 | CFA/C/22457 | Dine-in | Table 18 | 3 | Devendra Singh | 7:40 PM | 8:40 PM | 8:46 PM |

B12 is the same order as B11, billed again after the void.
B14 is paid after midnight, and still belongs to business date 26 September.

**What each bill contains, and its expected totals**

| Bill | Lines | Discount | Net sales | CGST | SGST | Round-off | Bill total | Paid with |
|---|---|---|---|---|---|---|---|---|
| B01 | Sev Poori, Tiramisu Brownie, Extra Charges. Item total ₹530.00 | 10%, Regular guest: ₹53.00 | ₹477.00 | ₹11.93 | ₹11.92 | +₹0.15 | ₹501.00 | Cash ₹501.00 |
| B02 | Indian Platters, Chilli Garlic Noodle Bowl, Mocha Flower, Roasted Papad, Laccha Tawa Paratha, Roasted Papad, Roasted Papad. Item total ₹1,450.00 | Flat ₹73.07, Zomato Gold | ₹1,376.93 | ₹34.43 | ₹34.42 | +₹0.22 | ₹1,446.00 | Zomato Gold ₹1,446.00 |
| B03 | Creamy Pesto Pasta, Cheesy Tornado, Caffe Latte. Item total ₹1,010.00 | none | ₹1,010.00 | ₹25.25 | ₹25.25 | +₹0.50 | ₹1,061.00 | Card ₹1,061.00 |
| B04 | Chole Kulcha Platter. Item total ₹350.00 | none | ₹350.00 | ₹8.75 | ₹8.75 | +₹0.50 | ₹368.00 | UPI ₹368.00 |
| B05 | Half & Half Pizza, Ferrero Hazelnut Shake, Water Bottle. Item total ₹757.61 | none | ₹757.61 | ₹18.94 | ₹18.94 | −₹0.49 | ₹795.00 | Cash ₹500.00, UPI ₹295.00 |
| B06 | Indian Platters, Caffe Latte, Water Bottle. Item total ₹717.61 | none | ₹717.61 | ₹17.94 | ₹17.94 | −₹0.49 | ₹753.00 | Cash ₹753.00 |
| B07 | Half & Half Pizza, Ferrero Hazelnut Shake, Caffe Latte. Item total ₹930.00 | none | ₹930.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹930.00 | Swiggy ₹930.00 |
| B08 | Ferrero Hazelnut Shake, Masala Pav Sandwich. Item total ₹505.00 | Flat ₹200.00, merchant promo TAKE200, funded by the restaurant | ₹305.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹305.00 | Zomato ₹305.00 |
| B09 | Masala Tea. Item total ₹90.00 | 50%, Staff or office: ₹45.00 | ₹45.00 | ₹1.13 | ₹1.12 | −₹0.25 | ₹47.00 | On Hold, E-210 Office |
| B10 | Mexican Bowl, Roasted Papad. Item total ₹480.00 | none | ₹480.00 | ₹12.00 | ₹12.00 | ₹0.00 | ₹504.00 | On Hold, W-330 Office |
| B11 | Piri Piri Paneer Pizza. Item total ₹330.00 | none | ₹330.00 | ₹8.25 | ₹8.25 | +₹0.50 | ₹347.00 | Voided: "Billed to the wrong table" |
| B12 | Piri Piri Paneer Pizza. Item total ₹330.00 | none | ₹330.00 | ₹8.25 | ₹8.25 | +₹0.50 | ₹347.00 | UPI ₹347.00 |
| B13 | Mexican Bowl. Item total ₹400.00 | none | ₹400.00 | ₹10.00 | ₹10.00 | ₹0.00 | ₹420.00 | Card ₹420.00 |
| B14 | Cheesy Tornado, Sev Poori. Item total ₹540.00 | Flat ₹13.83, Zomato Gold | ₹526.17 | ₹13.16 | ₹13.15 | −₹0.48 | ₹552.00 | Zomato Gold ₹552.00 |
| B15 | Caffe Latte × 2. Item total ₹440.00 | none | ₹440.00 | ₹11.00 | ₹11.00 | ₹0.00 | ₹462.00 | UPI ₹462.00 |
| B16 | Mumbaiya Pav Bhaji Platter, Ferrero Hazelnut Shake. Item total ₹780.00 | Flat ₹39.00, Dineout | ₹741.00 | ₹18.53 | ₹18.52 | −₹0.05 | ₹778.00 | Dineout ₹778.00 |

B07 and B08 are platform delivery orders.
The platform pays the GST, so both are at 0%.

**The order behind B13 also had two cancelled items:**

| Item | Value | Stage | Reason | Cancelled by |
|---|---|---|---|---|
| Thecha Paneer Chilli | ₹390.00 | After preparation, `wasPrepared: true` | Modification | Khuman Singh |
| Cheesy Tornado | ₹360.00 | Before preparation, never fired | Wrong item | Khuman Singh |

Neither appears on B13.

**No Charge**

| Record | Table | Items | No Charge value | Reason | Opened by | Approved by |
|---|---|---|---|---|---|---|
| N01 | Table 29 | College Sandwich | ₹230.00, before GST | Corporate office order | Ranjeet Paswan | Manager |

N01 gets no invoice number, and appears in no sales figure.

**Cash drawer**

| Entry | Amount |
|---|---|
| Opening float | ₹2,000.00 |
| Paid out: milk from the dairy, by Manager | ₹350.00 |
| Counted at Day Close | ₹3,400.00 |

---

## 3. Line shares on the discounted bills

These are what P03 must store on each bill line.

**B01** (10% of ₹530.00 is ₹53.00, GST ₹23.85)

| Line | Line total | Discount share | Line net sales | GST share |
|---|---|---|---|---|
| Sev Poori | ₹180.00 | ₹18.00 | ₹162.00 | ₹8.10 |
| Tiramisu Brownie | ₹320.00 | ₹32.00 | ₹288.00 | ₹14.40 |
| Extra Charges | ₹30.00 | ₹3.00 | ₹27.00 | ₹1.35 |

**B02** (flat ₹73.07, GST ₹68.85). This reproduces Caffeza's own split exactly.

| Line | Line total | Discount share | Line net sales | GST share |
|---|---|---|---|---|
| Indian Platters | ₹450.00 | ₹22.68 | ₹427.32 | ₹21.37 |
| Chilli Garlic Noodle Bowl | ₹400.00 | ₹20.16 | ₹379.84 | ₹18.99 |
| Mocha Flower | ₹280.00 | ₹14.11 | ₹265.89 | ₹13.29 |
| Roasted Papad | ₹80.00 | ₹4.03 | ₹75.97 | ₹3.80 |
| Laccha Tawa Paratha | ₹80.00 | ₹4.03 | ₹75.97 | ₹3.80 |
| Roasted Papad | ₹80.00 | ₹4.03 | ₹75.97 | ₹3.80 |
| Roasted Papad | ₹80.00 | ₹4.03 | ₹75.97 | ₹3.80 |

**B08** (flat ₹200.00, 0% GST)

| Line | Line total | Discount share | Line net sales | GST share |
|---|---|---|---|---|
| Ferrero Hazelnut Shake | ₹330.00 | ₹130.69 | ₹199.31 | ₹0.00 |
| Masala Pav Sandwich | ₹175.00 | ₹69.31 | ₹105.69 | ₹0.00 |

**B14** (flat ₹13.83, GST ₹26.31)

| Line | Line total | Discount share | Line net sales | GST share |
|---|---|---|---|---|
| Cheesy Tornado | ₹360.00 | ₹9.22 | ₹350.78 | ₹17.54 |
| Sev Poori | ₹180.00 | ₹4.61 | ₹175.39 | ₹8.77 |

**B16** (flat ₹39.00, GST ₹37.05)

| Line | Line total | Discount share | Line net sales | GST share |
|---|---|---|---|---|
| Mumbaiya Pav Bhaji Platter | ₹450.00 | ₹22.50 | ₹427.50 | ₹21.38 |
| Ferrero Hazelnut Shake | ₹330.00 | ₹16.50 | ₹313.50 | ₹15.67 |

On a bill with no discount, each line's GST share is its line total times the rate, with the same largest remainder rule for any leftover paisa.

---

## 4. Expected results for business date 26 September

**R2 Day Close, Section A: Sales**

| Line | Expected |
|---|---|
| Bills | 15 |
| Covers | 27 |
| Item total | ₹9,310.22 |
| Discount | ₹423.90 |
| Net sales | ₹8,886.32 |
| CGST | ₹191.31 |
| SGST | ₹191.26 |
| GST | ₹382.57 |
| Round-off | ₹0.11 |
| Bill total | ₹9,269.00 |
| Average bill | ₹592.42 |
| Average per cover | ₹267.09 |

Averages are rounded half away from zero to the paisa, the same rule as `server/utils/money.js`.

**Section B: Where the bill total went**

| Line | Expected |
|---|---|
| Cash | ₹1,754.00 |
| Card | ₹1,481.00 |
| UPI | ₹1,472.00 |
| Money in hand | ₹4,707.00 |
| Zomato Gold | ₹1,998.00 |
| Dineout | ₹778.00 |
| EazyDiner | ₹0.00 |
| Zomato | ₹305.00 |
| Swiggy | ₹930.00 |
| Platform money | ₹4,011.00 |
| On Hold: E-210 Office | ₹47.00 |
| On Hold: W-330 Office | ₹504.00 |
| Unpaid | ₹0.00 |
| Total | ₹9,269.00, equal to the bill total |

**Section D: Cash drawer**

| Line | Expected |
|---|---|
| Opening float | ₹2,000.00 |
| Cash from bills | ₹1,754.00 |
| Cash collections | ₹0.00 |
| Paid in | ₹0.00 |
| Paid out | ₹350.00 |
| Expected cash | ₹3,404.00 |
| Counted cash | ₹3,400.00 |
| Cash difference | −₹4.00, raising the C9 warning |

**Section E: By order type**

| Order type | Bills | Covers | Net sales | Bill total |
|---|---|---|---|---|
| Dine-in | 12 | 27 | ₹7,211.32 | ₹7,572.00 |
| Delivery, Swiggy | 1 | 0 | ₹930.00 | ₹930.00 |
| Delivery, Zomato | 1 | 0 | ₹305.00 | ₹305.00 |
| Takeaway | 1 | 0 | ₹440.00 | ₹462.00 |
| Total | 15 | 27 | ₹8,886.32 | ₹9,269.00 |

Average table time, whole minutes from order opened to bill paid, on paid dine-in bills only (P16):
Khuman Singh 60.5 minutes from 4 bills, Budha Singh 59.0 from 3, Devendra Singh 53.0 from 3.
Ranjeet Paswan has none, because both his bills are On Hold. Counter has none, because none of their bills are dine-in.

**R13 Tables and Table Time** (P16)

| Table | Bills | Table time |
|---|---|---|
| Table 5 | 1 | 56 min |
| Table 7 | 1 | 57 min |
| Table 12 | 1 | 59 min |
| Table 2 | 1 | 38 min |
| Table 3 | 1 | 49 min |
| Table 14 | 1 | 53 min |
| Table 16 | 1 | 55 min |
| Table 11 | 1 | 74 min |
| Table 4 | 1 | 71 min |
| Table 18 | 1 | 66 min |
| Table 30 | 1 | none, On Hold |
| Table 35 | 1 | none, On Hold |
| Total | 12 | 578 min over 10 paid bills, average 57.8 |

Table 16 counts B12 only; the voided B11 on the same table is left out. Turns per day for every table is 1.00, and 12.00 in total.

**R11 items cancelled.** Cheesy Tornado shows 1 cancelled with ₹0.00 wasted, under Pizza. Thecha Paneer Chilli shows 1 cancelled with ₹390.00 wasted, under Cafezza Mains, and 0 sold. **R12 items cancelled:** Khuman Singh, 2 items, ₹750.00.

**R14 Discounts** (P17)

| Discount reason | Bills | Discount |
|---|---|---|
| Zomato Gold | 2 | ₹86.90 |
| Dineout | 1 | ₹39.00 |
| Regular guest | 1 | ₹53.00 |
| Staff or office | 1 | ₹45.00 |
| Merchant promo | 1 | ₹200.00 |
| Total | 6 | ₹423.90, equal to R2's discount |

Percent off: B01 10.00%, B02 5.04%, B08 39.60%, B09 50.00%, B14 2.56%, B16 5.00%. All six were applied by Manager.

**R15 Cancellations and Voids** (P17)

| Item | Line total | Stage | Cancel reason | Cancelled by |
|---|---|---|---|---|
| Thecha Paneer Chilli | ₹390.00 | Cancelled after preparation | Guest changed the order | Khuman Singh |
| Cheesy Tornado | ₹360.00 | Cancelled before preparation | Wrong item entered | Khuman Singh |

Wasted value ₹390.00. Voids: CFA/C/22452, ₹347.00, Billed to the wrong table, by Manager. No whole order is cancelled.

**R16 No Charge:** Table 29, College Sandwich, ₹230.00 before GST, Corporate office order, opened by Ranjeet Paswan, approved by Manager.
**R17 On Hold:** as of 26 September, E-210 Office ₹47.00 and W-330 Office ₹504.00. As of 27 September, after section 5's collection, W-330 Office ₹0.00 and E-210 Office ₹47.00, oldest unpaid bill 26 September, 1 day.
**M8 summary:** Manager voided ₹347.00 on 1 bill, applied ₹423.90 of discounts on 6 bills, and approved ₹230.00 of No Charge on 1 order.

**Section F: GST by rate**

| Rate | Net sales | CGST | SGST | GST |
|---|---|---|---|---|
| 5% | ₹7,651.32 | ₹191.31 | ₹191.26 | ₹382.57 |
| 0%, paid by platform | ₹1,235.00 | ₹0.00 | ₹0.00 | ₹0.00 |
| Total | ₹8,886.32 | ₹191.31 | ₹191.26 | ₹382.57 |

**Section G: Controls**

| Line | Expected |
|---|---|
| Discounts | 6, total ₹423.90. Largest three: B08 ₹200.00, B02 ₹73.07, B01 ₹53.00. |
| No Charge | 1, value ₹230.00 |
| Items cancelled | 2, value ₹750.00, wasted value ₹390.00 |
| Orders cancelled | 0 |
| Voided bills | 1, B11, ₹347.00, "Billed to the wrong table" |

**Section H: Invoices**

| Line | Expected |
|---|---|
| First | CFA/C/22442 |
| Last | CFA/C/22457 |
| Issued | 16 |
| Voided | 1 |
| Gaps | 0 |

**R11 Menu Performance, by category**

| Category | Quantity | Item total | Discount | Net sales | GST | Share of net sales |
|---|---|---|---|---|---|---|
| Pizza | 5 | ₹1,810.00 | ₹9.22 | ₹1,800.78 | ₹71.04 | 20.26% |
| Cafezza Mains | 4 | ₹1,700.00 | ₹45.18 | ₹1,654.82 | ₹82.75 | 18.62% |
| Italian Coffees | 6 | ₹1,380.00 | ₹14.11 | ₹1,365.89 | ₹57.29 | 15.37% |
| Deconstructed Bowls | 3 | ₹1,200.00 | ₹20.16 | ₹1,179.84 | ₹58.99 | 13.28% |
| Cafezza Shakes | 4 | ₹1,320.00 | ₹147.19 | ₹1,172.81 | ₹32.17 | 13.20% |
| Pasta | 1 | ₹430.00 | ₹0.00 | ₹430.00 | ₹21.50 | 4.84% |
| Accompaniments | 5 | ₹400.00 | ₹16.12 | ₹383.88 | ₹19.20 | 4.32% |
| Bhel 2.0 | 2 | ₹360.00 | ₹22.61 | ₹337.39 | ₹16.87 | 3.80% |
| Dessert | 1 | ₹320.00 | ₹32.00 | ₹288.00 | ₹14.40 | 3.24% |
| Sandwiches & Wraps | 1 | ₹175.00 | ₹69.31 | ₹105.69 | ₹0.00 | 1.19% |
| Cold Beverages | 2 | ₹95.22 | ₹0.00 | ₹95.22 | ₹4.76 | 1.07% |
| Assorted Teas | 1 | ₹90.00 | ₹45.00 | ₹45.00 | ₹2.25 | 0.51% |
| Extras | 1 | ₹30.00 | ₹3.00 | ₹27.00 | ₹1.35 | 0.30% |
| Total | 36 | ₹9,310.22 | ₹423.90 | ₹8,886.32 | ₹382.57 | 100.00% |

The voided B11 is left out, so Pizza counts the Piri Piri Paneer Pizza once, from B12.
The two cancelled items are left out, and show only in R15.
The shares are rounded for display. They are computed from paise, not from the rounded percentages.

**R12 Captains**

| Captain | Bills | Covers | Net sales | Bill total |
|---|---|---|---|---|
| Khuman Singh | 4 | 11 | ₹2,604.61 | ₹2,735.00 |
| Budha Singh | 3 | 7 | ₹2,660.71 | ₹2,793.00 |
| Devendra Singh | 3 | 6 | ₹1,421.00 | ₹1,493.00 |
| Ranjeet Paswan | 2 | 3 | ₹525.00 | ₹551.00 |
| Counter | 3 | 0 | ₹1,675.00 | ₹1,697.00 |
| Total | 15 | 27 | ₹8,886.32 | ₹9,269.00 |

**Checks:** C1 to C8, C10, C11 and C12 pass. C9 raises one warning, for the ₹4.00 cash difference. C11 checks live payout batches, and the golden day records none; R6 lists every platform payment as "rate not set" until commission rates are configured.

---

## 5. Second scenario: the next day

For collection and open-day tests.
Business date `2026-09-27`.

| Event | Time | Effect |
|---|---|---|
| W-330 Office pays ₹504.00 in cash | 1:15 PM | A cash collection on 27 September. Not a sale on 27 September. |
| One dine-in bill of ₹420.00 is issued and not yet paid | 5:00 PM | The day is still open |

Expected at 5:00 PM on 27 September:
R2 shows a "still open" banner.
Unpaid is ₹420.00, and C3 still balances because unpaid is part of the equation.
Day Close refuses to run while any bill is unpaid.
R17 shows E-210 Office owing ₹47.00 and W-330 Office owing ₹0.00.
Cash collections for 27 September are ₹504.00.

---

## 6. Breaking the rules on purpose

For each check, change exactly one thing in the golden day, and exactly that check must fail.

| Check | Change | Must fail with |
|---|---|---|
| C1 | Set B03's round-off to +60 paise | C1 on B03 |
| C2 | Move 1 paisa of B02's discount share from Indian Platters to nowhere | C2 on B02 |
| C3 | Delete B04's payment but keep its status PAID | C3 on 26 September, and C4 on B04 |
| C4 | Mark B09 as PAID with no payment | C4 on B09 |
| C5 | Run the category grouping with the Pizza group left out, to simulate a faulty query | C5 categories, ₹1,800.78 missing |
| C6 | Delete B11 from the register instead of voiding it | C6, number CFA/C/22452 missing |
| C7 | Add B13's cancelled Thecha Paneer Chilli as a line on B13 | C7 on B13 |
| C8 | Store B14's business date as `2026-09-27` | C8 on B14 |
| C9 | Feed the check an expected cash that leaves out the paid out | C9 as an ERROR |
| C10 | Add a collection of ₹600.00 to W-330 Office | C10 warning, negative balance |
| C12 | Close the day, then change B06's bill total | C12 on 26 September |
