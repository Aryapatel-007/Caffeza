# P48 PetPooja's way: the floor, Recall, change for the cashier, typed extras, the counter screen, and a test site

**Asked for by:** Rishi, 2026-10-14, with PetPooja's Table View and Billing screens and its Recall Bill feature, which Z Chaat's staff know. "The interface should be too much simple, a 1-2 step process." Answers to the questions asked: a separate test site; add-ons both from the menu and typed at the table; Recall on a table shows only; the three-column order screen on the counter computer only.
**Modules:** M2, M3, M10, M18, M20.
**Depends on:** P19 (the floor), P25 Part F (cash counts), P36 (one ticket per order), P46 (open item).

## A. A new KOT for every Send

Z Chaat's `kitchen.oneTicketPerOrder` is switched off (done 2026-10-14, as the owner): every Send makes its own KOT, as on PetPooja. No code.

## B. The kitchen screen fits more

Tickets are narrower and denser, so a full service fits one screen: four across from 1024 px, five from 1280, six from 1536; smaller padding; the dish name stays one line where it can (P41).

## C. Change for the cashier

When Cash is picked, the panel shows **Guest gave** with one-tap notes, ₹100, ₹200, ₹500, ₹2,000, and **Exact**, plus a box to type any amount. Then, in large type: **Give back ₹X**, and the notes and coins to hand back. A tap that is less than the bill says "₹Y short". The payment records the bill amount; what was given and the change are kept as P25's `tender`, worked out on the server as before.

## D. The floor, as PetPooja's Table View

Each section is a grid of small square tiles (the table's name only), coloured by state with a legend at the top: **Blank** (free), **Running KOT** (food with the kitchen), **Running** (served), **Printed** (bill printed). Under a busy tile: 🖨 opens its bill to print (or makes it when there is none and the order is ready), and 👁 opens its history (F). **Take Away** and **Delivery** at the top right. Tapping a tile opens the table as today. The billing strip and long-open marker stay.

## E. Recall Bill

A **Bill No** box in the top bar, for the till roles (owner, manager, cashier): type the number (the digits after the series, e.g. 12) and the bill opens. There, as today: **Print** (a duplicate), **Change payment mode** (P08's payment correction, owner or manager), **Cancel the bill** (void, with its reason; a cashier with the manager's PIN, P28). The server: `GET /bills?number=12` lists the bills whose sequence is 12, newest first.

## F. Table history (👁)

A sheet listing what the table has had today: each order and, for each of its sends, the KOT time, who sent it, the dishes and quantities, dishes cancelled and why, and the bill's number and status. Read-only: nothing on it adds to the current order or sends a KOT. The server: `GET /tables/:tableId/history`, which attaches the people's names, the KOT numbers and the bill.

## G. Typed extras

On any dish's sheet, **+ Extra** adds a typed extra: a name (1 to 40 characters) and a price (more than 0), up to 5 per line, beside the menu's own add-ons. They go on the line's `addOns` with `addOnId: null` and are taxed at the dish's rate, as every add-on is. A line request gains `extras: [{ name, priceInPaise }]`; a guest's request with extras is refused.

## H. The counter screen

On the counter computer (1024 px and wider, till roles), an order opens in three columns, as PetPooja's billing: **categories** on the left, **dishes** in the middle with search, and **the order** on the right: its lines, item total, and the actions **KOT** (send), **KOT & Print**, **Save & Print** (bill and print). Phones and tablets keep today's layout.

## I. A test site

A second copy of the app at its own address, with its own database (`restaurant-erp-test` on the same Atlas cluster), its own server on Render and screens on Vercel, and a copy of Z Chaat's menu, tables and logins. Nothing there touches a real bill. The steps are in DEPLOYMENT.md.

## Tests

`GET /bills?number=`; typed extras on a line, the KOT and the bill, at the dish's rate, refused for a guest; the change panel; the floor's legend and icons; the table history; the counter screen's KOT and Save & Print. The golden day passes.
