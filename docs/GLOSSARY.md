# Glossary

One word, one meaning, everywhere.
This file decides what every number on every report is called and how it is calculated.
Report screens, exports, printed bills, API field names and help text all follow it.

Why this exists:
Caffeza's current system uses "Order Amount" for two different numbers, and "Sales" for a number that includes tax.
An owner who meets the same word meaning two things stops trusting all of it.

If a new report needs a word that is not here, add it here first, in the same pull request.

---

## 1. Rules for words

1. A label on screen always comes from this file.
2. A total is always the exact sum of the rows above it.
3. An average is always a sum divided by a sum, never an average of averages. It is always labelled "average".
4. Every money value is shown in rupees with the Indian grouping, like ₹2,07,179.00.
5. Every time is shown in India time, 12-hour, like 9:05 PM.
6. Every date filter uses business dates, never calendar dates.

**Words we never use on their own, because they are ambiguous:**

| Banned word | Why | Use instead |
|---|---|---|
| Amount | Means anything | The exact term below |
| Sales | Their old system meant "including tax". Most owners mean "before tax". | Bill total, or Net sales |
| Gross sales | Accountants mean "before discount". Our old API field `grossSalesInPaise` means "including tax". | Item total, or Bill total |
| Wallet | Mixes money already in the bank with money a platform still owes | Money in hand, or Platform money |
| Occupancy | Unclear | Covers |
| APC | An abbreviation | Average per cover |

---

## 2. The numbers on a bill

These follow the order in which a bill is built.

| Term | Meaning | Calculation | Stored in |
|---|---|---|---|
| **Line total** | The price of one line: quantity times unit price, plus its add-ons | `quantity × unitPriceInPaise`, plus add-ons | `bills.lines[].lineTotalInPaise` |
| **Item total** | All line totals added together, before discount and before GST | Sum of line totals | `bills.subtotalInPaise` |
| **Discount** | Money taken off the item total, before GST is worked out | Flat, or a percent of the item total | `bills.discount.amountInPaise` |
| **Net sales** | What the cafe actually earns from the bill. This is the taxable value. | Item total minus discount | Sum of `bills.taxBreakdown[].taxableInPaise` |
| **CGST** | Central GST, half of the GST | Worked out once per tax rate | `bills.taxBreakdown[].cgstInPaise` |
| **SGST** | State GST, the other half | Worked out once per tax rate | `bills.taxBreakdown[].sgstInPaise` |
| **GST** | CGST plus SGST | CGST + SGST | `bills.totalTaxInPaise` |
| **Round-off** | The paise added or removed so the bill lands on a whole rupee | Between minus 49 and plus 50 paise | `bills.roundOffInPaise` |
| **Bill total** | What the guest is asked to pay | Net sales + GST + round-off | `bills.grandTotalInPaise` |

Every bill obeys this, to the paisa:
Item total minus discount equals net sales.
Net sales plus GST plus round-off equals bill total.

Mapping from Caffeza's old labels:

| Their word | Our word |
|---|---|
| Sub Total | Item total |
| Amount, or Taxable | Net sales |
| Tax | GST |
| Sales, or Final, or NetTotal | Bill total |

---

## 3. Shares down to each line

A discount and GST are worked out for the whole bill, per tax rate.
Category and item reports need each line's part of them.
So every bill line also stores its share.

| Term | Meaning | Stored in |
|---|---|---|
| **Line discount share** | This line's part of the bill discount | `bills.lines[].discountShareInPaise` |
| **Line net sales** | Line total minus its discount share | `bills.lines[].taxableInPaise` |
| **Line GST share** | This line's part of the GST for its tax rate | `bills.lines[].taxInPaise` |

The rule for splitting, applied separately inside each tax rate on a bill:

1. Split the rate's discount across its lines in proportion to line total.
2. Give each line the whole paise it is due, rounded down.
3. Give any paise left over one at a time, to the lines with the biggest leftover fractions. A tie goes to the earlier line on the bill.
4. Split the rate's GST across the same lines in proportion to line net sales, the same way.

This is called the largest remainder method.
It guarantees that line shares add up exactly to the bill's figures.
It reproduces Caffeza's own split on real bill C22276: ₹22.68, ₹20.16, ₹14.11 and ₹4.03 four times.
Prompt P03 builds it, in `server/utils/tax.js` and nowhere else.

