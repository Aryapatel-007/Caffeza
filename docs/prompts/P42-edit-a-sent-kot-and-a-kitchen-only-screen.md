# P42 Changing a dish after it is sent, and the kitchen login sees only tickets

**Asked for by:** Rishi, 2026-10-13: "except the kitchen login give the option to all to edit the kot like let say they send to kitchen then guest said i dont want this add this ... understand the real scenario and also make sure in the kitchen just the kot remove other things only kot should be displayed". Answers to the questions asked: remove, lower the quantity, swap and change the note; a PIN only once the dish is cooked; nothing printed, the screen shows it; the kitchen login sees the ticket board only.
**Modules:** M2 (orders), M18 (kitchen), M20 (the shell).
**Depends on:** P28 (approvals), P29 (bills own their lines), P36 (one ticket per order), P41 (undo after Send).

## The real scenario

A table has been sent: 3 Pani Puri, a Paneer Tikka "less spicy", a Masala Chaas. Then the guest:
1. "I don't want the chaas." Remove it.
2. "Make it 2 Pani Puri, not 3." Lower the quantity.
3. "Not paneer tikka, give me veg manchurian." Swap it.
4. "Make the tikka no onion too." Change the note.

Anyone taking orders (OWNER, MANAGER, CASHIER, WAITER, never KITCHEN) does each from the order screen, on the sent dish's **Change** button. The kitchen sees it on its screen at once: the dish struck through as "Cancelled, do not make", or marked **Changed** with its new quantity or note. Nothing extra prints.

## When a PIN is asked

A sent dish the kitchen has **not** marked ready (`FIRED`) changes with no PIN and no questions: the reason is "Guest changed the order" and it counts as not made, so its stock comes back. A kitchen sometimes cooks a dish before ticking it, so the sheet has "Already made by the kitchen" to tick; ticked, it is treated as cooked. A dish the kitchen **has** marked ready (`READY` or `SERVED`), or one ticked as already made, is cooked: removing it or lowering its quantity asks for a reason and, for a cashier or captain, the manager's PIN while `approvals.lineCancel` is on, exactly as cancelling does today, and counts as made. A cooked dish's note cannot change.

This narrows `approvals.lineCancel` from "the kitchen has it" to "the kitchen has made it", at the owner's word.

A table with a bill still changes only through the bill (P29); none of this applies there.

## Server

1. **Remove** is 12.6's cancel. The approval is needed only for a `READY` or `SERVED` line.
2. **Lower the quantity**: `POST /orders/:orderId/lines/:lineId/reduce`. The line keeps the new quantity; the difference becomes its own cancelled line (same snapshot, the same kitchen ticket), cancelled through the existing line cancel so the reason, the audit and the reports work as for any cancel. Only the difference's stock comes back. The kitchen ticket line shows the new quantity, marked changed, and a cancelled line for the difference.
3. **Swap** is a remove followed by adding the new dish and sending it, as the screen already does. No new endpoint.
4. **Change the note**: 12.5's edit takes `notes` on a `FIRED` line too (not its quantity). The kitchen ticket line gets the new note, marked changed.
5. Kitchen ticket lines gain `changedAt`.
6. A line's stock return now gives back what is still out for it, so lowering a quantity and later removing the rest never returns more than was taken.

## Screens

1. Order screen: every sent dish has **Change** in place of Cancel line. The sheet has the quantity (down to 1), the note, **Save**, **Remove dish** and **Swap for another dish**. Swap removes the dish and opens the menu with "Pick the replacement for Paneer Tikka". For a cooked dish the sheet says so and asks the reason and the PIN.
2. Kitchen: a changed line shows a **Changed** chip.
3. The KITCHEN login sees only the kitchen board: no rail, no bottom bar, no Home. Any other address opens the board, and the top bar has only the restaurant, the person and Sign out. The station tabs and Recall stay. Availability goes; a manager marks dishes out of stock.

## Tests

Server: lowering 3 to 2 keeps the line at 2 and a cancelled line of 1, returns one unit's stock, and a later remove returns the rest exactly; lowering a cooked line needs the PIN for a captain and returns nothing; the note on a sent line changes on the order and the ticket; a captain removes a sent, not-ready dish with no PIN; a cooked one still needs it; the kitchen login is refused all of it. Breaking the stock rule on purpose fails a test. Browser: a captain changes, removes and swaps sent dishes; the kitchen sees Changed and Cancelled; the kitchen login has no navigation.
