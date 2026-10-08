# Integrations

How to connect a restaurant to Swiggy, Zomato, a Pine Labs card machine and
Tally. Written for whoever sets up a restaurant. Built in P25 as module M21.
The contract is API-CONTRACT M21, the collections are DB-SCHEMA sections 32
to 39, and the words are GLOSSARY section 16.

Everything is set up in the app under **Set up, Integrations**
(`/settings/integrations`). The owner changes connections. A manager can read
them, see alerts and export to Tally.

Before any of this, the server needs `INTEGRATION_SECRETS_KEY` (see
`docs/DEPLOYMENT.md`). Every partner credential is sealed with it, and is never
shown again. A screen shows only its last four characters.

---

## 1. Swiggy and Zomato

### 1.1 Getting the integration

Neither platform lets a restaurant send orders to its own software without
approval. There are two ways in:

1. **Directly.** Apply to the platform's partner programme as a POS provider.
   They send an integration document and test credentials once they approve.
2. **Through a middleman.** An aggregator such as UrbanPiper or Petpooja's
   connector is already approved and passes orders on. That needs an adapter
   written against the middleman's own document instead.

Ask them for:
- the integration document, with every endpoint, field and status code;
- test credentials and a test store;
- how they sign their webhooks, and what address they post to;
- what they need from us to go live: certification, a test run, a form.

### 1.2 Their document stays out of git

The repository is public. A partner's document is confidential under their
agreement.

- Save it in `partner-docs/<platform>/` at the repository root. That folder is
  in `.gitignore`.
- Never copy text, field lists or examples from it into code comments, tests,
  docs or commit messages.
- The adapter in `server/services/integrations/channels/` is written from the
  document. Until then the provider is **Waiting for partner approval**, and
  nothing guesses an endpoint, a field name or a status code.

### 1.3 Practise with the sandbox platform first

The **Sandbox platform** behaves like a delivery platform, so staff can learn
the incoming orders screen before a real platform is connected. It never runs
in production.

1. Integrations, Sandbox platform: choose **Bills as** Zomato or Swiggy, set a
   signing secret of 16 characters or more, save, then **Test connection**.
2. Send a sample order from a terminal:
   ```
   npm run sandbox:order -- --restaurant <restaurant id> --file setup/sandbox-orders/simple-prepaid.json
   ```
   The other two samples are `unmapped-item.json` and
   `discount-and-packaging.json`.
3. The order appears on **Online** with its platform, number and a countdown.
   Accept it with a preparation time, or reject it with a reason.

### 1.4 Connecting a real platform, once its adapter exists

1. Integrations, the platform: enter the credentials, save, **Test connection**.
2. Give the platform the **webhook address**. It is shown once, when it is
   made. **Make a new address** stops the old one at once.
3. **Item mapping** (`/settings/integrations/<PLATFORM>/mapping`): match every
   platform item to a dish and size. An order with an unmatched item waits for
   a person. A long list can go in one call, as a CSV of
   `external_item_id,external_variant_id,menu_item,size`, through
   `POST /integrations/<PLATFORM>/item-mappings/import` (a dry run unless
   `apply: true`). The screen has no upload for it yet.
4. Check the platform's payment method exists in Settings, Payment methods, of
   kind Platform, with the platform code. Otherwise its bills stay unpaid and
   an alert says so.
5. Watch the **event log** on the platform's sheet for the first few orders.

---

## 2. Pine Labs card machine

Built from Pine Labs' public cloud integration page
(developer.pinelabs.com, "in-store cloud integration"), read on 8 October 2026.

### 2.1 What to ask Pine Labs for

- **Merchant ID** and **Security Token** (secrets, sealed when saved);
- **Store ID**, if they use one;
- each machine's **Client ID**, with a name the cashier will recognise;
- the **test (UAT) address**, and the **production address**;
- the integration document, for the three **URL paths**: sending an amount,
  reading its result, and cancelling it.

### 2.2 Setting it up

