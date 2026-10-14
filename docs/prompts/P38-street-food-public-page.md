# P38 The public page as a street-food signboard

**Asked for by:** Rishi, 2026-10-12, with Google Stitch mock-ups of a home page, a menu, the takeaway details, an order status, a booking and a booking ticket, mobile and desktop.
**Module:** M14 (the public page, `/r/:slug`). Client only.
**Depends on:** P24 (the public page as it was).

## What to build

Restyle the restaurant's public page, `client/src/features/public/`, in the look of the mock-ups: a hand-painted signboard in the restaurant's own brand colour, a cream page, chit-paper cards with a hard ink shadow, saffron for what is chosen, saffron festoons, rubber stamps for states, tear-off caledar dates and token tickets. Phone first; on a wide screen the menu has its sections on the left and the order as a paper bill on the right.

## Rules

1. **No new endpoint and no new field.** Everything on the page comes from `GET /public/:slug` and `/menu` as they are. The order and booking logic, the quote, the payment branch and the status polling stay exactly as P24 built them.
2. **Nothing the restaurant's records do not say.** The mock-ups invented an FSSAI licence number, reviews and a rating, a founding year, a second address, "desi ghee", "RO water", a "100% pure veg" claim, hours, dishes, a family-pack size, free packaging, catering contents and a barcode. None of it is built. The tagline is the restaurant's own page note (Settings, Online); the address, phone, hours and dishes are its own.
3. **Not the mock-ups' code.** They load Tailwind from a CDN, Google Fonts, Material Symbols and photos from Google's servers. The content security policy refuses all of it, fonts are served by us (2026-10-01), and only `DishPhoto` draws a dish. The look is rebuilt on our tokens.
4. **Colours are tokens.** Under `[data-public]` in `index.css`: `stall` and `on-stall` from the restaurant's `brandHex` and `onBrandHex` (the accent when it has none), and fixed `cream`, `chit`, `saffron`, `masala` and `leaf`. No raw colour in a component.
5. **Takeaway is paid at the counter; a booking takes ₹50 a person in advance, online.** Rishi, 2026-10-12: takeaway is paid when collected, by the QR code at the counter, card or cash; a table booking takes an advance of ₹50 a person, paid online when booking, like Zomato, and taken off the bill. Both are settings that already exist: `online.takeawayPrepay` off, `online.depositPerPersonInPaise` 5000, with Z Chaat's own Razorpay connected. The booking chit shows the advance plainly: the amount, ₹50 × people, paid online now, taken off the bill, refunded if not confirmed or cancelled in time, kept if cancelled late. Without a deposit it says no advance payment.
8. **The kitchen's ready is a switch.** Each dish on a ticket has a Cooking / Ready switch (`role="switch"`, named "<dish> ready"): on marks it ready, off undoes it (P29's undo). Tapping the dish row does nothing, so a brushed row never marks food ready. Holding the footer still marks the whole ticket.
6. **One-tap kitchen requests** on a dish (Less spicy, Extra spicy, No onion, Jain, Less sugar, No ice), as on the staff order screen, written into the line's note. **An occasion** on a booking (Birthday, Anniversary, Family dinner, Friends), written into the booking's note.
7. Every word on the page is in GLOSSARY section 15 or 25. The browser tests in `e2e/online.spec.js` pass unchanged.
