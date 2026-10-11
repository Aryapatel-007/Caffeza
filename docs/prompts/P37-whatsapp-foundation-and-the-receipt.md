# P37 WhatsApp: the connection, templates, and the receipt

Saved 2026-10-11 from Arya's prompt, written as "P34". This repo's P34 to P36
were already taken (the password reset, the same dish once, one kitchen ticket
per table), so at Arya's choice it is P37, campaigns are P38 and attribution
P39; the references below are renumbered to match and nothing else is changed.
(2026-10-12: the WhatsApp assistant took P39 the same day, so attribution is
now P40.)
Z Chaat has no WhatsApp Business Account connected yet, so at Arya's choice it
is built and tested against a fake Meta, and the check against a real WABA
(section 15 item 5 and 6) waits for one.

**Model:** Opus, high effort. It adds a partner that sends messages to real guests on the restaurant's own number, and a mistake here costs the restaurant its WhatsApp number, not a retry.
**Branch:** none. Commit directly to `main`.
**Depends on:** P29. Independent of P30 to P33.

---

## 1. What to build, in one sentence

Connect each restaurant's own WhatsApp Business Account as an M21 provider, hold its approved templates as records with states, and send a guest their bill on WhatsApp when it is paid.

## 2. Module

M21 Integrations gets a new provider. M22 Customers gains the opt-out path. No new module number.

## 3. Why this, and why only this

A marketing template to an Indian number costs about ₹1.09. A **utility** template costs about ₹0.145. Nearly everything a restaurant genuinely wants to send — the bill, the booking, the order-is-ready note — is utility. At 150 bills a day, sending every guest their bill costs about ₹650 a month, and in exchange every guest has their bill on their phone and the restaurant has an open conversation with each of them.

This prompt deliberately builds **no campaign, no audience, no offers**. Those are P38. The receipt needs no consent, no cost warning and no frequency cap, so it is the whole plumbing exercise — templates, approval states, webhooks, retries, opt-out, delivery receipts — with none of the judgement. Ship it, watch real messages land at Z Chaat for a fortnight, and only then build the part that can annoy a guest.

The thing that most often sinks a WhatsApp build is discovering late that **Meta approves the templates, not you**. A message sent outside an open 24-hour window must be a pre-approved template; you submit it and it comes back approved, rejected, or in a different category than you asked for. So a template is a record with a state, never a string in the code. Design for that from the first commit.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P37-whatsapp-foundation-and-the-receipt.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count. If anything fails before you start, stop and tell me.
4. Confirm Z Chaat has a WhatsApp Business Account and at least one template approved by hand in Meta's interface. If not, stop and say so: the approval wait is days, and there is nothing to test against without it.

## 5. Files to read first

1. `docs/INTEGRATIONS.md`, the whole file. This is the pattern you are extending.
2. `server/services/integrations/providers.js`, the registry, and how Pine Labs declares its credentials, secret fields and config.
3. `server/services/integrations/connectionService.js`, `webhookService.js`, `jobRunner.js`, `eventLog.js`, `redact.js`, `systemActor.js`.
4. `server/utils/secretBox.js`, and how `INTEGRATION_SECRETS_KEY` is used.
5. `server/models/IntegrationConnection.js`, `IntegrationEvent.js`, `IntegrationJob.js`.
6. `server/models/Customer.js` and `server/services/customerService.js` from P27, especially `offers` and `offersHistory`.
7. `server/services/receiptService.js` and `buildInvoiceData`, which already assembles every figure on a bill.
8. `server/services/billService.js`, where a bill reaches PAID.
9. `docs/API-CONTRACT.md` M21, and M3 section 16.1 for the invoice data shape.
10. `docs/CONVENTIONS.md` section 3, on personal data in URLs, and section 12, on logging.

---

## 6. The provider

Add `WHATSAPP` to `providers.js` with a new kind, `MESSAGING`, beside `ORDER_CHANNEL`, `PAYMENT_TERMINAL` and `ACCOUNTING`.

Credentials, each sealed and shown only as its last four characters:

| Field | What it is |
|---|---|
| `phoneNumberId` | The WhatsApp number's id in Meta |
| `wabaId` | The Business Account id |
| `accessToken` | The long-lived token |
| `webhookVerifyToken` | Our own string, for Meta's subscription handshake |
| `appSecret` | For verifying the signature on every inbound call |

Config, not secret: `sendBillOnPayment` (default off), `defaultLanguage` (default `en`), and `senderDisplayName` for the screens.

Use Meta's **Cloud API** directly. There is no platform fee; the restaurant pays Meta per message and nothing reaches our accounts. This follows P24's decision exactly — each cafe's own Razorpay, now each cafe's own WABA — and it is what keeps us out of being a reseller of messages.

