# Restaurant ERP

MERN stack. REST API. Multi-tenant SaaS for restaurants in Ahmedabad.
Two developers: Arya and Rishi. One person owns one module fully.

## Read these before doing anything

@docs/BUILD-PLAN.md
@docs/PROJECT-STATE.md
@docs/API-CONTRACT.md
@docs/DB-SCHEMA.md
@docs/CONVENTIONS.md

API-CONTRACT.md and DB-SCHEMA.md exist as of M0 part B and are the specification. Do not invent their contents. If a task needs a field or endpoint that is not in them yet, stop and say so instead of adding it.

## Non-negotiable rules

Every database record has a `restaurantId`. Every query filters by it. No exceptions.
Store all money as whole paise integers. Never as a decimal or float.
Copy price, item name, and tax rate into the order when it is created. Never read them live from the menu at bill time.
Check permissions on the server for every endpoint. Hiding a button in React is not security.
Never hard delete a bill, order, or stock entry. Mark it cancelled or voided and keep it.
Bill numbers are generated on the server, are sequential, and are never reused.
Secrets live in `.env`. `.env` is in `.gitignore`. Never commit a real secret.
Store timestamps in UTC. Convert to India time only for display.
GST rates are settings, never hardcoded.

## Scope discipline

Only the modules listed as in-scope in PROJECT-STATE.md are being built.
If asked for something outside that list, say so instead of building it.

## End of every session

Update `docs/PROJECT-STATE.md` with what changed.
This file is how the other developer and other chats find out what happened here.
Do not skip this.
