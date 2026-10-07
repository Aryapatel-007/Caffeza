# P23 Online takeaway orders and table reservations

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P22. The spec in this prompt was committed on its own first
(`spec online orders and reservations`), in API-CONTRACT M14 and DB-SCHEMA
sections 26 to 28. Read those, not only this prompt.

---

## 1. What to build, in one sentence

Give each restaurant its own public page where a guest can order takeaway or
request a table, and make every request land on the staff screens with a
chime, a spoken announcement and a banner that stays until someone accepts or
declines it.

## 2. Module

M14 Online Ordering, from `docs/BUILD-PLAN.md` section 5, with table
reservations added to it. Owner: Rishi.

In this prompt: takeaway ordered online, and table reservations, both from the
restaurant's own page.

Not in this prompt, and still M14 later: the QR code on the table that orders
straight from the guest's phone. Delivery from the restaurant's own page,
because that needs riders. Taking payment online, because we do not move money
(decision log, "Not integrating payments in version 1").

It touches M2 (an accepted request becomes an ordinary order, and the floor
shows upcoming reservations), M3 (the bill freezes where the order came from),
M7 (a new settings group and a feature switch) and M0 (a public route family
with its own rate limits, and a new sanctioned tenant lookup).

## 3. Why

Caffeza pays Zomato and Swiggy commission on every order that comes through
them, and a guest who already knows the cafe still orders through the app
because it is the only button they can find. A page of the cafe's own, linked
from its Instagram, Google listing and table cards, takes the same order with no
commission. Reservations come in today by phone call and WhatsApp, and nothing
records them.

The one thing that makes this work in a cafe is that nobody misses a request
during a rush. That is why the alert is spoken, not only shown.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to
   `docs/prompts/P23-online-orders-reservations.md`.
2. `git pull`. `git status` should show only that file. If anything else is
   uncommitted, stop and list it.
3. `docs/prompts/README.md` must show P22 as Done.
4. Run `npm test` and record the count. If anything fails before you start,
   stop and tell me.
5. Read the known problems row about the shared-address rate limit in
   `docs/PROJECT-STATE.md`. This prompt adds one more poll per device. If that
   row is still OPEN, stop and ask before adding the poll in section 10.

## 5. Files to read first

1. `docs/API-CONTRACT.md` M14, all of it. M2 sections 11 and 12. M7 settings.
2. `docs/DB-SCHEMA.md` sections 2 (`branches`), 9 (`orders`), 12 (`bills`),
   17 (settings) and 26 to 28.
3. `docs/GLOSSARY.md` section 15.
4. `docs/DESIGN-SYSTEM.md`: the six state colours, `Sheet`, `StateChip`, the
   motion rules, and the rule that nothing loops.
5. `docs/BUILD-PLAN.md` sections 11 and 12, security and common mistakes.
6. `server/models/Branch.js`, `Order.js`, `Bill.js`, `Counter.js`.
7. `server/controllers/orderController.js` `createOrder`, and
   `server/services/orderService.js` `buildLineSnapshots`.
8. `server/controllers/menuItemController.js` `getMenu`.
9. `server/utils/tax.js` `computeBillTotals`.
10. `server/middleware/rateLimit.js`, `tenant.js`, `requireFeature.js`.
11. `server/tests/tenantGuard.test.js` and every test that asserts the
    `skipTenantGuard` counts.
12. `client/src/components/AppShell.jsx`, `context/AuthContext.jsx`, the
    "This device" settings, and `features/kitchen/KitchenDisplayPage.jsx` for
    how a screen polls.

---

## 6. The rules that do not bend

1. **Nothing a guest sends reaches the kitchen or a bill without a staff
   member accepting it.** A public request is a request. Accepting it creates
   an ordinary order through the same code a cashier's order goes through, with
   the accepting person as `openedBy`. This is the main protection against fake
   orders, and it is why there is no OTP in v1.
2. **The price is copied into the order when the order is created**, which is
   at accept. The quote the guest saw is stored on the request for display, and
   nothing else reads it. If a price or availability changed between the quote
   and the accept, the accept says so (section 8d).