---

## 4. Days and time

| Term | Meaning |
|---|---|
| **Business day** | The trading day. It starts at `settings.businessDayStartsAtMinutes`, 5:00 AM by default, and runs until 4:59 AM the next morning. |
| **Business date** | The label of a business day, stored as `"YYYY-MM-DD"`. A bill paid at 12:30 AM on 27 September has business date 26 September. |
| **Bill's business date** | Decided when the bill is issued, from `billedAt`, and never changed. Sales count on this date. |
| **Payment's business date** | Decided when the money is received, from `receivedAt`. Cash in the drawer counts on this date. |
| **Open day** | A business date that has not been closed yet. Its numbers can still change. |
| **Closed day** | A business date locked by Day Close. Its numbers never change unless a manager reopens it, which is logged. |

Most bills are issued and paid on the same business date.
The two dates differ only for On Hold bills, which are issued on one day and collected on a later one.

---

## 5. The kinds of bill and order

| Term | Meaning | Counted in sales |
|---|---|---|
| **Bill** | A tax invoice with a number from the invoice series | Yes |
| **Unpaid bill** | A bill issued but not yet settled. Only possible on an open day. | Yes |
| **Paid bill** | A bill whose payments add up to its bill total | Yes |
| **On Hold bill** | A bill charged to a named account, to be collected later. Status `ON_ACCOUNT`. | Yes, on the day it was issued |
| **Voided bill** | A bill cancelled after it was issued. It keeps its number and is shown in the invoice register. | No |
| **No Charge order** | Food given free, with a reason and an approver. Order status `NO_CHARGE`. It gets no invoice number and no bill. | No |
| **Cancelled item** | A line cancelled before the bill was issued | No |
| **Cancelled order** | A whole order cancelled before billing | No |

---

## 6. Money received

| Term | Meaning |
|---|---|
| **Payment method** | How a bill was settled. Caffeza has eight. See `docs/CAFFEZA-PROFILE.md` section 10. |
| **Payment method kind** | `IN_HAND` or `PLATFORM`, set on each payment method and frozen onto each payment |
| **Money in hand** | Methods of kind `IN_HAND`, where the money is already the cafe's: Cash, Card, UPI |
| **Platform money** | Methods of kind `PLATFORM`, where a platform collected the money and pays the cafe later, minus commission: Zomato Gold, Dineout, EazyDiner, Zomato, Swiggy |
| **Money received** | Money in hand plus platform money |
| **On Hold** | Bill totals charged to accounts and not yet collected |
| **Collection** | Money received later against an On Hold account. It is not a sale. It counts in the drawer on the day it arrives. |
| **Split payment** | One bill settled with more than one method |

Every day obeys this, to the paisa:
Money received for the day's bills, plus On Hold, plus unpaid, equals the day's bill total.
On 26 September at Caffeza: ₹2,06,628 received plus ₹551 On Hold equals ₹2,07,179.

---

## 7. Platform terms

| Term | Meaning |
|---|---|
| **Platform** | Zomato, Swiggy, Zomato Gold, Dineout or EazyDiner |
| **Platform order** | A delivery order placed on Zomato or Swiggy. Entered by hand for now. |
| **Platform order ID** | The platform's own number for the order, like `249377796192385` |
| **Platform-paid GST** | On a platform delivery order, the platform pays the GST under section 9(5). Our bill shows 0% GST. Stored as `taxTreatment: PLATFORM_COLLECTS` on the order and the bill, frozen when the order is created. |
| **Discount funded by** | Who paid for a discount: the restaurant, or the platform |
| **Commission** | The platform's cut, as a percent of the bill total. `TO CONFIRM` per platform. |
| **Payout** | One batch of money from a platform, covering a range of business dates. Stored in `platformpayouts`. |
| **Expected payout** | For one payout: the sum over its payments of payment amount minus commission, each at the payment's own frozen commission rate. Payments with no rate are listed as "rate not set" and left out. |
| **Received payout** | What the platform actually paid, entered when it lands in the bank |
| **Payout difference** | Received payout minus expected payout |

---

## 8. People, tables and time

