# P56 A note for every dish, the guest's details before the first KOT, and only whole voids in the void lists

**Asked for by:** Rishi, 2026-10-15: "add the option of adding the special note while ordering the food items for the situation when all the food items has the same instructions and also shift the customer details taking before the pushing the first kot and in the cancellation and void bill only it should come when whole order is cancel only whole bill should be cancel/void".
His answers, the same day: one note for the order, printed at the top of every KOT; the guest's details optional, with Skip; the void lists and the cancellations report show only a bill or order cancelled as a whole, and an item cancelled after billing is an item change, not a voided bill.
**Modules:** M2, M3, M18, M19, M22.
**Depends on:** P27 (customers), P36 (one kitchen ticket per table), P50.

## A. A note for every dish

A table often wants the same thing for everything: "less spicy", "Jain". Typing it on each dish is slow and easy to miss on one.

1. An order carries one **kitchen note** (`orders.kitchenNote`, up to 200 characters, or none).
2. `PATCH /orders/:orderId/kitchen-note` with `{ version, kitchenNote }` sets or clears it. Owner, manager, cashier and captain. Only while the order is open or waiting for the cashier. A stale version is 409. Not audited: it is an instruction to the kitchen, not money.
3. The order's kitchen tickets carry it too (`kots.kitchenNote`): written when a ticket is made or a round is added, and written onto every ticket of the order when the note changes, so the kitchen sees the latest note even on dishes already sent.
4. The printed KOT prints it under the table line: `FOR ALL ITEMS: Less spicy`, wrapped. The kitchen screen shows it at the top of the ticket, above the dishes.
5. The order screen has **Note for all dishes** beside Send: a sheet with the same one-tap requests as a dish (Less spicy, Extra spicy, No onion, Jain, Less sugar, No ice) and a box, Save and Clear. The note shows under the order's title while set.

## B. The guest's details before the first KOT

P27 asked for the guest's name, mobile and their yes to offers when the table is seated. The captain is busy then; the moment the order goes in is the better one.

1. Seating a table asks only how many guests.
2. On a dine-in order, the first Send to kitchen (or KOT & Print) opens **Guest details**: name, mobile, and the offers tick, all optional, with **Save and send** and **Skip, send without details**. It is asked only while nothing has ever been sent from the order and the order has no name or mobile yet; a booking seated with its guest's details never asks. Skip is remembered for this visit to the screen.
3. `PATCH /orders/:orderId/customer` with `{ version, customerName?, customerPhone?, offersConsent? }` sets them. Owner, manager, cashier and captain. Only while the order is open and has no bill. A mobile, once on the order, is not replaced by another (422); the same one again changes nothing. Setting a mobile for the first time records the visit and the consent exactly as opening an order with one does (P27). `offersConsent` needs a mobile.
4. Takeaway and delivery already take the guest's details when the order is started, before its first KOT, and are unchanged. `POST /orders` still accepts the details, for them and for anything else that opens an order.

## C. Only whole voids in the void lists

An item cancelled on a paid bill (P25), or dishes added after billing (P26), voids the bill and bills again in the same visit. Today that bill shows in every list of voided bills, and the cancelled item shows again under items cancelled, so one cancelled dish reads as a voided bill.

1. A bill voided by those two paths is marked `bills.isVoidedToChangeItems: true`. A void a person chose (Void on the bill screen, a whole order cancelled with its bill, a platform cancellation) is not.
2. These leave marked bills out: the bills list's voided view and its Voided count (`GET /bills`), R19 Bill List with status Voided, R15's Bills voided, R1 Today's void alerts, R2's and Day Close's Voided bills (so the owner's dashboard too), and the GST report's Not sales line.
3. These keep every voided bill, because the law or the arithmetic needs every number: the invoice register (R10, and the invoice series on R2), the GST report's Documents issued, every reconciliation check, and finding a bill by its number (P48's Bill No).
4. The item itself still shows in R15's Items cancelled, which is where item changes belong.
5. Bills voided before this change are not marked, and keep showing. A closed day therefore never changes, and C12 stays green.

## D. No single-item cancels on the cancellation reports

Rishi, later the same day, on R15's Items cancelled: "no need of showing this item cancelled too". Asked what else, he chose all three: R15's summaries and wasted value, R15's Bills changed before payment, and the item lines on Day Close and the owner's dashboard.

1. R15 Cancellations and Voids keeps Orders cancelled, Bills voided and Bills paid before printing. The Items cancelled and Bills changed before payment sections are gone. By reason, By person, By item and the Wasted value headline count only the dishes of orders cancelled as a whole. The orders section is the paged one.
2. R2's controls, the Day Close screen, the Day End page and the printed Day Close no longer show Items cancelled, Wasted value or Bills changed before payment. The owner's dashboard watch list loses Cancelled after preparation with them, and gains Orders cancelled. The Day End page's Cancelled items card becomes Orders cancelled.
3. Nothing stored changes. `computeDayFigures` still works out `cancelledItems` and `billRevisions`, so a closed day's snapshot, C12 and every other check are untouched, and the records are still there to read: each order shows its cancelled dishes, the audit trail keeps every cancel after preparation, and R11 and R12 keep their cancelled columns.


1. A captain sets the note; the order and its ticket carry it; a round added later carries it; changing it reaches the ticket already sent; the printed KOT prints `FOR ALL ITEMS:`. Refused on a billed or cancelled order, a stale version, the kitchen login and another restaurant.
2. A captain seats a table with no details and sets them before the first Send: the order has them, the customer has one visit and the consent. The same mobile again records no second visit; another mobile is refused; refused with a bill.
3. A cashier cancels an item on a paid bill: the voided bill is marked, and is missing from the bills list's voided view and count, R19 Voided, R15's voids, R1's alerts and R2's Voided bills, while the invoice register and R15's items still show it. A manager's own Void shows everywhere as before. Dropping the mark from R15's query on purpose fails the test.
4. R15 on the golden day has no items or bill changes sections, wasted value ₹0.00, and its void; R2's controls have no Items cancelled, Wasted value or Bills changed line; `computeDayFigures` still has `cancelledItems`.
5. Browser: a captain on a phone seats a table with only guests, adds two dishes and a note for all dishes, taps Send, gives the guest's details, and the kitchen ticket shows the note; the owner finds the guest on Customers. Every other browser spec skips the details sheet.