1. Integrations, Pine Labs: environment **Test (UAT)** first. Enter the
   address, the three paths, the Store ID and each machine. Save, then
   **Test connection**.
2. Settings, Payment methods: link **Card** and **UPI** to the card machine,
   each with its payment mode.
3. Each till tablet chooses its machine on **This device**.
4. Take a test payment in UAT on each machine: approved, declined, cancelled
   at the counter, and left to expire. Check each against the machine's slip.
5. Switch the environment to **Live**, with the production address and
   credentials, and test again with a small real payment.

With `settings.payments.requireTerminalForLinkedMethods` on (the default),
Card and UPI can only be taken through the machine. An owner or manager can
record one by hand, with a reason, when the machine is down. It is on the
audit trail as `TERMINAL_BYPASSED`.

### 2.3 What Pine Labs' public page does not say

These are not guessed. Each is a setting, or handled safely, until Pine Labs'
own document says otherwise:

1. **The URL paths** of the three calls: kept in the connection's settings.
2. **The production address**: a setting.
3. **Cancel's exact fields**: we send what the status call sends, plus the
   amount.
4. **The codes for declined and for still waiting.** Only 0 (approved) and 1008
   (voided) are public. A non-zero answer whose message says declined, failed
   or rejected is taken as declined. Anything else waits, and expires after
   the machine's own cancel time plus 5 minutes. Nothing is ever taken as
   approved unless the code is 0 and the approved amount is there.
5. **Postbacks are not signed.** A postback only makes the server ask Pine
   Labs again. It is never believed on its own.

---

## 3. Tally

Closed days only. Each becomes vouchers built from the figures frozen on its
bills, so the export always agrees with the day's reports.

### 3.1 Choosing how vouchers reach Tally

- **As a file to import**: download the day's file and import it in Tally.
  Nothing to install.
- **Through a Tally bridge**: a small program on the computer that runs Tally,
  `tools/tally-bridge/`, posts each day straight into Tally when someone
  presses **Send to Tally**.

Set it in Integrations, Tally: the **Tally version** (TallyPrime or
Tally.ERP 9), the **company name exactly as in Tally**, one sales voucher a day
or one per bill, and how vouchers reach Tally.

### 3.2 Ledger mapping

On the Tally page (`/settings/tally`), choose a Tally ledger for every head:
sales at each GST rate on the menu, sales where the platform pays GST, CGST
output, SGST output, round-off, each payment method, On Hold (one ledger, or
one per account), paid out and paid in, and, when payouts are exported, the
bank and each platform's commission.

An export refuses a day while a head with an amount has no ledger, and names
each one. **Download the ledger list** gives an XML of every mapped ledger
under its parent group, to import into Tally once. The accountant sets the GST
details on the tax ledgers in Tally.

### 3.3 Importing a file

TallyPrime:
1. Open the company.
2. First time only: Import, Masters, and choose the ledger list file.
3. Import, Transactions, and choose the day's file.
4. Check the Day Book for that date against the day's report.

Tally.ERP 9:
1. Open the company.
2. First time only: Gateway of Tally, Import of Data, Masters, the ledger list.
3. Gateway of Tally, Import of Data, Vouchers, the day's file.
4. Check the Day Book for that date against the day's report.

### 3.4 Installing and pairing the bridge

The bridge needs Node.js 20 or newer on the accountant's computer, and Tally's
HTTP server switched on. `tools/tally-bridge/README.md` is written for the
accountant and has the exact Tally setting for each version.

1. The owner, on the Tally page: **Pair a new bridge**, with the computer's
   name. The code works once, for 10 minutes.