| Term | Meaning | Calculation |
|---|---|---|
| **Captain** | The staff member who opened the order | `orders.openedBy`, frozen onto the bill as `captainId` and `captainName` |
| **Covers** | Guests at a dine-in table | `orders.guestCount`, frozen onto the bill as `guestCount` |
| **Average per cover** | Dine-in net sales per guest | Dine-in net sales ÷ dine-in covers |
| **Average bill** | Net sales per bill | Net sales ÷ bills |
| **Table time** | How long a dine-in table was in use | Minutes from order opened to bill paid |
| **Average table time** | Mean table time | Total table time ÷ dine-in paid bills |
| **Kitchen time** | How long an item took in the kitchen | Minutes from KOT fired to marked ready |
| **Station** | A place a KOT goes, like Live Kitchen or Beverages | M18 |

Why average per cover will not match Caffeza's old APC:
Their APC divides all net sales, delivery included, by all guests.
Ours uses dine-in only, because a delivery order has no guests at a table.
On 26 September theirs was ₹417.33.

---

## 9. Controls

| Term | Meaning |
|---|---|
| **Discount reason** | Chosen from a fixed list, plus an optional note |
| **Approved by** | The owner or manager who allowed a discount, a No Charge, a void or a reopened day |
| **Cancelled before preparation** | The item never reached the kitchen, or the kitchen had not started it. `wasPrepared: false`. |
| **Cancelled after preparation** | The kitchen had made it. `wasPrepared: true`. |
| **Cancel reason** | Chosen from a fixed list in `server/config/cancelReasons.js`, with an optional note. A note is required for Other. |
| **Wasted value** | Line total of items cancelled after preparation, at menu price, before GST |
| **No Charge value** | Line total of a No Charge order at menu price, before GST |
| **Void** | Cancelling an issued bill. The number stays in the register, marked voided, with a reason. |

---

## 10. Cash drawer

| Term | Meaning |
|---|---|
| **Opening float** | Cash put in the drawer at the start of the day |
| **Cash from bills** | Cash payments received on the business date |
| **Cash collections** | Cash received against On Hold accounts on the business date |
| **Paid in** | Cash added to the drawer that is not a sale, with a reason |
| **Paid out** | Cash taken out for an expense, like buying milk, with a reason |
| **Expected cash** | Opening float + cash from bills + cash collections + paid in − paid out |
| **Counted cash** | What the manager counts at Day Close |
| **Cash difference** | Counted cash − expected cash. Negative means cash is missing. |

---

## 11. Invoice numbers

| Term | Meaning |
|---|---|
| **Invoice series** | The prefix and the running number, like `CFA/C/22442` |
| **Invoice register** | Every number issued in a range, in order, including voided ones |
| **Gap** | A missing number in the series. There must never be one. |

---

## 12. Report words

| Term | Meaning |
|---|---|
| **Share of net sales** | This row's net sales ÷ the report's total net sales. The rows add up to 100%. |
| **Rank** | Position when sorted by net sales, highest first |
| **Filter sentence** | The line at the top of every report saying exactly what it covers, like "26 Sep 2026, business day starts 5:00 AM, all order types, all captains" |
| **Check** | A balance rule from `docs/RECONCILIATION-RULES.md` that the report must pass |
| **Drill down** | Clicking any number to see the bills behind it |

Caffeza's old category report shows a "%" column where the top category is always 100% and the rest are measured against it.
Ours is a true share, and the column is labelled "Share of net sales".

---

## 13. Column labels

Added by P13 for the M19 report columns, so every label on a report comes from this file.
The labels already defined above keep their meaning.

