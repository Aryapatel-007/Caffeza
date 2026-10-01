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
| **On Hold bill** | A bill charged to a named account, to be collected later | Yes, on the day it was issued |
| **Voided bill** | A bill cancelled after it was issued. It keeps its number and is shown in the invoice register. | No |
| **No Charge order** | Food given free, with a reason and an approver. It gets no invoice number. | No |
| **Cancelled item** | A line cancelled before the bill was issued | No |
| **Cancelled order** | A whole order cancelled before billing | No |

---

## 6. Money received

| Term | Meaning |
|---|---|
| **Payment method** | How a bill was settled. Caffeza has eight. See `docs/CAFFEZA-PROFILE.md` section 10. |
| **Money in hand** | Methods where the money is already the cafe's: Cash, Card, UPI |
| **Platform money** | Methods where a platform collected the money and pays the cafe later, minus commission: Zomato Gold, Dineout, EazyDiner, Zomato, Swiggy |
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
| **Platform-paid GST** | On a platform delivery order, the platform pays the GST under section 9(5). Our bill shows 0% GST. |
| **Discount funded by** | Who paid for a discount: the restaurant, or the platform |
| **Commission** | The platform's cut, as a percent of the bill total. `TO CONFIRM` per platform. |
| **Expected payout** | Bill total minus commission |
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