3. **Tax arithmetic stays in `tax.js`.** The estimate on the public page is
   `computeBillTotals` over the same snapshots `buildLineSnapshots` produces. No
   new arithmetic anywhere.
4. **Every public read and write is tenant-scoped through the slug.** The slug
   resolver sets `req.restaurantId` and `req.branchId`, and from then on the
   normal `scoped(req)` and the tenant guard apply. The resolver is the only new
   `skipTenantGuard` use: the tripwire counts become
   `{ authService.js: 3, tokenService.js: 1, publicSiteService.js: 1 }`.
5. **A public response is a whitelist.** It never carries a user, a staff name,
   a table, an internal note, another guest's request, or any field it was not
   listed with in the contract.
6. **No scheduler.** A request nobody answered in time is `EXPIRED`, derived on
   read from its stored deadline, and written back the next time anything
   touches it. The server stays a plain web server.
7. **Schema changes are additive.** Every new field has a default. No
   migration.

---

## 7. The data

All of it is in DB-SCHEMA sections 26 to 28 and the additions to sections 2, 9,
12 and 17. In short:

- `branches.online`: `publicSlug`, `pausedUntil`, `pausedBy`.
- `settings.features.online`, default `false`.
- `settings.online`: switches, hours, lead time, answer window, party size,
  booking horizon, slot length, table hold length, page note, alert roles.
- `onlineorders`: one takeaway request from the public page.
- `reservations`: one table booking, from the public page or typed in by staff.
- `orders.origin` and `bills.origin`: where an order came from, frozen.
- `counters` names `ONLINE_ORDER` and `RESERVATION`, for references `W-42` and
  `R-17`. Gaps are fine, like order numbers.

## 8. The server

### 8a. Public routes

`server/routes/publicRoutes.js`, mounted at `/api/v1/public`, **before** the
authenticated routes, and never behind `authenticate`.

Middleware order on these routes:
`publicReadLimiter` or `publicWriteLimiter` → `resolvePublicSite` → `validate`
→ controller.

- `resolvePublicSite` calls `publicSiteService.resolveSlug(slug)`. It finds the
  active branch with that `online.publicSlug`, checks the restaurant is active,
  and sets `req.restaurantId`, `req.branchId` and `req.publicSite`. An unknown or
  inactive slug is 404, the same body as a slug that never existed.
- `settings.features.online` off, or the restaurant inactive, is the same 404.
- Each endpoint, its body and its errors are in API-CONTRACT M14 section 2.

### 8b. Limits

Two new limiters in `middleware/rateLimit.js`, constants like the others:

| Limiter | Key | Limit |
|---|---|---|
| `publicReadLimiter` | address | 300 per 5 minutes |
| `publicWriteLimiter` | address, and separately the SHA-256 of the normalised phone | 6 per 15 minutes each |

The general limiter does not apply to `/api/v1/public`: mount the public router
before `generalLimiter`, or skip that path in it. A guest on a mobile network
shares an address with thousands of strangers, and the cafe's own staff must
never share a bucket with its guests.

Then the business limits, in the service: at most 2 `WAITING` online orders
and 3 open reservations per phone per branch, 422 `TOO_MANY_OPEN_REQUESTS`.

The honeypot: the body has a `website` field the page hides. A non-empty value
is 400 `VALIDATION_FAILED` with a generic message.

### 8c. Placing

`onlineOrderService.place(req, body)`:

1. The feature, `takeawayEnabled`, the opening hours and `pausedUntil` must all
   allow it, else 422 `ONLINE_CLOSED` with the message the page shows.
2. `idempotencyKey` already used for this branch: return the existing request
   with 200, not 201, and change nothing.
3. Price the lines with `buildLineSnapshots` and total them with
   `computeBillTotals`. An unavailable or inactive item is 422, naming it.
4. Pickup: `ASAP` means now plus `takeawayMinLeadMinutes`. A chosen time must be
   on the same business date, at least that far ahead, and inside opening
   hours.
5. Reserve a reference from the `ONLINE_ORDER` counter.
6. Make a status token: 32 random bytes, sent once as base64url, stored only as
   SHA-256.
