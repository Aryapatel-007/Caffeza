# P44 The Day End summary, and the day-end message by email

**Asked for by:** Rishi, 2026-10-14, with photos of PetPooja's Day End Summary that Z Chaat's manager is used to, and the WhatsApp message the manager sends each night. Answers to the questions asked: send automatically at Day Close and on a button; no Resend domain yet; Occupancy is seats filled; the screen in PetPooja's three steps.
**Modules:** M16 (Day Close), M7 (settings), M19 (the month's sales through the report engine).
**Depends on:** P10 (Day Close), P29 Part F (the cash book), P43.

## A. The Day End page

`/day-end`, OWNER and MANAGER, in three steps, as PetPooja's: **Overview**, **Cash**, **Close**. It reads `GET /day-close/:businessDate` and changes nothing the Day Close page does not already change.

1. **Overview.** A date picker, then cards: Bills (count and bill total), Cancelled (items and orders, count and value), No Charge (count and value), Voided bills (count and value), Discounts (count and total), Due (On Hold plus unpaid). Then the details, in rows as PetPooja lists them: item total, discount, net sales, CGST, SGST, round-off, bill total; average per cover, average bill, covers; order types (bills, net sales, bill total); payment methods.
2. **Cash.** The cash book's sum, one box per term: brought forward (or opening float), plus cash sales, cash collections and top-ups, minus expenses and cash taken out, equals cash in drawer. Each box opens the cash book. A manager who may not see the drawer total sees "Counted at close" in its place, as the cash book shows.
3. **Close.** The count and the cash kept for tomorrow, through the cash book's existing Close the day sheet. A closed day says who closed it and when.

Every step shows **the day-end message** (B): the text, **Copy** (for WhatsApp), and **Email this report**.

The manager's main place "Day Close" opens the Day End page. `/day-close` stays, for history and the owner's reopen.

## B. The day-end message

Plain text, in Z Chaat's own words (GLOSSARY section 29), from the day's figures (the same `computeDayFigures` as Day Close and R2) and the month's bill total (R3 through the report engine):

```
Z Chaat
13-October-2026

Gross Sale - 5,826
Tax - 278
Net Sale - 5,548

Cash - 1,943
Card - 0
UPI - 2,594
Other (Zomato dine out) - 906
Due payment - 0
Total exp - 1,100
Today APC - 370
Today Pax - 15
Grand Total Cash in hand - 31,828
Total Petty Cash - 31,828
Occupancy - 15 pax / 74 seats (20%)
Monthly Till Date sale - 4,71,154
Daily Average - 33,653
```

Whole rupees, Indian grouping, rounded half away from zero. One line per active payment method in display order, its frozen name; Other is split by its mode (P43) as "Other (mode)". Due payment is On Hold plus unpaid. Total exp is the day's expenses. APC is average per cover; Pax is covers. Cash in hand is the counted cash once the day is closed, else the cash in drawer now; Petty Cash is the cash kept for tomorrow once closed, else the same as cash in hand. Occupancy is covers against the seats of active tables that have a seat count, with the whole percent. Monthly Till Date is the bill total from the 1st of the month to the date; Daily Average is that over the days from the 1st to the date.

## C. Email

`settings.reports.dayEndEmails`: up to five addresses, set by the owner in Settings, Reports. When a day is closed, the message is emailed to them by itself, after the close is saved: a failure never undoes the close, and is kept on the closure. **Email this report** sends any day's message to the same addresses, never anywhere else.

Sent through Resend with `RESEND_API_KEY`, from `DAY_END_EMAIL_FROM`. Until a domain is verified in Resend, Resend delivers only to the address its account was made with.

## Tests

The golden day's message, line by line, against TEST-DATA; Other split by mode; a closed day uses the count and the kept cash; a blind manager's preview hides cash in hand; the email reaches a fake Resend with the configured addresses only; closing a day sends it, and a Resend failure leaves the day closed and the error kept; no addresses or no key is a plain 422; settings refuse a bad address. Browser: the Day End page's three steps, Copy and Email this report.
