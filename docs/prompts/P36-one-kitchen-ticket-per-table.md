# P36. One kitchen ticket per table

Asked for by Arya on 2026-10-11, after trying P35 locally: "for one table
different kots are created, i dont want this, i want a single kot only". Asked
which "one" was meant, Arya chose **one ticket per table for its whole visit,
all rounds and all stations together**: dishes sent later are added to the same
ticket.

Model: Opus. Modules: M2 (firing), M18 (stations, the kitchen screen, the
printed ticket), M19 (R13 kitchen time), M7 (one setting).

## 1. What changes

Today one Send makes one ticket per station, and every later Send makes more.
A table that orders bhel, roti and a soda, then more roti, has four tickets.

From P36 an order has one ticket:

1. The first Send makes it, with a KOT number.
2. Every later Send adds its dishes to that ticket, as a new **round**, under the
   same KOT number. Nothing new is numbered.
3. Each dish on the ticket keeps the station that makes it, frozen when it was
   sent, and the time and round it was sent in.
4. A station's screen shows the ticket with only that station's dishes, and
   only while one of them is still to make. Marking the whole ticket ready from
   a station's screen marks only that station's dishes.
5. A station's tablet with auto-print on prints each round once, with only that
   station's dishes: "KOT 12  ROUND 2". A reprint without a round prints the
   whole ticket.
6. A ticket that comes back with a new round is measured from the oldest dish
   still to make, not from the first round, so it is not "late" on arrival.

It is a setting, `settings.kitchen.oneTicketPerOrder`, default on for every
restaurant, so the kitchen can go back to P05's ticket per station and per Send
without a deploy. Off, firing is exactly P05's.

## 2. Unchanged

Order lines, bills, KOT numbers already issued, stock deduction (still once per
line at its Send), cancelling a sent dish (still cancels its ticket line), undo
(P29), ready means served (P29), the platform's "food is ready" call, and the
live channel (P33).

## 3. Spec

API-CONTRACT "P36 One kitchen ticket per table", DB-SCHEMA section 46,
GLOSSARY section 23. Additive only: every new field has a default, and a ticket
written before P36 reads exactly as before.

## 4. Tests

1. Two Sends on one table make one ticket with one KOT number, two rounds, and
   every order line pointing at it.
2. A Send across two stations makes one ticket; each station's list shows it,
   and marking the whole ticket ready for one station leaves the other's dishes
   pending.
3. The ticket text for round 2 and one station holds only that round's dishes for
   that station, headed `ROUND 2`.
4. With the setting off, P05's tickets per station and per Send, as before.
5. A ticket written before P36 (no line stations) still filters by its station.
6. R13's kitchen section is unchanged on the golden day, and counts a round by
   its own send time.
7. The whole suite and the golden day still pass.