7. `answerBy` is now plus `takeawayAnswerWithinMinutes`.
8. Save with status `WAITING`.

`reservationService.request(req, body)` is the same shape: hours, party size,
the booking horizon and slot alignment instead of lines and pickup. `answerBy`
is `at` minus 30 minutes, or now plus `takeawayAnswerWithinMinutes`, whichever
is later.

### 8d. Accepting a takeaway

`POST /api/v1/online/orders/:id/accept`, in one transaction where one is
available, through `utils/transaction.js`:

1. Claim it: `findOneAndUpdate` filtered on `status: WAITING` and
   `answerBy > now`. No match is 409 `REQUEST_ALREADY_DECIDED`, carrying the
   status it is in. Two cashiers tapping Accept at once: one wins, the other is
   told.
2. Re-price the stored request lines with `buildLineSnapshots` now. Compare
   each line's unit price and add-on prices with the quote, and check that every
   item is still available. If any differ, roll back and return 422
   `ONLINE_ORDER_CHANGED` with `changes: [{ itemName, was, now }]` or
   `{ itemName, unavailable: true }`. Staff phone the guest, then either decline
   or accept again with `acceptChangedPrices: true`. An unavailable item can
   never be accepted.
3. Create the order through the same code `createOrder` uses. Extract the body
   of `createOrder` into `orderService.openOrder(req, input)` first, so the
   controller and this service share one path, and nothing about numbering,
   snapshots or validation is written twice. `orderType: TAKEAWAY`, the guest's
   name and phone, `openedBy` the accepting person, and
   `origin: { kind: ONLINE_ORDER, id, reference, pickupAt }`.
4. If `fireNow` is true, which is the default, fire it through the existing fire
   path in the same request, so the stations get their tickets.
5. Write `orderId`, `decidedBy`, `decidedAt`, and `pickupAt` if staff moved it.

### 8e. Declining, expiry and pausing

- Decline takes a code from `server/config/onlineReasons.js`
  (`ITEM_UNAVAILABLE`, `TOO_BUSY`, `CLOSING_SOON`, `SUSPECTED_FAKE`, `OTHER`,
  with a note required for `OTHER`), mirrored on the client with a test, like
  the cancel reasons.
- `EXPIRED`: a `WAITING` request past `answerBy`, or a `REQUESTED` reservation
  past `answerBy`. `serialiseOnlineOrder` and `serialiseReservation` report it,
  every write path treats it as decided, and the first write that sees it
  stores it.
- Pause: `POST /online/pause` with `{ minutes: 15 | 30 | 60 | 120 }` or
  `{ untilClose: true }`, and `POST /online/resume`. It sets
  `branches.online.pausedUntil`. While paused, the public page reads "Not
  taking orders right now, back at 7:45 PM" and placing is 422 `ONLINE_CLOSED`.
  Reservations are not paused. A rush stops new takeaway, and a booking for
  Saturday is unaffected.

### 8f. Reservations

- Confirm: optional `tableId`. When a table is given, any other `CONFIRMED`
  reservation on that table within `reservationHoldMinutes` either side is 409
  `RESERVATION_CLASH`, listing them by reference and time.
- Seat: `{ tableId, guestCount }`. It opens a `DINE_IN` order through
  `orderService.openOrder`, so `TABLE_OCCUPIED`, the guest count rule and every
  other table rule apply unchanged, with
  `origin: { kind: RESERVATION, id, reference }`. The reservation becomes
  `SEATED`.
- No-show: allowed from 15 minutes after `at`. Staff cancel: any time before
  seating, with a reason.
- Staff can type in a phone booking: `POST /online/reservations` with
  `source: PHONE`. It is created `CONFIRMED`, with no status token. This is the
  restaurant's booking book, not only an inbox.

### 8g. The floor

`GET /tables` occupancy gains `upcomingReservation`: for a table with no
occupying order and a `CONFIRMED` reservation on it whose time is within the
next `reservationHoldMinutes`, it carries `{ id, reference, at, partySize,
guestName }`. Otherwise null. Still a fixed number of queries; P19's test 8
gains one query, and its expected count is updated on purpose.

