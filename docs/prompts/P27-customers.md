# P27. Customers: guest details at the table, for CRM

Model: Opus, high. Owner: Rishi. Depends on: P23 (offers consent), P26.

## Why

Z Chaat asked to take the guest's details when seating a table, to build a
customer list for offers and repeat visits. Online orders and bookings already
take a name, a phone and the guest's offers consent (P23); a table seated at
the door takes nothing.

## What to build

1. **Seating asks for the guest.** The Seat guests panel gains three optional
   fields under the guest count: Guest name, Mobile number, and "The guest
   agrees to offers and news by SMS or WhatsApp", which can be ticked only when
   a mobile number is given, and only when the guest says yes. `POST /orders`
   for a dine-in order takes `customerName`, `customerPhone` and
   `offersConsent`, as a takeaway already takes the first two.
2. **A customer per phone number.** `customers`, one per restaurant and phone,
   with the name, first and last visit, visit count, and the offers consent
   with its history: given or withdrawn, the consent text version, when, how
   (`STAFF` at the table, `ONLINE` from the page), and by whom. Every order
   opened with a phone records a visit: seated tables, takeaways, delivery
   orders typed in, accepted online orders and seated bookings. Consent is
   recorded only when given; a visit without the tick never withdraws it.
3. **The Customers screen**, OWNER and MANAGER, under Reports: the newest
   visits first, a search by name or phone, a filter for those who agreed to
   offers, and each customer's visits with their bill totals. A manager can
   correct a name and record a withdrawal of consent. The owner can download
   the customers who agreed to offers as a CSV, which is audited.
4. **Personal data.** A phone never goes in a URL, a log line or an audit
   line. Search is a POST. The download is the owner's alone.

## Tests

1. A dine-in order with a name, phone and consent makes a customer with one
   visit and consent given, version and source STAFF.
2. A second order with the same phone counts a second visit and keeps the
   consent; an order without the tick does not withdraw it.
3. A consent without a phone is 400. A dine-in name without a phone is kept on
   the order and makes no customer.
4. An accepted online order and a seated booking record a visit with the
   guest's own consent, source ONLINE.
5. Search by name and by the last digits of a phone; the consent filter.
6. Withdrawal by a manager is kept in the history; the export lists only those
   with consent, is the owner's alone, and is audited without phones.
7. Roles and tenancy: a waiter and another restaurant see nothing.
8. A browser test: a captain seats Table 2 with a guest's details, and the
   owner finds the guest on the Customers screen.
