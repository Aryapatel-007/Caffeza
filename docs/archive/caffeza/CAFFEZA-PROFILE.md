# Caffeza Profile

This file is the real setup of our first paying client.
It was taken from screenshots of their current POS, dated 26 and 27 September 2026.
Every Caffeza prompt reads this file before building anything.

`TO CONFIRM` means we have not seen the answer yet.
Build with the stated default, and make the value a setting so the answer can change without code.

Section 15 lists every open item in one place.

---

## 1. The business

| Field | Value | Where it lives in our system |
|---|---|---|
| Trade name | "Cafezza", as their current POS prints it. We also write it "Caffeza". `TO CONFIRM` the exact spelling for the bill. | `restaurants.name` |
| Tagline | "Be Caffeinated". `TO CONFIRM` whether it goes on the bill. | `settings.receipt.headerLine2` |
| Registered trademark | "CAFEZZA BE CAFFEINATED", a device mark: the logo itself is the brand. Everything staff or guests see says "Cafezza", as the trademark, the menu and the listings do. The spelling on the GST bill stays `TO CONFIRM` with the owner. Added by P22. | The logo, `restaurants.brandLogos`; the wordmark, `settings.appearance.wordmark` |
| Logo | The square logo, cream artwork on espresso brown, `docs/brand/cafezza-logo-square.png`, and the trimmed lockup made from it, `docs/brand/cafezza-lockup-dark.png`. No vector and no version for light grounds yet. `TO CONFIRM`. | `restaurants.brandLogos.darkGround` |
| Look | Logo brown `#4A2E2A`, logo cream `#F2D7BC`, accent `#49302D`, warm neutrals. Measured in P22, `docs/DESIGN-SYSTEM.md` section 15. | `settings.appearance` |
| City | Gandhinagar, Gujarat | `restaurants.address.city`, `state` |
| GSTIN | `24AARFT4546K1ZM` | `restaurants.gstin` |
| Legal name | `TO CONFIRM` | `restaurants.legalName`, set through `PATCH /restaurant` |
| FSSAI licence number | `TO CONFIRM`. It must print on every bill. | `restaurants.fssaiLicenseNumber` |
| Address and phone | `TO CONFIRM` | `restaurants.address` |

Why the legal name matters:
The GSTIN starts with state code 24, which is Gujarat.
Its 4th PAN character is `F`, which means the registration belongs to a firm, a partnership or an LLP.
A firm's legal name is often different from the name on the sign.
A GST invoice has to carry the registered name, so we need it before the first real bill.

---

## 2. Size and hours

| Fact | Value |
|---|---|
| First bills of the day | Around 11 AM |
| Last payments | Just after midnight. Two bills on 26 September were paid at 12:01 AM and 12:02 AM. |
| Business day | Starts at 5:00 AM. A bill paid at 12:30 AM belongs to the day before. This is our default, `businessDayStartsAtMinutes: 300`. |
| Busy day reference | Saturday 26 September 2026: 182 bills, 473 guests, bill total ₹2,07,179.00 |
| Dining areas | One, called "Cafe" |

---

## 3. Tax

| Rule | Detail |
|---|---|
| Rate | 5% on restaurant service, split as CGST 2.5% and SGST 2.5%. Every menu item is `taxRateBps: 500`. |
| Pricing | Menu prices are tax-exclusive. GST is added on top. This matches our `pricingMode: EXCLUSIVE`. |
| Items sold at MRP | A water bottle at ₹50 and a Fanta at ₹100 are stored as ₹47.61 and ₹95.23 before tax, so the bill lands on the MRP after round-off. Keep this. Real bill C22272 matches our code exactly because of it. |
| Delivery through Zomato or Swiggy | Billed at 0%. On these orders the platform pays the GST under section 9(5). Their Tally export shows them as "Sales 0%". `TO CONFIRM` with their CA. |
| Round-off | Every bill total is rounded to the nearest rupee |
| CGST and SGST split | Their system rounds CGST and SGST separately on each item, so the two halves are always equal. Ours rounds once per tax rate, and CGST takes the odd paisa. Final bill totals match. Tax can differ by one paisa on a discounted bill. `TO CONFIRM` which method their CA wants. |

---

## 4. Invoice numbers

| Fact | Value |
|---|---|
| Current format | `CFA/C/22262`. Prefix `CFA/C/`, then a running number with no financial year. |
| Also shown as | `C22262` in some of their reports and `22262` in others. Three spellings of one bill. |
| 26 September | First `CFA/C/22260`, last `CFA/C/22441`, 182 invoices, no gaps |
| 27 September | Started at `CFA/C/22442` |
| No Charge orders | Get no invoice number. Their system shows "Bill 0". |