### 8h. Bills

`createBill` copies `order.origin` onto `bills.origin`. Nothing else in billing
changes. Reports are untouched in this prompt; a report of online sales is a
later prompt.

### 8i. The KOT ticket

For an online takeaway, the destination line reads
`ONLINE  W-42  PICKUP 7:30 PM`, with the guest's first name below it.

---

## 9. The public page

One lazy-loaded chunk, `client/src/features/public/`, at `/r/:slug`. It never
imports `AuthContext`, the API client's refresh logic, or anything from a
staff feature folder, and a test checks the imports.

- `/r/:slug`: the restaurant's wordmark or logo, its address and hours, today's
  state ("Open for takeaway until 10:30 PM", "Paused, back at 7:45 PM",
  "Closed"), and two large choices: Order takeaway, Book a table. A switched-off
  choice is not drawn.
- `/r/:slug/order`: the menu by category, sizes and extras in a sheet, a cart,
  then name, phone, pickup (As soon as possible, or a time from the list the
  server allows), a note, and the consent box (section 11). The total shown
  is the server's quote: item total, GST and bill total, with the line "Pay at
  the counter when you collect." Place order shows the reference.
- `/r/:slug/book`: date, party size, then the times the server offers, then
  name, phone, a note and the consent box.
- `/r/:slug/status/:id`: polls every 15 seconds while the request is undecided.
  Words: Waiting for the cafe to confirm, Confirmed, ready at 7:30 PM, Declined
  (and why), Expired (no reply in time, please call), Cancelled. A Cancel button
  while it is still undecided. The status token is kept in this browser's
  storage under the request id. It is wrapped in try/catch, and the page works
  without it except for the status view, which then says to call the cafe.

Phone first: it is used on a phone held in one hand, outdoors, on 4G. No
images except the logo. The restaurant's accent and neutral tone apply. Labels
from GLOSSARY section 15. English only in v1.

## 10. The alert

`client/src/features/online/OnlineAlerts.jsx`, mounted once inside
`AppShell`, for a signed-in role listed in `settings.online.alertRoles` (from
`GET /auth/me` `online`), and never on the kitchen screen.

1. **Poll.** `GET /online/inbox` every 15 seconds, also in the background.
2. **New request.** When `latestRequestAt` moves forward:
   - a two-note chime made with the Web Audio API, with no sound file;
   - a spoken line through `speechSynthesis`, `en-IN`, built from the inbox
     fields: "New takeaway order, W 42, 3 items, pickup 7 30." or "New table
     booking, R 17, 4 people, Saturday 8 PM.";
   - a banner fixed under the top bar on every screen, in the `open` state
     colour with the bell icon: "2 online requests waiting", with an Open
     button. It is `alert` once the oldest has used half its answer window. It
     is drawn and left still. Nothing pulses, nothing loops, and the design
     guard test still passes;
   - the tab title gains "(2) ".
3. **Repeat.** While anything is waiting, the chime and the line repeat every
   60 seconds. They stop the moment the inbox is empty.
4. **Sound needs one tap.** Browsers allow sound only after a tap on the page.
   Until the first tap, the banner says "Tap to turn on sound". Any tap anywhere
   counts.
5. **This device.** Two new switches under the existing storage key: Online
   alerts on this device (default on), Speak alerts (default on). A kitchen
   tablet or a captain's phone can be silenced without changing the
   restaurant's settings.

## 11. Consent, for the CRM that comes later