The connection's `test` reads the phone number back from Meta and confirms the token works and the number is registered. A test that only checks the fields are non-empty is not a test.

## 7. Templates are records, not strings

New collection, `messagetemplates`, scoped by `restaurantId` as everything is.

| Field | Notes |
|---|---|
| `key` | Our name for it, e.g. `BILL_RECEIPT`. Unique per restaurant. |
| `metaName` | The name registered with Meta |
| `category` | `UTILITY`, `MARKETING` or `AUTHENTICATION` |
| `language` | e.g. `en`, `gu` |
| `bodyText` | With numbered variables, as Meta stores it |
| `variables` | What each one maps to, so a send cannot pass them in the wrong order |
| `status` | `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `PAUSED`, `DISABLED` |
| `rejectionReason` | What Meta said, shown to the owner |
| `approvedCategory` | What Meta decided, which may not be what we asked for |
| `lastSyncedAt` | |

Two rules:

**A send against a template that is not `APPROVED` is refused**, with a new error code `TEMPLATE_NOT_APPROVED` (422). Not queued, not retried. Refused.

**`approvedCategory` is what we price against, never `category`.** Meta sometimes re-categorises a utility template as marketing on review. If we keep pricing it as utility, every cost figure we show an owner is wrong. Store both, show both when they differ, and warn on the integrations screen.

Add `GET /integrations/whatsapp/templates`, a sync that pulls their states from Meta, and a submit. Keep the submit minimal: one owner, a handful of templates. Do not build a template designer.

## 8. Sending

`services/integrations/messaging/whatsappService.js`, with one way in:

```
sendTemplate({ restaurantId, phone, templateKey, variables, idempotencyKey })
```

It must, in this order: find the connection and refuse unless `ACTIVE`; find the template and refuse unless `APPROVED`; check the guest has not opted out; check the idempotency key has not already been sent; then queue a job.

**Every send goes through `jobRunner`, never inline in a request.** Meta being slow or down must never slow a payment or a booking. The retry ladder that already exists — 30s, 2min, 10min, 30min, 2h, then DEAD — is right for this unchanged.

Idempotency follows P25's own pattern, `stockmovements`-style: a unique index on `{ restaurantId, eventKey }` where the key for a bill is `bill:<billId>:receipt`. A retried request, a re-queued job or a duplicated event must never send a guest two copies. A unique index, not a service check, because a check has a race in the middle.

Record every send as an `IntegrationEvent`, through `redactForLog`. **A phone number never appears in a log line, an audit line or a URL** — `CONVENTIONS.md` section 3 and 12, and P27 already made the customer search a POST for this reason. Store the message id Meta returns, so a delivery receipt can be matched to it.

## 9. The receipt

When a bill reaches PAID and `sendBillOnPayment` is on and the order has a customer phone, send the `BILL_RECEIPT` template.

**Queue it after the transaction commits, never inside it.** A publish inside a transaction that then rolls back tells a guest about a payment that did not happen. And a failure to queue must never fail the payment: wrap it so an error is logged and swallowed. A guest whose receipt is ninety seconds late is nothing; a guest whose payment failed because WhatsApp was down is a disaster.

The template's variables come from `buildInvoiceData`, which already produces every figure on the bill and is the one place those figures are assembled. Do not compute a total anywhere in this prompt. Suggested body, for the owner to adapt and submit:

> Thanks for visiting {{1}}! Your bill {{2}} for {{3}} is attached. We hope to see you again.

Where `{{3}}` is the grand total formatted by the existing money helper. Keep the PDF out of scope — a document header is a second approval and a storage decision. Text first.

A guest with no phone, a No Charge order, a voided bill and a platform order all send nothing. Write a test for each.

## 10. Inbound: delivery, and STOP

Mount the webhook beside the existing ones in `createApp`, **before the JSON parser**, because the signature is computed over the raw body — exactly as the Razorpay and partner hooks already are. Verify `appSecret` on every call. Store, then process by job, so a duplicate changes nothing.

Two things to handle:

**Delivery receipts.** `sent`, `delivered`, `read`, `failed` against the stored message id. Failures matter: a number that does not have WhatsApp should stop being tried.

**STOP.** A guest replying STOP, UNSUBSCRIBE, or Meta's own opt-out signal sets `offers.given` to false through `customerService`, with an `offersHistory` entry of source `ONLINE` and a reason. This must take effect immediately and must be honoured by P38 later. Reply once confirming it, inside the free service window.

Opting out of offers must **not** stop the receipt. A guest who does not want promotions still wants their bill. If a guest asks to stop everything, that is the restaurant removing their number, by hand, and it is out of scope here.

---

## 11. Rules this must not break

From `CLAUDE.md`: "Every database record has a `restaurantId`. Every query filters by it." Including the new collection and every template lookup.
From `CLAUDE.md`: "Secrets live in `.env`. Never commit a real secret." The token is sealed under `INTEGRATION_SECRETS_KEY`, shown as four characters, never logged, never returned, never audited. The repository is public.
From `docs/CONVENTIONS.md` section 12: never log a phone number. `redactForLog` exists; do not write a second one.
From `CLAUDE.md`: "Store all money as whole paise integers." The receipt prints figures from `buildInvoiceData` and computes nothing.
From the P25 decision: a webhook is verified, stored, then processed by a job; a duplicate changes nothing.
From `CLAUDE.md`: "Schema changes are additive." One new collection, and new fields with defaults.

## 12. Checks and golden day

No figure moves, so every number in `docs/TEST-DATA.md` must be identical. Run the golden day tests and say so.

Add a golden-day test: paying B05 with `sendBillOnPayment` on queues exactly one send, with the grand total ₹795.00 in its variables, and paying it again queues none.

`npm run e2e` must pass all thirteen specs. Add one: a bill paid with WhatsApp connected against a fake Meta, the message queued with the right template and variables, and no second message on a repeated payment. Follow `tests/helpers/fakeRazorpay.js` and `fakePineLabs.js` for the shape — and use obviously invented credentials, as the P25 note about the Pine Labs sample values requires.

---

## 13. Docs to update

1. `docs/API-CONTRACT.md`: an M21 section for the WhatsApp provider, its endpoints, the template record and its states, and the webhook. Committed before any code.
2. `docs/DB-SCHEMA.md`: `messagetemplates`, and the new fields on `integrationconnections`.
3. `docs/CONVENTIONS.md` section 3: the new error codes `TEMPLATE_NOT_APPROVED` (422), `MESSAGING_NOT_CONNECTED` (422), and `GUEST_OPTED_OUT` (422).
4. `docs/GLOSSARY.md`: a section for messaging words — template, utility, marketing, approval state, opt-out, delivery receipt, service window. Every label on a screen comes from here.
5. `docs/INTEGRATIONS.md`: how a restaurant gets a WABA, applies for templates, what gets rejected, and the Z Chaat checklist items.
6. `docs/PROJECT-STATE.md`: the date line; "Current stage" pointing at P38; the module table row for M21; a decision log entry dated today —
   "WhatsApp is an M21 provider on Meta's Cloud API, each restaurant on its own WABA with its token sealed under `INTEGRATION_SECRETS_KEY`. | The same reason P24 put each cafe on its own Razorpay: we never hold the money, and one restaurant's bad sending cannot cost another its number. Cloud API direct has no platform fee, where a BSP starts near ₹1,500 a month per number."
   "A template is a record with an approval state, and we price against `approvedCategory`, not the category we asked for. | Meta approves templates, not us, and re-categorises a utility template as marketing often enough that pricing against our own guess would make every cost we show an owner wrong."
   "A receipt is queued after the payment transaction commits, and a failure to queue never fails the payment. | A guest whose receipt is late is nothing. A guest whose payment failed because WhatsApp was down is a disaster."
7. `docs/prompts/README.md` and `docs/CAFFEZA-BUILD-PLAN.md` section 3: the P37 row.

---

## 14. Out of scope

Campaigns, offers, new dishes, audiences, segments. P38.
Attribution and campaign reporting. P40 (was P39; the assistant took that number).
A PDF of the bill as a document attachment. Text first; the document header is a second approval and a storage decision.
A template designer. The owner writes a handful of templates.
SMS and email. SMS in India needs DLT registration per template and per sender, which is weeks of paperwork for a worse channel.
A chatbot, auto-replies to arbitrary questions, or an AI agent.
Booking and online-order confirmations. They are the same machinery and they are easy to add after, but each is a template and an approval; do the bill first.

## 15. Done when

1. The contract and schema sections are committed before the first line of code.
2. `npm test` passes, counts before and after recorded.
3. `npm run lint` and `npm run build` pass.
4. `npm run e2e` passes all thirteen specs plus the new one.
5. Against Z Chaat's real WABA, on a test bill with a staff member's own number: the receipt arrives, the delivery receipt is recorded, and paying again sends nothing.
6. Replying STOP sets offers consent to withdrawn, visible on the Customers screen, with a history entry.
7. `grep -rn "phone" server/services/integrations/` shows no phone number reaching a log, an event line or a URL.
8. Every doc in section 13 is updated.
9. Commits on `main`, one line each, for example:
   `add the whatsapp provider spec`
   `add the whatsapp connection and templates`
   `send the bill on whatsapp when it is paid`
   `handle delivery receipts and stop`
   `update docs for p37`
10. Push `main`.
11. Print a short summary: test counts, what Meta rejected if anything, the real cost of the messages you sent, and anything that surprised you.
