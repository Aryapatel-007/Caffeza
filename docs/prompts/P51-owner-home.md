# P51 The owner's home: today at a glance

**Asked for by:** Rishi, 2026-10-15, with a mock-up: "we have to build the owner dashboard because the owner is only interested in the important stats for his account; the homepage should be this."
**Modules:** M19, M20.
**Depends on:** P18 (R1 Today), P15 (R2 Day Close report), P16 (R4 By hour), P44 (Day End).

## What the owner sees

Signed in as the owner, `/dashboard` is one column of cards, phone first, in this order:

1. **Today**, the business date, and "Day open · figures to 9:42 PM" (or "Day closed").
2. **Bill total**, large, with Net sales and GST under it.
3. Three cards: **Bills** with the average bill, **Covers** with the average per cover, **Unpaid** with how many bills. Unpaid above zero shows the Open state's icon and colour with the word.
4. **Where the sales came from**: R2's order types, each with its bill total and a bar; platform delivery rows by platform.
5. **Where the money went**: R1's money rows, each payment method, On Hold by account and Unpaid, with a bar, and the total.
6. **By hour**: R4's net sales per hour as a column chart, the busiest hour named, with its table twin.
7. **Watch list**: R2's controls: items cancelled, wasted value, discounts, voided bills, No Charge, orders cancelled; each opens its report.
8. The **balance seal** with R2's checks.
9. **Day End**, the one primary button, to `/day-end`.

Every other role keeps today's home. Nothing on the server changes.

## Built differently from the mock-up

The design system decides the look: tokens, never the mock-up's hex colours; Anek and the product's own fonts, never Google Fonts; numbers through `Money`. Bars and columns are one colour (`ink`), as every chart is, so colour never stands for a category (DESIGN-SYSTEM rules 1 and 9); the accent is only for the Day End button. The restaurant's own wordmark heads the page, never a name written in. No percentage text: a share is the server's to work out (GLOSSARY section 12), and the bar shows the proportion. Delivery by platform is its own rows, as R2 gives them, so the screen adds up no money.

## Tests

A browser test as the owner on a phone, at the golden day's 11:00 PM: Bill total ₹9,269.00, Net sales ₹8,886.32, GST ₹382.57, the order types, the money rows, an hour chart, the watch list, the seal, Day End, and no sideways scroll. A manager still sees the old home.