Both forms carry one unticked box: "Send me offers and news from {restaurant
name} by SMS or WhatsApp." Stored as `marketingConsent: { given, textVersion,
at }`. `textVersion` is `"2026-10-v1"` from `server/config/consentText.js`, which
holds the exact sentence, so what a guest agreed to can always be shown later.
Nothing sends anything in this prompt. The order updates on the status page are
not marketing and need no consent.

## 12. Staff screens

- `/online`: two tabs, Takeaway and Bookings, each with a count. Waiting first,
  oldest first, each card showing the reference, the guest's name and phone
  (tap to call), the items or party, the pickup or booking time, the time left
  to answer, and Accept and Decline. Accept on a takeaway is a sheet with the
  pickup time (adjustable) and "Send to kitchen now" (on). A 422
  `ONLINE_ORDER_CHANGED` shows the changes in the sheet with "Call the guest",
  "Accept with new prices" and Decline. Below the waiting requests: today's
  decided ones.
- `/online/bookings`: the day's book by time, with a date picker. Confirm
  (optional table), Seat (table and guests), No-show, Cancel, and
  "New booking" for a phone booking.
- On the floor, a free table with an upcoming reservation shows a `StateChip`
  in `open`: "Reserved 8:00 PM, 4". Tapping the table offers "Seat R-17" first.
- Settings: an Online section, owner only. The feature switch, the page address
  (`publicSlug`) with a Copy link button and a printable QR code drawn on the
  client with no outside service, and every `settings.online` field.
- The rail and bottom bar gain Online with a count badge, for the alert roles.

## 13. Tests

Server, in `tests/onlineOrders.test.js` and `tests/reservations.test.js`:

1. Restaurant A's slug never returns or accepts anything of restaurant B's, and
   a staff token from B gets 404 on A's request ids.
2. The public menu leaves out inactive and unavailable items, and each item has
   exactly the contract's fields, compared as a key list.
3. Unknown slug, inactive branch, feature off: the same 404 body.
4. Closed hours, paused, `takeawayEnabled` off: 422 `ONLINE_CLOSED`.
5. The honeypot gives 400. A third waiting order from one phone gives 422.
6. The same `idempotencyKey` twice: one request, the second call returns 200
   and the same reference.
7. The quote's bill total equals what `computeBillTotals` gives for the same
   lines. Checked against two golden-day dishes at different GST rates.
8. Two accepts at once: exactly one 200 and one 409, and exactly one order.
9. Accept creates a `TAKEAWAY` order with `openedBy` set to the accepting user,
   fresh snapshots, `origin` filled, and KOTs on the right stations.
10. A price raised after the quote gives 422 with the change. Accepting with
    `acceptChangedPrices` succeeds at the new price. An unavailable item cannot
    be accepted.
11. Past `answerBy`: reads `EXPIRED`, and accept gives 409.
12. The status read with no token, or the wrong one, gives 404. The right
    token never returns the phone number.
13. A reservation clash on one table gives 409. Seating opens a dine-in order
    with the guest count, and an occupied table still gives `TABLE_OCCUPIED`.
14. `upcomingReservation` appears inside the hold window and not outside it.
15. The bill of an accepted order carries `origin`.
16. Roles: every staff endpoint's 401, 403 and cross-tenant 404, per
    CONVENTIONS section 13.
17. The `skipTenantGuard` counts are updated to include
    `publicSiteService.js: 1`, and adding a second use fails the suite.
18. The golden day still produces every expected number.

Client: the reason mirror; the public folder imports nothing from staff
features; `designGuard.test.js` passes on every new file.

End to end, `e2e/online.spec.js`: a guest on a phone places a takeaway; the
cashier's tablet shows the banner, and a spy on `speechSynthesis.speak`
records the line; the cashier accepts; the kitchen screen shows the ticket; the
guest's status page reads Confirmed. Then a booking: requested, confirmed on
Table 5, the floor shows Reserved, the guest is seated, and the order opens.

## 14. Done means

Everything in `docs/CAFFEZA-BUILD-PLAN.md` section 7. Checked by hand at 380
and 1280 wide, in Day and Night, with sound on a real phone and a real tablet.
Note in `PROJECT-STATE.md` what was not checked by hand.

## 15. Open questions to answer before going live with this

1. Which address the page lives on: our domain with `/r/cafezza`, or the cafe's
   own subdomain pointing at us. The first needs nothing. The second is a DNS
   and certificate step in DEPLOYMENT.
2. Whether the cafe's existing website should embed the page in a frame. That
   needs a content security policy change per restaurant domain, so v1 links
   to it instead.
3. Phone verification by OTP. It needs an SMS provider and DLT registration in
   India. v1 relies on staff accepting every request, plus the limits.
4. Caffeza's real opening hours, and who hears the alert.
