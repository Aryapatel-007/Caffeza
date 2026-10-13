# P41 Kitchen text on one line, Recall, Undo after Send, and the floor as tiles

**Asked for by:** Rishi, 2026-10-13: "in the kitchen keep the text small so all the name of the food items comes in one line and also there should be option of the recall just like the pet pooja and once the food items are sent to the kitchen there should option undo and remove the plan in the floor option".
**Modules:** M18 (kitchen), M2 (orders), M20 (floor).
**Depends on:** P29 Part E (undo ready), P36 (one ticket per order), P38 (the ready switch), P19 (the floor plan).

## A. Dish names on one line

On a kitchen ticket the dish name is smaller and narrower (`ticket-item` 15 / 20 at 88% width instead of 18 / 24 at 92%), and the Cooking / Ready switch is compact, its word under the knob, so the name has the row's width. The kitchen board shows three tickets across from 1024 px wide and four from 1536. Together these put Z Chaat's names, up to 30 characters, on one line. A name too long even then wraps: it is never cut off, because a cook must read all of it. The quantity shrinks with it. Add-ons and notes stay as they are. DESIGN-SYSTEM 13c rule 7 gains this exception.

## B. Recall

The kitchen screen gets a **Recall** button in its header, as on PetPooja's kitchen display. It opens a sheet of the tickets finished in the last 60 minutes, newest first, for the chosen station or every station, each with its KOT number, table, items and the time it was finished, and a **Recall** button. Recall puts the ticket's ready dishes back to Cooking through 13.5's existing undo-ready (the station's dishes only when a station is chosen), so it reappears on the board. A ticket whose table has been billed answers 13.5's `ORDER_ALREADY_BILLED`, shown in the sheet.

Recall replaces the "Just done" row (P29 Part E), which only remembered tickets finished on that one tablet in that browser tab. The ten-second Undo bar after a tick stays.

The server: `GET /kots` takes `sort=recent`, which sorts by when the ticket last changed, newest first, instead of oldest first. With `status=COMPLETED` that is the list of tickets just finished.

## C. Undo after Send

For 60 seconds after a Send to kitchen, the order screen shows **Undo** beside "Sent to the kitchen." Undo takes that Send back: its dishes come off the kitchen ticket (shown "Cancelled, do not make" where the ticket is on screen), stock deducted for them comes back, and they return to the order as not sent, with the same price, size, extras and note, so the captain can change them and send again.

It needs no reason and no PIN, because it is only allowed while nobody can have cooked anything: within 60 seconds of the Send, and only while the kitchen has marked none of those dishes ready. After that it is an ordinary cancel, with its reason and, for a sent dish, the manager's PIN where the approvals ask for one. It is not offered on an order with a bill: a bill's items change through the bill.

The server: `POST /orders/:orderId/undo-send`. Each dish of the last Send is cancelled through the existing line cancel, with the new reason `SENT_BY_MISTAKE` ("Sent to the kitchen by mistake") and `wasPrepared: false`, and a fresh unsent copy of it is added, in one transaction. The cancelled lines stay on the order as the record, as every cancel does; reports list them as cancelled before preparation. A copy has a new line id, so its next Send deducts stock again under a new key. `KOT_SEND_UNDONE` is audited, and a manager may read it.

## D. The floor as tiles

The floor shows every section as tiles. The Plan view and the Plan / Tiles switch are gone. The table positions saved in Arrange tables are kept, not deleted, and Arrange tables stays for the section order. Nothing changes on the server.

## Tests

Server: undo-send within the window puts the dishes back as unsent and cancels the kitchen lines; a second Send makes a new round with the copies; refused after 60 seconds, once a dish is ready, with a bill, and with nothing sent; stock comes back and is taken again on the next Send; another restaurant's order is 404. Breaking the time rule on purpose fails the test. `sort=recent` returns newest first. Browser: a captain sends and undoes; the kitchen recalls a finished ticket.
