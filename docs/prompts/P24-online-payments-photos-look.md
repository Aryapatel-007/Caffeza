# P24 Advance payment, dish photos and the new public page

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P23. The spec was committed on its own first
(`spec online payments, dish photos and the public page look`): API-CONTRACT
M14 sections 4 to 7, DB-SCHEMA sections 29 and 30, GLOSSARY section 15.

---

## 1. What to build, in one sentence

Let a guest pay for a takeaway in full, or a booking deposit, through the
cafe's own Razorpay account. Refund it automatically when the cafe cannot take
the request. Apply it to the bill with one tap. Give every dish an optional
photo, and redesign the public page so it looks like a restaurant's own premium
ordering site, not a form.

## 2. Decisions taken with Rishi on 2026-10-08

| Question | Answer |
|---|---|
| Whose account receives the money | **Each cafe's own Razorpay account.** We never hold guest money, so we need no RBI Payment Aggregator licence. |
| Gateway | **Razorpay**, through Payment Links: a hosted payment page, so our page loads no outside script and the content security policy is unchanged. |
| What is paid in advance | **Takeaway in full. A booking pays a deposit per person**, set by the owner and taken off the bill on the day. |
| Photos | **Yes**, an optional photo per dish, uploaded in the menu builder. |

This reverses, for online requests only, the decision log line "Not
integrating payments in version 1". The till still only records how a guest
paid at the counter. Recorded in the decision log.

## 3. The rules that do not bend

1. **The cafe's secrets are encrypted at rest.** The Razorpay key secret and
   webhook secret are stored with AES-256-GCM under `PAYMENT_SECRETS_KEY` from
   `.env`. No response carries them, no log line, no audit line. Without that
   variable, connecting a gateway is refused with a plain message.
2. **We trust nothing the browser says about money.** A payment counts only
   when the server has verified Razorpay's signature, or the webhook's
   signature, and has read the payment link back from Razorpay with status
   `paid` and the exact amount.
3. **Money paid online never vanishes.** The cafe declines, the request
   expires, the guest cancels in time, or the bill comes to less than the
   advance: every one of these refunds automatically, through Razorpay, and
   records the refund. A refund that fails is shown to the owner with a retry.
4. **The advance reaches the bill as a payment, with one tap, at payment
   time.** Not at bill creation, because a discount is refused once money is
   on a bill. The payment's `receivedAt` is the moment it is applied, so C3 and
   the day figures count it on the bill's day. Until it is applied it is an
   advance held, not a payment.
5. **Nothing else can settle a bill that has an unapplied advance.** A
   cashier taking cash on it is refused with "Apply the online advance first",
   so no guest pays twice.
6. **Unpaid requests never reach staff.** A request waiting for payment is
   invisible to the inbox and the alert, and lapses quietly when its link
   expires.
7. Every rule from P23 still holds: nothing reaches the kitchen without a
   person, prices are snapshotted at accept, and tax arithmetic stays in
   `tax.js`.

## 4. Build order

1. `server/utils/secretBox.js` (encrypt and decrypt, with a test that a wrong
   key fails), and `PAYMENT_SECRETS_KEY` in `config/env.js` and `.env.example`.
2. `services/razorpayClient.js`: create a payment link, fetch one, refund a
   payment, verify the callback and webhook signatures. Its base URL is
   `RAZORPAY_API_BASE`, defaulting to `https://api.razorpay.com`, so tests and
   the e2e server run a fake gateway. No SDK dependency: `fetch` with basic
   auth.
3. The gateway connection endpoints and the Settings section.
4. `onlinepayments`, and the payment step in placing an order and requesting
   a booking.
5. Confirming: the return endpoint, the webhook, and a read-back when the guest
   polls. Refunds: decline, expiry, guest cancel, staff cancel, leftover.
6. Applying the advance to a bill, and refusing other payments until then.
7. Dish photos: `menuphotos`, upload and remove, and the public photo route.
8. The public page redesign, then the staff screens: Paid online on cards,
   Apply advance on the bill, Refund failed with a retry, the photo in the item
   editor, and Payments in Settings.