| Term | Meaning |
|---|---|
| **Bills** | A count of bills, voided bills left out |
| **Order type** | Dine-in, Takeaway or Delivery, frozen on the bill |
| **Table** | The table name frozen on the bill |
| **Category** | The category name frozen on the bill line when the item was ordered |
| **Item** | The item name frozen on the bill line |
| **Quantity sold** | Sum of line quantities on live bills |
| **Cancelled quantity** | Sum of quantities on cancelled order lines of that item |
| **Items cancelled** | Count and line total of cancelled order lines |
| **Quantity** | The quantity on one line |
| **Invoice number** | The bill number, like `CFA/C/22442` |
| **Status** | Paid, On Hold, Unpaid, Voided, or "Missing number" in the invoice register |
| **Void reason** | The fixed void reason's label, and its note |
| **Cancel reason** | The fixed cancel reason's label, and its note |
| **Stage** | Cancelled before preparation, or Cancelled after preparation |
| **Time issued** | When the bill was issued, `billedAt`, in India time |
| **Time paid** | When the bill was fully paid, `paidAt`, in India time |
| **Time** | When the event on that row happened, in India time |
| **Paid with** | The payment methods of a bill, by their frozen names |
| **Tax rate** | A GST rate, like 5% |
| **Tally code** | The payment method's Tally ledger code, frozen on the payment |
| **Hour** | An hour of the day in India time, from when bills were issued |
| **Weekday** | Monday to Sunday, from the business date |
| **Period** | The business dates a payout covers |
| **Open tables** | Tables with an order that is open or waiting for the cashier |
| **Same weekday last week** | The bill total one week earlier, up to the same time of day |
| **Turns per day** | Bills on a table ÷ business dates in the range |
| **Percent off** | Discount ÷ item total, on one bill or a group of bills |
| **Applied by** | The person who applied a discount |
| **Cancelled by** | The person who cancelled a line or an order |
| **Voided by** | The person who voided a bill |
| **Requested by** | The captain who opened a No Charge order |
| **Closed by** | The person who closed a business day |
| **Account** | An On Hold account, like "W-330 Office" |
| **Opening balance** | What an account owed when it was set up in this system |
| **Charged** | Bill totals put on an account |
| **Collected** | Collections received against an account |
| **Outstanding** | Opening balance + charged − collected, ± adjustments |
| **Oldest unpaid bill** | The business date of the oldest charge not yet covered by collections, and its age in days |
| **Line total** | Defined in section 2; on a cancelled line it is the value at menu price, before GST |
| **Figure** | One named number on a day's report, like Net sales or Paid out. The first column of R2's sections. |
| **Count** | How many, on a line of R2: bills, covers, cancelled items |
| **Value** | A figure's money, on a line of R2, in rupees |
| **Discounted bills** | A count of bills with a discount above zero |
| **Cancelled value** | Line total of cancelled items at menu price, before GST, whether or not they were prepared |
| **Items made** | Quantity on kitchen ticket lines marked ready |
| **Item total before discount** | Item total, named in full where a discount sits beside it (R14) |
| **Bill total after discount** | Bill total, named in full where a discount sits beside it (R14) |
| **No Charge value, before GST** | No Charge value, with its basis in the header (R16) |
| **No Charge reason** | The fixed No Charge reason's label, and its note |
| **Age in days** | Days from the oldest unpaid bill's business date to the date the accounts are read as of |

---

## 14. Appearance words

Added by P22 for the Appearance page, the activity log and the sign-in screen.

| Term | Meaning |
|---|---|
| **Logo** | The restaurant's logo image. Shown only on the sign-in screen, the top bar, the rail and the browser tab. |
| **Logo for light screens** | The `LIGHT_GROUND` slot: dark artwork on a transparent background, shown by day |
| **Logo for dark screens** | The `DARK_GROUND` slot: light artwork, shown by night and on the sign-in screen |
| **Upload** | Choose an image file and save it as a logo |
| **Remove** | Clear a logo slot. The activity log keeps what was removed. |
| **No logo** | A slot with no image |
| **Brand colours** | The logo's own background colour and the colour of text on it |
| **Brand colour** | The logo's own background colour, `brandHex` |
| **Text on the brand colour** | The colour of text on the brand colour, `onBrandHex` |
| **Neutral tone** | Which set of page, card and text colours the restaurant uses |
| **Cool** | The default neutral tone: green-grey |
| **Warm** | The linen and espresso neutral tone |
| **Logo set** | The activity log line `BRAND_LOGO_SET` |
| **Logo removed** | The activity log line `BRAND_LOGO_REMOVED` |

---

## 15. Online words

Added by P23 for the public page, the staff inbox and the alert.

