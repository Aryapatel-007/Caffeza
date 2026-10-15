# P51 The owner's dashboard, beside the ERP

**Asked for by:** Rishi, 2026-10-15, with the dashboard's code: "we have to build the owner dashboard because the owner is only interested in the important stats for his account." Then, the same day: "for the owner two things, one the dashboard and the portal, our ERP: when the owner logs in he should see the dashboard with the important stats, and if he wants to see the details then he will surf in the ERP; the UI for the dashboard I gave you the code."
**Modules:** M19, M20.
**Depends on:** P18 (R1 Today), P15 (R2 Day Close report), P16 (R4 By hour), P44 (Day End).

## Two places

1. **The dashboard**, `/owner`, owner only. Its own page, outside the ERP's frame: no rail, bottom bar or top bar. Signing in, or opening the address alone, takes the owner here.
2. **The ERP**, everything as it was. **Open the ERP** at the foot of the dashboard goes to the ERP's home (`/dashboard`); **Dashboard** in the ERP's menu (More, Service) comes back. Every other role signs in to the ERP's home as before.

## The dashboard

Rishi's design, top to bottom: the restaurant's name and the date; **Today**, "Day open · figures to 9:42 pm" or "Day closed"; **Bill total** with Net sales and GST; **Bills** (average), **Covers** (each) and **Unpaid** (bills), amber when above zero; **Where the sales came from**, R2's order types, each with a bar and "60% of total · 12 bills"; **Where the money went**, a bar split by R2's money in hand methods, Platform money, On Hold by account and Unpaid, then each with its amount and the Total; **By hour**, R4's net sales from the first bill's hour to the last, the busiest in the darkest step, with its table; **Watch list**, cancelled after preparation (wasted value), discounts, voided bills, No Charge, each opening its report; the checks strip, green when all pass and linking to the day's report when not; **Day Close**, to `/day-end`; **Open the ERP**.

It refreshes every minute. Nothing on the server changes.

## Its look

The design's colours are the page's own tokens under `[data-owner]` in `index.css`, as the public page has `[data-public]` (P38): grey page, white cards, five indigo steps, amber, red and green. Its fonts are the product's own, Anek and IBM Plex Mono, served from our server, not Google's. Money goes through `Money`. The percents are captions worked out by the largest remainder method so they add up to 100 (`utils/wholePercents.js`); the amounts are the server's. Delivery by platform is its own rows, as R2 gives them, so the page adds up no money.

## Tests

A browser test: the owner signs in on a phone and lands on the dashboard with no ERP menu; after one paid and one unpaid bill it shows the bill total, Bills 2, Unpaid with 1 bill, Dine-in at 100% of total, Cash, Unpaid and Total, the busiest hour, the watch list, the checks and Day Close, with no sideways scroll; Open the ERP goes to the ERP's home and its menu's Dashboard comes back. A manager signs in to the ERP's home.