## 5. The look of the public page

It is the cafe's own site. It should feel like a premium restaurant's ordering
page: warm, photographic, generous, and quick on a phone.

- **Home.** A full-width hero in the cafe's brand colour, or its accent when
  no brand colour is set. The wordmark is set large, with an "Open now until
  11:00 pm" pill and the address. Under it, a mosaic of up to four dish photos.
  Then two large choice cards, Order takeaway and Book a table, each with a
  line saying what happens next ("Pay online, collect in 20 minutes").
- **Menu.** A sticky bar of category chips that scrolls to each section. Dish
  cards with the photo on top, two across on a phone and three on a tablet: the
  name, a two-line description, the price, and a round add button. A dish with
  no photo gets a styled tile with its initial on a tint of the accent. The
  dish sheet opens with the large photo. The cart is a floating pill at the
  bottom with the count and the running total.
- **Checkout.** A three-step indicator: Order, Details, Pay. The order summary
  is a receipt-like card. "Pay ₹326.00 securely" goes to Razorpay, with "UPI,
  cards and netbanking" and "Refunded in full if the cafe cannot take your
  order" below the button.
- **Booking.** A strip of date cards (weekday, day, month). Party size as
  chips from 1 to 8, then a stepper. Times grouped as Lunch, Afternoon, Evening
  and Dinner. A summary ticket: date, time, people, and the deposit to pay.
- **Status.** A ticket-style card with a perforated edge, the reference large,
  and a step line: Placed, Paid, Confirmed, Ready (or Booked, Paid, Confirmed,
  Seated). Each step shows its time, and says plainly what happens next.
- **Rules.** Only the design system's tokens; no raw colours in code. No
  looping animation. Transitions under 200ms, and none under
  `prefers-reduced-motion`. 48px tap targets. Day theme only. Every label from
  GLOSSARY section 15.

## 6. Tests

Server, against a fake Razorpay in `tests/helpers/fakeRazorpay.js`:

1. Connecting refuses without `PAYMENT_SECRETS_KEY`, and refuses keys
   Razorpay rejects. Stored secrets are not plaintext in the database, and no
   response carries them.
2. With prepay on, placing creates a link for exactly the estimate. The
   request is `AWAITING_PAYMENT`, and the inbox does not count it.
3. The return with a forged signature changes nothing. A good signature with
   a link that reads unpaid, or for a different amount, changes nothing. A good
   one moves the request to `WAITING` and starts its answer window.
4. The webhook with a bad signature gets 400. A good one confirms the payment
   once, and a repeat is a no-op.
5. Decline, expiry (swept on the next inbox read) and guest cancel each refund
   in full, once.
6. A booking deposit is party size times the per-person amount. A guest
   cancelling before the cutoff is refunded; after it, the deposit is
   forfeited. Staff cancel always refunds. No-show forfeits.
7. Apply advance: a payment of method `ONLINE` for the smaller of the advance
   and what is due, `receivedAt` now. Any excess is refunded. Cash on a bill
   with an unapplied advance gives 422. `ONLINE` cannot be chosen by hand.
8. A refund the gateway refuses is `REFUND_FAILED`, shown, and retryable.
9. Photos: PNG, WebP and JPEG within limits accepted, SVG refused, too large
   refused. The public menu carries `photoUrl` with the hash, and the photo
   route serves the bytes with a year's cache.
10. Roles and tenancy on every new endpoint. The golden day is unchanged.

Browser, `e2e/online.spec.js` extended: a guest pays through the fake gateway
and returns, the cashier accepts, the bill applies the advance and is paid. And
a declined paid request shows Refunded on the guest's page.

## 7. Open questions for Caffeza's CA

1. GST on an advance for a takeaway: is it due when received or when
   supplied? The design treats the advance as held until it is applied to the
   tax invoice, which is when the bill exists.
2. A forfeited booking deposit is a cancellation charge. Does it need its own
   tax invoice? Until answered, forfeits are recorded and listed, not
   invoiced.