The plan, `TO CONFIRM` with their CA:
Continue the same series mid-year.
Prefix `CFA/C/`.
Starting number is the last number the old system issues, plus one, written down on cutover day itself.
Switch to a financial year format on 1 April 2027.
Prompt P02 makes the prefix and starting number settings, so this answer can change without code.

---

## 5. Order types

| Their name | Ours | Bills on 26 September |
|---|---|---|
| Dine In | `DINE_IN` | 178 |
| Take Away | `TAKEAWAY` | 0 |
| Delivery | `DELIVERY`, added by M17 | 4, all Zomato or Swiggy |
| Counter Sale | Not built. Never used. | 0 |

---

## 6. Floor

One area, "Cafe".
Tables are named "Table 1" to "Table 35", with no Table 13.
That is 34 tables, which matches the "Cafe (34)" label on their screen.
The number of guests at each table is recorded.
Physical layout of the tables: `TO CONFIRM`.
The floor plan editor is ready for it (P19): Table setup › Arrange tables places each table on the section's 24 by 16 grid, with its size and shape.
`settings.floor.requireGuestCount` is on in `setup/caffeza.json`, so every table records its guests, as it does today.

---

## 7. People and roles

| Who | Their system | Ours |
|---|---|---|
| Ranjeet Paswan, Budha Singh, Ratandip, Khuman Singh, Devendra Singh | Captains. They open tables and take orders. | `WAITER` |
| "User Support" | A shared login used for delivery orders | A `CASHIER` login named "Counter". `TO CONFIRM` |
| "Live Kitchen", "Beverages" | Station logins. They also cancel items. | One `KITCHEN` login per station |
| Cashier | `TO CONFIRM` names | `CASHIER` |
| Owner and manager | `TO CONFIRM` names. Someone referred to as "Kathan sir" approves referral discounts in their remarks. | `OWNER`, `MANAGER` |

In our reports, "captain" means the person who opened the order, `orders.openedBy`.

---

## 8. Kitchen stations

Seen in their data: "Live Kitchen" and "Beverages".
`TO CONFIRM` the full list, and which categories go to which station.

Starting routing, until they confirm:

| Station | Categories |
|---|---|
| Beverages | Italian Coffees, Flavoured Coffee, Cafezza Shakes, Coolers Cafezza, Cold Beverages, Fresh Fruit Juices And Detox, Boba Teas, Iced Tea, Assorted Teas |
| Live Kitchen | Every other category |

Printed KOTs, screens, or both: `TO CONFIRM`.
Our server runs in the cloud, so it cannot reach a printer in the cafe.
Any printing happens from a device inside the cafe, through its browser.

---

## 9. Menu

Categories seen, in order of sales value on 26 and 27 September:

| Rank | Category | Items sold |
|---|---|---|
| 1 | Back To School | 168 |
| 2 | Dessert | 107 |
| 3 | Pasta | 70 |
| 4 | Pizza | 79 |
| 5 | Deconstructed Bowls | 59 |
| 6 | Cafezza Shakes | 64 |
| 7 | Italian Coffees | 76 |
| 8 | Cafezza Mains | 44 |
| 9 | Coolers Cafezza | 44 |
| 10 | Sandwiches & Wraps | 43 |
| 11 | Flavoured Coffee | 44 |
| 12 | Cold Beverages | 63 |
| 13 | Extras | 49 |
| 14 | Fresh Fruit Juices And Detox | 17 |
| 15 | Boba Teas | 12 |
| 16 | Smoothie Bowl | 8 |
| 17 | Salads | 7 |
| 18 | Iced Tea | 7 |
| 19 | Assorted Teas | 17 |
| 20 | Bhel - 2.0 | 3 |
| 21 | Accompaniments | 0 |
| 22 | Artisan Pasta | 0 |
| 23 | Asian Appetizer | 0 |

Their list continues below what the screenshot shows.
`TO CONFIRM` the full category list and the item count.

Items seen, with prices before tax:

| Item | Price | Item | Price |
|---|---|---|---|
| Sev Poori | ₹180 | Tiramisu Brownie | ₹320 |
| Indian Platters | ₹450 | Chilli Garlic Chimichurri Noodle Bowl | ₹400 |
| Mocha Flower | ₹280 | Roasted Papad | ₹80 |
| Laccha Tawa Paratha | ₹80 | Creamy Pesto Pasta | ₹430 |
| Half & Half Pizza | ₹380 | Mexican Bowl | ₹400 |
| Grilled Tofu Cream Cheese Avocado Focaccia Bagel | ₹320 | Lasagna Roll Ups with Truffle Cream | ₹360 |
| Korean Ramen Noodle Bowl | ₹400 | Passion Fruit Orange Mojito | ₹280 |
| Piri Piri Paneer Pizza | ₹330 | Chocolate Fondue | ₹350 |
| Ferrero Hazelnut Shake | ₹330 | Classic Cold Cafezza | ₹260 |
| Piri Piri Crinkle Fries | ₹240 | Cheesy Tornado | ₹360 |
| Mexican Nachos | ₹240 | Masala Pav Sandwich | ₹175 |
| Hot Chocolate | ₹250 | Caffe Latte | ₹220 |
| College Sandwich | ₹230 | Chole Kulcha Platter | ₹350 |
| Mumbaiya Pav Bhaji Platter | ₹450 | Thecha Paneer Chilli | ₹390 |
| Cafezza Sunday | ₹260 | Extra Pav | ₹60 |
| Water Bottle | ₹47.61, MRP ₹50 | Fanta | ₹95.23, MRP ₹100 |
| Extra Charges | ₹30 | | |

"Extra Charges" is a menu item they use for a small charge.
Keep it as a normal item.

Can their current system export the full menu to a spreadsheet: `TO CONFIRM`.
Prompt P11 imports it.

---

## 10. Payment methods

| Their name | Their Tally code | Our code | Kind | How the money reaches them |
|---|---|---|---|---|
| Cash | P01 | `CASH` | In hand | In the drawer |
| Credit Card | P02 | `CARD` | In hand | Card machine settles to the bank |
| UPI | 543 | `UPI` | In hand | Straight to the bank |
| Zomato Gold | 645 | `ZOMATO_GOLD` | Platform | Guest pays in the Zomato app at the table. Zomato pays out later. |
| Dine out | 654 | `DINEOUT` | Platform | Same, through the Dineout app |
| Easydiner | 821 | `EAZYDINER` | Platform | Same, through EazyDiner |
| zomato | 827 | `ZOMATO` | Platform | Delivery order paid inside Zomato |
| Swiggy | 868 | `SWIGGY` | Platform | Delivery order paid inside Swiggy |
| OnHold | P03 | Not a payment method | Account | The bill is charged to a named account and collected later. Built by M16. |

The Tally codes matter.
Their accountant's current Tally import uses them, and the Tally export in M19 must keep them.

Commission rate per platform: `TO CONFIRM`.
Whether "Dine out" means Swiggy Dineout: `TO CONFIRM`.

Money by method on 26 September:

| Method | Amount |
|---|---|
| Cash | ₹68,367.00 |
| Card | ₹27,384.00 |
| UPI | ₹88,473.00 |
| Zomato Gold | ₹7,664.00 |
| Dine out | ₹8,884.00 |
| Easydiner | ₹3,691.00 |
| zomato | ₹305.00 |
| Swiggy | ₹1,860.00 |
| Total received | ₹2,06,628.00 |
| On Hold | ₹551.00 |
| Received plus On Hold | ₹2,07,179.00, which equals the bill total |

---

## 11. Discounts they give

On 26 September they gave 21 discounts, worth ₹1,933.06 in total.

| Kind | How it works | Count |
|---|---|---|
| Platform discount on a dine-in bill | Zomato Gold, Dine out or EazyDiner. A fixed rupee amount, spread across the items. | 15 |
| Regular guest | 10% | 3 |
| Referral | 20%, with a remark naming who referred | 1 |
| Office guest | 50%, on an On Hold bill | 1 |
| Merchant promo on delivery | TAKE200, a flat ₹200, paid for by the restaurant | 1 |

Our current rule: a bill-level discount, flat or percent, with a reason, applied by an owner or manager only.

Their current discount names include guests' names and phone numbers.
Ours uses a fixed reason list instead, and the guest's name stays on the order.
Suggested reasons, `TO CONFIRM`: Zomato Gold, Dineout, EazyDiner, Regular guest, Referral, Staff or office, Merchant promo, Service recovery, Other with a note.

Open question, `TO CONFIRM`:
Platform discounts happen at the till, when a guest pays through the app.
If a cashier applies them today, our owner-and-manager-only rule would slow every such bill down.
One option is to let a cashier apply platform reasons only, with every other reason still needing a manager.

---

## 12. Exceptions

**Cancelled items**
Their reasons: "Modification" and "Wrong Item".
Their remark also shows whether the kitchen had finished the item, which is our `wasPrepared` flag.
Items were cancelled by captains and by station logins.
23 items were cancelled on 26 and 27 September.

**No Charge**
One order on 26 September.
Table 29, one College Sandwich, ₹230 before tax.
Reason: an order for their corporate office.
It got no invoice number.
Their reports show it as ₹242 in one place and ₹230 in another. One includes tax and one does not, and neither says which.