2. On the accountant's computer: `node bridge.js pair <code> --server <the app's address>`.
3. `node bridge.js check` lists the companies open in Tally.
4. `node bridge.js run`, or **start-bridge.cmd** on Windows. Leave it open.
5. Integrations, Tally: **Test connection**. The days then appear.

Before posting, the bridge reads the company's ledger list, and nothing is
posted while a ledger the day uses is missing from it. **Switch off** a bridge
the moment its computer is lost or replaced.

### 3.5 Never post a day twice

A day that was downloaded, sent, posted, partly posted, or whose answer is not
known is held. To export it again:
1. **Delete that day's vouchers in Tally first.**
2. The owner presses **Export again** and types the exact sentence, like
   "I have deleted the vouchers for 26 Sep 2026 from Tally."

Reopening a day in Day Close marks its exports stale. Close it again, then
export it again. Importing a file by hand **and** sending it through the bridge
counts the day twice: the app cannot see a file imported by hand.

### 3.6 The manual check still owed (P25 Part K5)

Not yet done, because it needs Tally installed:
1. TallyPrime in Educational mode, a test company, its HTTP server on.
2. A staging restaurant with closed days on the 1st and 2nd of a month.
3. Import the ledger list, export both days, post them through the bridge, and
   compare every amount in Tally's Day Book with R2 and R9.
4. The same with Tally.ERP 9.
5. Save each version's real answers, with made-up names, as fixtures in
   `server/tests/fixtures/tally/`, and record any difference between the
   versions in `server/services/integrations/tally/profiles.js`.

---

## 4. What is built and what is waiting

| Part | Built | Waiting for |
|---|---|---|
| Foundation | Sealed credentials, connections, event log (180 days), job runner with retries, webhooks, the integration user | Nothing |
| Sandbox platform | Complete: orders, accept, reject, ready, pickup, cancel, availability | Nothing. Never in production. |
| Swiggy | Connection screen, mapping, the whole order flow behind the adapter | Swiggy's approval and document. Waiting for partner approval. |
| Zomato | The same | Zomato's approval and document. Waiting for partner approval. |
| Pine Labs | Send an amount, read the result, cancel, expiry, one payment per approval, the bypass | Pine Labs' document: the paths, the production address, Cancel's fields, the declined and waiting codes (section 2.3) |
| Tally file | Vouchers per day or per bill, the ledger list, held days, export again | The manual check in section 3.6 |
| Tally bridge | Pairing, posting, ledger check, lost posts held as not known, switch off | The same manual check. Its ledger and company list request follows Tally's help page for Tally.ERP 9, and is unconfirmed on TallyPrime. |
| Alerts | Dead jobs, failed accepts, amount mismatches, closed-day cancellations, unknown card payments, Tally failures, on the Integrations page and in Today | Nothing |

---

## 5. Z Chaat checklist

Every answer here is `TO CONFIRM`. The profile is
`docs/clients/zchaat/PROFILE.md`.

| Item | Answer |
|---|---|
| Which delivery platforms they use: Swiggy, Zomato, others | `TO CONFIRM` |
| Direct partner integration, a middleman, or keep entering platform orders by hand | `TO CONFIRM` |
| The platforms' payment methods in Settings, with platform codes | `TO CONFIRM` |
| Item mapping for each platform's menu | `TO CONFIRM` |
| Whether Card and UPI go through a Pine Labs machine | `TO CONFIRM` |
| Pine Labs Merchant ID, Security Token, Store ID | `TO CONFIRM` |
| Each machine's Client ID and name | `TO CONFIRM` |
| Pine Labs UAT address, production address and the three paths | `TO CONFIRM` |
| A UAT test on each machine: approved, declined, cancelled, expired | `TO CONFIRM` |
| Tally version, TallyPrime or Tally.ERP 9 | `TO CONFIRM` |
| The company name exactly as in Tally | `TO CONFIRM` |
| One sales voucher a day, or one per bill | `TO CONFIRM` |
| Ledger names for every head in section 3.2, from their accountant | `TO CONFIRM` |
| File import, or the bridge on the accountant's computer | `TO CONFIRM` |
| If the bridge: the computer's name, Node.js installed, Tally's HTTP server on | `TO CONFIRM` |
| The manual check in section 3.6, on their version | `TO CONFIRM` |
