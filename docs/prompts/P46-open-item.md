# P46 Open item: a dish whose name and price are typed when ordering

**Asked for by:** Rishi, 2026-10-14: "in the menu add the open item where name and the price will entered by the staff". Answers to the questions asked: everyone who takes orders may add one, with no PIN; Z Chaat gets one "Open item" at 5% GST in a category that goes to the main kitchen.
**Modules:** M1 (menu), M2 (orders), M3 (bills), M19 (R11).
**Depends on:** P03 (frozen lines), P35 (one row per dish on the bill), P41 and P42 (copies of a line).

## The rule

The owner or manager ticks **Open item** on a dish in the Menu. Its category decides its kitchen station and its GST rate is the dish's own; its price on the menu is not used. When staff add it to an order (owner, manager, cashier or captain, no PIN), the dish's sheet asks **Name** (1 to 80 characters) and **Price** (rupees, more than 0), with the quantity and the note to chef as for any dish. The line freezes the typed name and price as its `itemName` and `unitPriceInPaise`, and `isOpenItem: true`. Everything after that (the kitchen ticket, the bill, GST, the reports) reads the frozen line as for any dish.

An open item takes no sizes or extras. It never appears on the guests' online page, cannot be ordered there, and is not offered for Swiggy or Zomato item mapping.

On the bill each typed name is its own row (P35 already keys a row on name and price). R11 by item shows each open item under its typed name, not under the menu's placeholder.

## Server

1. `menuitems.isOpenItem`: Boolean, default false. Set with the item on `POST` and `PATCH /menu-items`.
2. A line request (12.1, 12.4) gains `openItem: { name, priceInPaise }`: required when the menu item is an open item, refused when it is not (422 "Type the dish's name and price." / "Only an open item takes a typed name and price."). `priceInPaise` an integer from 1 to the money ceiling. `variantId` and `addOnIds` are refused on an open item.
3. `orders.lines[].isOpenItem` and `bills.lines[].isOpenItem`: Boolean, default false, frozen. Undo after Send (P41) and lowering a sent line (P42) copy it.
4. The public menu and the public quote leave open items out; the item mapping lists and imports leave them out.
5. R11's item grouping adds the typed name for open items.

## Screens

The menu builder's item editor has **Open item** with its explanation; the price field says it is not used. On the order screen an open item's card reads **Type name and price** and opens the dish's sheet with Name and Price first; the stepper on the card never merges two open items.

## Z Chaat

One menu item, "Open item", 5% GST, in a category routed to the main kitchen, added as the owner through `POST /menu-items` after the deploy.

## Tests

An open item takes the typed name and price on the line and the bill, at the item's GST; without them, or with sizes or extras, it is refused; a normal dish refuses a typed name; two open items with different names stay two rows on the bill and in R11; the public menu leaves it out; the kitchen ticket shows the typed name. Breaking the freezing on purpose fails a test. Browser: a captain adds "Extra chutney" at ₹20 and it reaches the bill.