| Term | Meaning |
|---|---|
| **Online order** | A takeaway request a guest placed on the restaurant's own page. It is not an order until a staff member accepts it. Reference like `W-42`. |
| **Booking** | A table reservation, from the page or from a phone call. Reference like `R-17`. Use this word on screens. "Reservation" is the field and API name. |
| **Waiting** | An online order or booking request nobody has answered yet |
| **Accept** | Turn an online order into a takeaway order, and by default send it to the kitchen |
| **Confirm** | Agree to a booking, optionally on a table |
| **Decline** | Refuse a request, with a reason the guest sees |
| **Expired** | Nobody answered in time. The guest is asked to call. |
| **Seat** | Open the booking's table, which starts a dine-in order |
| **No-show** | A confirmed booking whose guests did not come |
| **Pickup time** | When the guest will collect a takeaway |
| **As soon as possible** | Pickup at the earliest time the cafe allows: now plus the lead time |
| **Answer within** | How long staff have to accept or decline before a request expires |
| **Paused** | The page is not taking takeaway orders for a while. Bookings still come in. |
| **Reserved** | On a floor tile: the table has a confirmed booking soon |
| **Party size** | How many people a booking is for. Becomes the order's covers when seated. |
| **Quote** | The prices and estimated bill total the guest saw before placing. The bill is worked out again when the order is accepted. |
| **Estimated bill total** | The quote's bill total, item total plus GST, rounded. The words on the page are "Estimated bill total". |
| **Page address** | The link to the restaurant's public page, like `/r/cafezza` |
| **Online alerts** | The chime, the spoken line and the banner for waiting requests, per device |
| **Offers consent** | The guest ticked the box agreeing to offers and news by SMS or WhatsApp |
| **Pay online** | Pay in advance on the cafe's page, through the cafe's own Razorpay account |
| **Paid online** | The payment method an advance becomes on the bill |
| **Advance** | Money paid online before the bill exists: a takeaway in full, or a booking deposit |
| **Deposit** | A booking's advance: people × the deposit per person |
| **Apply advance** | Put the advance on the bill as a payment |
| **Refunded** | Paid online and returned to the guest in full, or in part |
| **Forfeited** | A deposit kept, because the guest cancelled too late or did not come |
| **Waiting for payment** | Placed on the page and not yet paid. Staff do not see it. |

---

## 16. Cashier and integration words

Added by P25.

| Term | Meaning |
|---|---|
| **Cash count** | How many of each note and coin were counted. The server adds them up; a total typed beside it must agree. |
| **Tendered** | The cash a guest handed over for a bill, counted by notes or typed |
| **Change** | Tendered minus the amount applied to the bill, handed back. Never recorded as a payment. |
| **Refund owed** | Card, UPI or platform money to return to a guest after an item was cancelled on a paid bill. Recorded as done by a manager, with a reference. It moves no money in this system. |
| **Print request** | A captain asking for a bill to print on the counter's printer |
| **Bill printer** | This device's printer setting: Thermal 80 mm, Thermal 58 mm, A4 or A5 |
| **Duplicate** | Printed at the top of a bill from its second print on |
| **Platform order** | An order a delivery platform sends through an integration, before and after it becomes our delivery order. Not an online order, which comes from the restaurant's own page. |
| **Order channel** | A delivery platform connected to receive orders: Swiggy, Zomato, or the sandbox platform |
| **Sandbox platform** | A practice order channel that behaves like a platform, for testing and training. Never in production. |
| **Item mapping** | Which of our dishes, size and extras a platform's item is |
| **Payment terminal** | A card machine connected to the bill screen, like a Pine Labs machine |
| **Terminal payment** | One attempt to take a payment on the card machine, from sending the amount to approved, declined, cancelled or expired |
| **PTRID** | Pine Labs' reference for an amount sent to the machine. The cashier picks or types it on the machine. |
| **Tally voucher** | One entry sent to Tally: a sales, receipt or payment voucher, with debits equal to credits |
| **Ledger mapping** | Which Tally ledger each figure goes to: sales by rate, GST, round-off, each payment method, On Hold, paid in and out |
| **Tally bridge** | A small program on the computer that runs Tally. It fetches vouchers from our server and posts them into Tally. |
| **Integration user** | The restaurant's automatic user, like "Swiggy (automatic)", that integrations act as. It cannot sign in. |