**On Hold**
Two bills on 26 September, ₹551 in total.
₹47 from Table 35, marked "E-210 Office".
₹504 from Table 30, marked "W-330 Office".
These look like nearby offices that run a tab and pay later.
The outstanding balance of every account on cutover day: `TO CONFIRM`. It becomes the opening balance in M16.

---

## 13. Reports they use today, and what goes wrong in them

Their report list includes: Sales Summary by Category, by Category and Subcategory, by Subcategory and Item, by Item, Sales Return by Item, by Item List, by Shift or Date, Item Specials, Item Group, Passing Desk, by Table Group, Cancellation Detail by Item, Service Charge, Sales Summary Details, Sales Summary Overview, Order Type, Discount Overview, Discount Detail, by Captain, On Hold Payment Received, No Charge Orders, Wallet Summary, Cancelled Orders, Shift Till, Sales by Date and Daily Sales Summary.
Two of them are marked "To-Do" in their own menu.

Errors we found in their reports:

1. **One bill, three times.** Invoice 22266 shows 06:35 AM in Discount Overview, 07:19 AM in Discount Detail and 12:05 PM in Sales Summary. 06:35 AM is exactly 5 hours 30 minutes before 12:05 PM, so one report shows UTC as if it were India time.
2. **One label, two meanings.** "Order Amount" for invoice 22266 is ₹501.00 in one report, which is after discount, and ₹530.00 in another, which is before.
3. **Totals that disagree.** For 26 and 27 September, Sales by Date says ₹2,89,029 and Sales by Captain says ₹2,72,637, a gap of ₹16,392 with no explanation. Wallet totals differ by ₹239 between the same two reports.
4. **Cancellations split across reports.** "Cancelled Order By Date" says "No Data Found" for days with 23 cancelled items, because cancelled items live in a different report.
5. **The cash drawer is not counted.** "Shift Till" is empty, so nothing in the system checks the cash.

Their "APC" is the total before tax divided by all guests, including delivery.
Ours is dine-in net sales divided by dine-in guests, so the two numbers will not match exactly.
`docs/GLOSSARY.md` explains it.

---

## 14. Reference day: 26 September 2026

Their own figures, for comparing against ours during the parallel run.

| Measure | Their label | Value |
|---|---|---|
| Item total | Sub Total | ₹1,99,328.77 |
| Discount | Discount | ₹1,933.06 |
| Net sales | Taxable, or Amount | ₹1,97,395.71 |
| Net sales at 0% | Sales 0% Taxable | ₹2,165.00 |
| Net sales at 5% | Sales 5% Taxable | ₹1,95,230.71 |
| CGST | CGST 2.5% | ₹4,880.83 |
| SGST | SGST 2.5% | ₹4,880.83 |
| Round-off | Round Off | ₹21.63 |
| Bill total | Sales, or Final | ₹2,07,179.00 |
| Bills | Total Invoice | 182 |
| Guests | Occupancy | 473 |
| Dine-in bills and guests | Order Type, Dine In | 178 bills, 469 guests |
| Delivery bills | Order Type, Delivery | 4 bills, ₹2,165.00 |
| On Hold | On Hold | 2 bills, ₹551.00 |
| No Charge | No Charge | 1 order |

---

## 15. Everything still to confirm

**From Caffeza**

1. Exact trade name spelling, legal name, address, phone and FSSAI number.
2. Full category list, full item list, and whether the menu can be exported to a spreadsheet.
3. Full list of kitchen stations and which categories go to each.
4. Printed KOTs, kitchen screens, or both.
5. Printer models, and whether each is USB or network.
6. Names and phone numbers of the owner, manager, cashiers and captains.
7. Commission rate per platform, and whether "Dine out" means Swiggy Dineout.
8. Who applies platform discounts at the till today.
9. Outstanding balance of every On Hold account on cutover day.
10. The physical table layout.
11. Whether they want inventory or attendance at launch. Both are built, and both are switched off by default.
12. The logo as a vector file, and a transparent version with brown artwork for light grounds. Until then, day screens show the cream logo on a brown plate. A vector is converted to PNG before upload; SVG is refused.
13. The spelling of the trade name on the GST bill: "Cafezza", as the trademark, or as their current POS prints it.

**From their CA**

1. CGST and SGST: one rounding per tax rate, or each half rounded per item as today.
2. Continue the `CFA/C/` series, or start a new one.
3. Confirm 0% on platform delivery orders under section 9(5). Built in P06 as a setting, `settings.delivery.platformCollectsGst`, defaulting to 0% on platform orders.
4. How No Charge orders should be recorded.
5. Whether the tagline and legal name layout on the bill is acceptable.
