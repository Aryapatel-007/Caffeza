# PROJECT PLAN

This file is everything Claude Code needs to know about this codebase, in one place.

It merges: the non-negotiable rules, the build plan and scope, the coding conventions, the full API contract, and the full database schema.

It does not contain current progress. That lives in `docs/PROJECT-STATE.md`, which changes every session and is imported separately so this file does not need editing just because a module finished.

Read `docs/PROJECT-STATE.md` alongside this file, always, for what is actually built versus what is planned here.

Modules covered so far: M0 Foundation, M1 Menu Management, M2 Order Taking and KOT. M3 through M6 are scoped in Part 2 but do not have a contract or schema yet.

---

## PART 1: NON-NEGOTIABLE RULES

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


---

## PART 2: BUILD PLAN


This file holds the full scope, the security requirements, and the list of problems teams like ours usually miss.

It does not change often. When it does change, the change is made in the brain chat and logged in PROJECT-STATE.md.

Last updated: [DATE] by [NAME]

---

## 1. What we are building

A multi-tenant SaaS restaurant ERP for independent restaurants in Ahmedabad.

Multi-tenant means one running copy of the software serves many restaurants at once. Each restaurant sees only its own data.

Stack is MERN. MongoDB, Express, React, Node. The API is REST.

Two developers, Arya and Rishi. One person owns one module fully, backend and frontend.

---

## 2. Who it is for

Independent sit-down and quick-service restaurants in Ahmedabad. Roughly one to three outlets. Ten to forty staff.

They currently run three or four disconnected things at once. A billing app. A paper attendance register. A notebook for stock. WhatsApp for everything else.

They are not comparing us to nothing. They are comparing us to Petpooja. That sets the quality bar for billing and printing.

---

## 3. In scope for version 1

Only M0 to M6. Nothing else.

### M0 Foundation: auth, roles, tenancy
Owner: Rishi.

Login, session handling, the user record, the restaurant record, the branch record, and the permission check that every other module calls.

This is the module everything else sits on. Nothing else starts until this is done and reviewed.

### M1 Menu Management
Owner: Arya.

Categories, items, price, variants, add-ons, tax rate per item, and a fast mark-unavailable toggle.

Every other module reads from here, so it must be correct before M2 starts.

### M2 Order Taking and KOT
Owner: Rishi.

Create an order against a table or a takeaway slot. Add and remove lines before the order is fired. Send to kitchen. Kitchen marks items ready.

The order copies price, item name, and tax rate at the moment it is created.

### M3 Billing with GST
Owner: Rishi.

Turn a finished order into a bill. Apply GST correctly. Record the payment method used. Print. Void with a reason.

Needs a chartered accountant to review the GST output before any pilot goes live.

### M4 Inventory with recipe deduction
Owner: Arya.

Raw ingredients with a stock level. A recipe per menu item. When a dish sells, deduct its ingredients automatically. Low stock alerts. Manual stock adjustment with a reason.

This is the hardest logic in the version 1 build.

### M5 Employee Attendance
Owner: Arya.

Staff clock in and out. The system stores exact hours worked. A manager can correct an entry, and the correction is logged, not silent.

### M6 Reports and Dashboard
Owner: Rishi.

Sales by day, best selling items, slow hours, discount given away, stock consumed, hours worked. All read-only. All built on data the other modules already produce.

---

## 4. Out of scope for version 1

The module catalog lists 34 modules. Twenty seven of them are not being built now.

The ones most likely to be asked for, and why they are out:

| Module | Why not now |
|--------|-------------|
| Payroll | Provident Fund, ESI, Gujarat Professional Tax and TDS must be exactly right. Getting it wrong is a legal problem for our client, not a bug for us. Needs a CA and its own build. |
| Payment gateway integration | The restaurant keeps its existing UPI QR and card machine. We record which method was used. We do not move money. |
| Zomato and Swiggy integration | High value, but it depends on partner API access and approval we do not have yet. |
| WhatsApp ordering and marketing | Needs a Business API provider and template approval. Not a code problem, a vendor problem. |
| QR self-ordering | Depends on M1 and M2 being stable and battle tested first. |
| Purchase orders and vendors | Only useful once inventory numbers are trusted. That is after a real pilot. |
| Multi-outlet dashboards | The data model supports branches from day one. The cross-branch reporting screen is not built yet. |
| Anything AI | Forecasting and menu costing are the real wedge later. They need months of real order history to be worth anything. |
| Offline mode | A web app cannot work offline in any way a restaurant would trust. This belongs to a later Android app. |

If a request does not map to M0 to M6, say so plainly. Do not build it.

Saying yes to everything is how small teams finish nothing.

---

## 5. Build order and dependencies

```
M0 Foundation
   |
   +--> M1 Menu ------> M2 Orders and KOT ------> M3 Billing
   |                          |                       |
   |                          +--> M4 Inventory <-----+
   |
   +--> M5 Attendance
   |
   +--> M6 Reports  (needs M3 and M5 producing real data first)
```

Rules that follow from this diagram:

M0 must be finished and reviewed before anything else starts.

M2 cannot start until M1 is stable, because M2 copies data out of M1.

M4 needs M1 for recipes and M2 for the sales event that triggers deduction.

M6 is built last. It reads. It never writes.

M5 is independent of the ordering chain. Arya can build it in parallel while waiting on M1 review.

---

## 6. Non-negotiable rules

These are the same rules that live in CLAUDE.md. They are repeated here because this file is the one we hand to anyone new.

**Tenancy.** Every database record has a `restaurantId`. Every single query filters by it. There is no exception, not even for a lookup table.

**Money.** All money is stored as a whole integer number of paise. Never a decimal. Never a float. One hundred rupees is stored as `10000`.

**Copied values.** When an order is created, it copies the price, the item name, and the tax rate into itself. It never reads them live from the menu at bill time. If the owner changes a price at 8pm, the bill for the 7pm order must still show the 7pm price.

**Server-side permissions.** Every endpoint checks permission on the server. Hiding a button in React is not security. It is a hint.

**No hard deletes.** A bill, an order, or a stock entry is never removed from the database. It is marked cancelled or voided, with a reason and the user who did it. The row stays forever.

**Bill numbers.** Generated on the server. Sequential per restaurant. Never reused, not even after a void.

**Secrets.** Live in `.env`. `.env` is in `.gitignore`. A real secret is never committed. If one is committed by accident, it is rotated, not just deleted from the next commit.

**Time.** Stored in UTC. Converted to India Standard Time only when displayed.

**GST.** Rates come from settings and from the item record. Never hardcoded in the application code.

---

## 7. Security requirements

**Tenant isolation is the whole product.** If restaurant A can ever see restaurant B's data, we do not have a business. Treat a leak here as the worst possible bug.

`restaurantId` comes from the login token on the server. It is never taken from the request body, the query string, or a header the client controls. If a client sends a `restaurantId`, ignore it.

Every database query goes through a helper that adds the tenant filter. Do not hand-write raw queries per route, because one forgotten filter is a leak.

Every write endpoint also checks the record it is about to touch belongs to the caller's restaurant. Filtering on read is not enough. An update by ID must confirm ownership first.

**Passwords** are hashed with bcrypt or argon2. Never stored in any readable form. Never logged. Never returned in an API response.

**Tokens** are signed on the server. The secret is in `.env`. Access tokens are short-lived. Refresh tokens are stored hashed in the database so a session can be revoked when a staff member leaves.

**Rate limiting** on login. A shared restaurant tablet is a soft target for someone trying PINs one after another.

**Input validation** happens on the server for every field on every endpoint. The React form check is for the user's convenience only.

**Money and quantity fields** are validated as integers within a sane range before they touch the database. A negative price or a quantity of ten million must be rejected at the edge.

**Audit trail** on anything that involves money or trust. Voiding a bill, applying a discount, correcting an attendance entry, adjusting stock. Each one records who did it, when, and why. This is the feature that sells the product to an owner who is losing money to a dishonest cashier.

**Employee personal data** is a legal responsibility. We hold names, phone numbers, and hours worked for other companies' staff. India's Digital Personal Data Protection Act applies to us as the processor. We are not building a full compliance layer in version 1, but we do not make it harder for ourselves later. That means no personal data in logs, and no personal data in URLs.

**No personal data in URL paths or query strings.** URLs end up in server logs, browser history, and analytics. Use the request body.

**Error messages to the client are generic.** Stack traces and database errors go to the server log, not to the browser.

---

## 8. Problems teams like ours usually miss

This list exists because every one of these is cheap to handle now and expensive to handle after a pilot has started.

**The price change problem.** Owner raises the paneer price at 8pm. A table that ordered at 7pm gets billed at the new price. The customer argues. This is why orders copy price. Already a rule, listed here so nobody forgets why.

**The two waiters problem.** Two waiters open the same table on two tablets at the same time and both add items. One overwrites the other. This is still an open question in PROJECT-STATE.md and must be answered before M2 is designed.

**The business day problem.** A restaurant that closes at 1am wants those sales counted under yesterday. If the business day starts at midnight, every late night sale lands on the wrong day and every report is wrong. Open question. Must be settled before M3 and M6.

**The unit conversion problem.** Paneer is bought in kilograms and used in grams. If the recipe and the stock record disagree on units, every deduction is off by a factor of one thousand. Open question. Must be settled before M4.

**The partial order problem.** A table orders starters, then mains twenty minutes later, on the same bill. The order cannot be a single frozen thing created once. It has to accept additions after the first KOT is fired.

**The cancelled item problem.** A dish is fired to the kitchen, then cancelled. Was it cooked? If yes, the ingredients are gone and stock must still be deducted. If no, they are not. The system has to know the difference.

**The rounding problem.** GST on a bill produces fractions of a paisa. If we round each line separately and then add, we get a different total than if we add and then round. Pick one method, write it down, and use it everywhere. Otherwise the printed bill and the report will disagree by a rupee and nobody will trust either.

**The printer problem.** Thermal receipt printers are unforgiving. Character width is fixed. A long dish name wraps and destroys the layout. Test on the real printer early, not the week before the pilot.

**The sequential number gap problem.** Bill numbers must have no gaps. If the server crashes between reserving a number and saving the bill, a number is lost. Decide how the number is reserved so this cannot happen.

**The timezone display problem.** Storing UTC is correct. Forgetting to convert on one screen means a report shows 2:30am for a 8:00am shift. Convert in one shared place, not in each component.

**The soft delete leak.** Once nothing is hard deleted, every list query has to exclude the voided rows. Forget once and a cancelled order shows up in the sales total.

**The seed data gap.** A brand new restaurant with an empty menu cannot take an order. Someone has to decide what a fresh account starts with.

**The staff turnover problem.** Restaurant staff change often. A user record has to be deactivatable without deleting the attendance history attached to it.

---

## 9. When is a module done

A module is not done because the code runs.

It is done when all of the following are true:

Every endpoint in API-CONTRACT.md for that module exists and returns the exact shape written there.

Every field in DB-SCHEMA.md for that module exists with the right type.

Permission is checked on the server for every endpoint, and it has been tested by calling the endpoint directly with the wrong role.

Tenant isolation has been tested by calling an endpoint with a valid token from restaurant A against a record ID from restaurant B. It must fail.

Server-side validation rejects bad input on every field.

The React screens for that module work on the actual device type it will be used on. Tablet for order taking. Desktop for reports.

PROJECT-STATE.md has been updated and pushed.

The other developer has read the code.

---

## 10. What has to be true before a real restaurant uses this

M0 through M6 are all done by the definition above.

A CA has reviewed the GST output on a real printed bill.

The bill prints correctly on the actual thermal printer model the pilot restaurant owns.

Tenant isolation has been tested by someone other than the person who wrote the module.

There is a backup of the database, and someone has actually restored from it once.

There is a way to reach a human when it breaks at 9pm on a Saturday.

---

## PART 3: CONVENTIONS


Naming, formats, and habits. Decided once so we never argue about them again.

If two modules end up looking different, it is because this file was not followed.

Last updated: [DATE] by [NAME]

---

## 1. Repo layout

```
/
  CLAUDE.md
  .gitignore
  .env.example
  README.md
  /docs
    BUILD-PLAN.md
    PROJECT-STATE.md
    API-CONTRACT.md
    DB-SCHEMA.md
    CONVENTIONS.md
  /server
    server.js
    /config
    /models          one file per collection
    /routes          one file per module
    /controllers     one file per module
    /services        business logic that is too big for a controller
    /middleware      auth, tenant filter, permission check, error handler
    /validators      input validation schemas
    /utils
  /client
    /src
      /api           one file per module, all fetch calls live here
      /components    shared components only
      /features      one folder per module
      /hooks
      /context
      /utils
      App.jsx
      main.jsx
```

No business logic in a route file. Routes wire a URL to a controller and nothing else.

No fetch calls scattered inside React components. They live in `/src/api`.

---

## 2. Naming

| Thing | Style | Example |
|-------|-------|---------|
| Folder | lowercase, dashes | `menu-management` |
| Server file | camelCase | `orderController.js` |
| React component file | PascalCase | `OrderCard.jsx` |
| React component | PascalCase | `OrderCard` |
| Variable and function | camelCase | `calculateBillTotal` |
| Constant | UPPER_SNAKE | `MAX_ITEMS_PER_ORDER` |
| Mongo collection | lowercase plural | `orders`, `menuitems` |
| Mongoose model | PascalCase singular | `Order`, `MenuItem` |
| Database field | camelCase | `restaurantId`, `createdAt` |
| Foreign key field | name plus Id | `restaurantId`, `menuItemId` |
| URL path | lowercase plural, dashes | `/api/v1/menu-items` |
| Environment variable | UPPER_SNAKE | `MONGO_URI` |
| Git branch | type slash module slash short-description | `feat/m2/create-order` |

Money field names always end in `Paise`. For example `priceInPaise`, `totalInPaise`.

This makes it impossible to look at a number in the code and wonder what unit it is in.

Boolean field names read as a statement. `isAvailable`, `isVoided`, `isActive`. Not `available` or `status`.

---

## 3. API shape

All routes start with `/api/v1`.

Version it from day one. Adding `v2` later is easy. Adding a version to a live unversioned API is not.

### Method meanings

| Method | Use |
|--------|-----|
| GET | Read. Never changes anything. |
| POST | Create a new thing. |
| PATCH | Change part of an existing thing. |
| PUT | Not used. We always use PATCH. |
| DELETE | Only for things that are genuinely disposable, like an unfired draft order line. Never for a bill, order, or stock entry. |

### URL rules

Plural nouns. `/menu-items`, not `/menu-item`.

The ID goes in the path. `/api/v1/orders/:orderId`.

Actions that are not simple create, read, or update get a sub-path.

```
POST   /api/v1/orders/:orderId/fire
POST   /api/v1/bills/:billId/void
PATCH  /api/v1/menu-items/:itemId/availability
```

Never put a `restaurantId` in a URL. The server gets it from the token.

Never put personal data in a URL. No phone numbers, no names, no employee IDs in a query string.

### Response envelope

Every response, success or failure, has the same outer shape.

Success:

```json
{
  "success": true,
  "data": { }
}
```

A list response puts the array in `data` and paging info beside it:

```json
{
  "success": true,
  "data": [ ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 213
  }
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Price must be a whole number of paise.",
    "fields": {
      "priceInPaise": "Must be an integer greater than zero."
    }
  }
}
```

`fields` is only present on validation errors. `message` is safe to show a user. It never contains a stack trace or a database error.

### Status codes

| Code | When |
|------|------|
| 200 | Read or update worked |
| 201 | Something was created |
| 400 | Input was bad |
| 401 | No valid token, or the token expired |
| 403 | Valid token, but this role is not allowed to do this |
| 404 | Not found, or it belongs to another restaurant |
| 409 | Conflict. For example a duplicate name, or an order already fired |
| 422 | Input was well formed but broke a business rule |
| 429 | Too many requests |
| 500 | Our fault |

Note on 404. If a record belongs to a different restaurant, return 404, not 403. A 403 confirms the record exists, which is an information leak.

### Error codes

Use a fixed string. Never let the frontend read the message text to decide what happened.

```
UNAUTHENTICATED
TOKEN_EXPIRED
FORBIDDEN
NOT_FOUND
VALIDATION_FAILED
DUPLICATE
BUSINESS_RULE_VIOLATED
RATE_LIMITED
INTERNAL_ERROR
```

Modules may add their own, in the same shape. For example `ORDER_ALREADY_FIRED`, `INSUFFICIENT_STOCK`.

### Paging

Every list endpoint takes `?page=1&limit=50`.

Default limit is 50. Maximum limit is 200. A request over the maximum gets clamped, not rejected.

---

## 4. Fields every collection has

These are on every single collection. No exceptions.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Mongo default |
| `restaurantId` | ObjectId | Indexed. Every query filters by it. |
| `createdAt` | Date | UTC. Set by Mongoose timestamps. |
| `updatedAt` | Date | UTC. Set by Mongoose timestamps. |

Anything that can be turned off rather than deleted also has:

| Field | Type | Notes |
|-------|------|-------|
| `isActive` | Boolean | Default true. |

Anything that can be voided or cancelled also has:

| Field | Type | Notes |
|-------|------|-------|
| `isVoided` | Boolean | Default false |
| `voidedAt` | Date | UTC |
| `voidedBy` | ObjectId | Links to users |
| `voidReason` | String | Required when voiding |

### Indexes

Every collection has a compound index starting with `restaurantId`.

For example, orders is indexed on `{ restaurantId: 1, createdAt: -1 }`.

An index that does not start with `restaurantId` is almost always a mistake.

---

## 5. Money

Stored as a whole integer number of paise. Always.

One hundred rupees is `10000`.

Never store a decimal. Never store a float. Never store a string.

All arithmetic on money happens in paise, as integers.

Conversion to rupees happens in one shared display helper on the frontend, and nowhere else.

Percentages, such as a GST rate, are stored as an integer in basis points. Five percent is `500`. Eighteen percent is `1800`.

This avoids `0.05` and `0.18` floating point problems entirely.

---

## 6. Dates and time

Stored in UTC. Always. Mongo does this by default if you pass a real `Date` object.

Displayed in India Standard Time, which is UTC plus five hours thirty minutes.

Conversion happens in one shared helper on the frontend. Not in individual components.

Never store a date as a string.

Never build a date from `new Date("2026-01-15")` without a timezone, because that is parsed differently in different places.

The business day is not the calendar day. Until we decide the rule, do not write any code that assumes a day starts at midnight. This is an open question in PROJECT-STATE.md.

---

## 7. Validation

Server-side validation is mandatory on every endpoint. Frontend validation is a convenience for the user, nothing more.

Use one validation library across the whole server. Zod.

Validation runs in middleware, before the controller. A controller can assume its input is already clean.

Rules that apply everywhere:

Trim every string before validating.

Reject empty strings where a value is required. `""` is not a value.

Every money field must be an integer, zero or greater, and below a sane ceiling.

Every quantity must be a number greater than zero.

Every ID must be a valid Mongo ObjectId before it touches the database.

Never trust an enum from the client. Check it against the allowed list.

---

## 8. Middleware order

The order matters. This is the order on every protected route.

```
1. rate limiter
2. authenticate       reads the token, attaches req.user
3. tenant             attaches req.restaurantId from the token, never from the body
4. permission         checks req.user.role against what this route needs
5. validate           checks the body against the Zod schema
6. controller
7. error handler      last, catches everything
```

No controller reads the token directly. It reads `req.user` and `req.restaurantId`.

---

## 9. Git

Branch names:

```
feat/m2/create-order
fix/m3/gst-rounding
chore/m0/add-rate-limit
```

Commit messages. One line, present tense, says what changed.

```
add order fire endpoint
fix gst rounding on split lines
```

Do not commit directly to `main`.

Do not commit `.env`, `node_modules`, or a build folder.

Pull before you start. Push when you stop.

One module, one owner, one branch at a time. Two people do not edit the same module.

---

## 10. React

Function components only. No class components.

One folder per module inside `/features`.

Server state comes through the API files in `/src/api`. Components do not call `fetch` themselves.

A component that is over roughly two hundred lines should be split.

Never decide permissions in React. Hide a button if you like, but the server is what actually stops the action.

Loading and error states are required on every screen that calls the API. A screen that shows nothing while loading looks broken during a Friday rush.

---

## 11. Environment variables

Every variable used anywhere is listed in `.env.example` with a fake value.

If you add a variable, add it to `.env.example` in the same commit, and tell the other developer.

The server refuses to start if a required variable is missing. Fail loudly at boot, not quietly at 9pm.

---

## 12. Logging

Log to the console on the server. Structured, not free text.

Never log a password, a token, a phone number, or an employee name.

Every error log includes the `restaurantId` and the route, so a problem can be traced to one tenant.

The client never receives a stack trace.

---

## 13. Testing minimum

We are not aiming for full coverage. We are aiming to not get burned.

Every module must have a written manual test for these three things, done before the module is called done:

Call the endpoint with no token. It must fail with 401.

Call the endpoint with a valid token from the wrong role. It must fail with 403.

Call the endpoint with a valid token from restaurant A, using a record ID that belongs to restaurant B. It must fail with 404.

Money and GST calculation logic gets real automated tests. That is the one place where a quiet bug costs a client money.

---

## PART 4: API CONTRACT


Base URL: `/api/v1`

Every response uses the envelope defined in `docs/CONVENTIONS.md` section 3. Status codes and error codes come from the same place.

`restaurantId` and `branchId` are never sent by the client. The server reads them from the access token. If a client sends them, they are stripped silently.

Last updated: [DATE] by [NAME]

---

# M0 Foundation

Owner: Rishi.

Split into three build tasks:

M0-A, plumbing. Done.
M0-B, authentication and provisioning. This document, sections 1 and 2.
M0-C, user management. This document, section 3.

---

## Token model

Access token. Lifetime 15 minutes. Sent as `Authorization: Bearer <token>`.

Payload, locked by M0-A and not changeable without touching the tenant middleware:

```json
{
  "sub": "<userId>",
  "role": "OWNER",
  "restaurantId": "<restaurantId>",
  "branchId": "<branchId>",
  "iat": 0,
  "exp": 0
}
```

Refresh token. Lifetime 30 days. Opaque random string, 64 bytes, base64url. Not a JWT.

Only the SHA-256 hash of a refresh token is stored. The raw value exists in the response body once and is never recoverable from the database.

Refresh tokens rotate. Every successful refresh issues a new one and revokes the old one.

---

## 1. Authentication endpoints

### 1.1 Login

```
POST /api/v1/auth/login
```

No authentication. Strict rate limiter applies.

Request:

```json
{
  "phone": "9876543210",
  "password": "correct horse battery"
}
```

Response 200:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "3f9a2c...",
    "expiresInSeconds": 900,
    "user": {
      "id": "652f...",
      "name": "Rishi Patel",
      "phone": "9876543210",
      "email": null,
      "role": "OWNER",
      "restaurantId": "652a...",
      "branchId": "652b..."
    },
    "restaurant": {
      "id": "652a...",
      "name": "Shreeji Dining Hall"
    },
    "branch": {
      "id": "652b...",
      "name": "Main"
    }
  }
}
```

Failure 401, error code `INVALID_CREDENTIALS`:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Phone number or password is incorrect."
  }
}
```

This exact response is returned for all four of these cases, with no difference in body, status, or response time:

The phone number does not exist.
The password is wrong.
The user has `isActive: false`.
The user's restaurant has `isActive: false`.

Never tell the caller which one it was. A different message for a deactivated account confirms the account exists. The real reason is written to the server log.

Password comparison runs even when the phone number is not found, against a dummy hash, so that response timing does not reveal whether a phone number is registered.

### 1.2 Refresh

```
POST /api/v1/auth/refresh
```

No access token required. The refresh token is the credential. Strict rate limiter applies.

Request:

```json
{ "refreshToken": "3f9a2c..." }
```

Response 200:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "8b1d4e...",
    "expiresInSeconds": 900
  }
}
```

Failure 401, code `INVALID_REFRESH_TOKEN`, for an unknown, expired, or already revoked token.

**Reuse detection.** If a refresh token that has already been revoked is presented, that means either a stolen token or a replayed one. Revoke every refresh token belonging to that user immediately, log at warn level, and return 401. The user is forced to log in again everywhere. This is intended.

### 1.3 Logout

```
POST /api/v1/auth/logout
```

Access token required. Any role.

Request:

```json
{ "refreshToken": "3f9a2c..." }
```

Response 200:

```json
{ "success": true, "data": { "loggedOut": true } }
```

Revokes only the supplied refresh token. Other devices stay logged in.

Returns 200 even if the token was already revoked or unknown. Logout must never fail in a way that leaves a user stuck on a POS screen.

### 1.4 Logout everywhere

```
POST /api/v1/auth/logout-all
```

Access token required. Any role.

No request body.

Response 200:

```json
{ "success": true, "data": { "sessionsRevoked": 3 } }
```

Revokes every refresh token for the calling user.

### 1.5 Current user

```
GET /api/v1/auth/me
```

Access token required. Any role.

Response 200:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "652f...",
      "name": "Rishi Patel",
      "phone": "9876543210",
      "email": null,
      "role": "OWNER",
      "restaurantId": "652a...",
      "branchId": "652b...",
      "lastLoginAt": "2026-08-28T14:22:11.000Z"
    },
    "restaurant": {
      "id": "652a...",
      "name": "Shreeji Dining Hall",
      "gstin": "24AAACS1234A1Z5"
    },
    "branch": {
      "id": "652b...",
      "name": "Main"
    }
  }
}
```

Reads live from the database, not from the token. A role changed five minutes ago must show here.

### 1.6 Change own password

```
PATCH /api/v1/auth/password
```

Access token required. Any role.

Request:

```json
{
  "currentPassword": "old one",
  "newPassword": "new one"
}
```

Response 200:

```json
{ "success": true, "data": { "passwordChanged": true } }
```

Failure 401 `INVALID_CREDENTIALS` if `currentPassword` is wrong.
Failure 422 `BUSINESS_RULE_VIOLATED` if `newPassword` equals `currentPassword`.

On success, revoke every refresh token for this user. The caller must log in again. A password change that leaves old sessions alive is not a password change.

---

## 2. Restaurant and branch endpoints

### 2.1 Read own restaurant

```
GET /api/v1/restaurant
```

Access token required. Any role.

No ID in the URL. The restaurant is the one in the token. There is no endpoint that takes a restaurant ID, because there is no legitimate reason for a client to name a restaurant other than its own.

Response 200 returns the full restaurant document minus internal fields.

### 2.2 Update own restaurant

```
PATCH /api/v1/restaurant
```

Access token required. Role: `OWNER` only.

Request, all fields optional, at least one required:

```json
{
  "name": "Shreeji Dining Hall",
  "legalName": "Shreeji Foods Private Limited",
  "gstin": "24AAACS1234A1Z5",
  "fssaiLicenseNumber": "12345678901234",
  "contactPhone": "9876543210",
  "contactEmail": "owner@example.com",
  "address": {
    "line1": "12 CG Road",
    "line2": "Navrangpura",
    "city": "Ahmedabad",
    "state": "Gujarat",
    "pincode": "380009"
  }
}
```

Response 200 returns the updated restaurant.

`isActive` cannot be changed through this endpoint. Deactivating a restaurant is a platform operation, not a customer one.

### 2.3 List branches

```
GET /api/v1/branches
```

Access token required. Any role.

Response 200 returns an array. In version 1 it always contains exactly one branch.

There is no create, update, or delete branch endpoint in version 1. Branches are created by the provisioning script only. The field exists on every record so that multi-outlet works later without a migration, but the feature is not built.

---

## 3. User management endpoints (M0-C, not part of M0-B)

Written here so the contract is complete. Do not build these in M0-B.

### 3.1 Create staff user

```
POST /api/v1/users
```

Roles: `OWNER`, `MANAGER`.

A `MANAGER` cannot create an `OWNER`. Only an `OWNER` can create another `OWNER`.

Request:

```json
{
  "name": "Arya Shah",
  "phone": "9876543211",
  "email": "arya@example.com",
  "role": "CASHIER",
  "password": "initial password"
}
```

Response 201 returns the created user without `passwordHash`.

Failure 409 `DUPLICATE` if the phone number is already registered anywhere on the platform.

### 3.2 List staff

```
GET /api/v1/users?page=1&limit=50&role=CASHIER&isActive=true
```

Roles: `OWNER`, `MANAGER`.

Returns the paginated list envelope. Never includes `passwordHash`.

### 3.3 Read one staff user

```
GET /api/v1/users/:userId
```

Roles: `OWNER`, `MANAGER`.

404 `NOT_FOUND` if the user belongs to another restaurant. Never 403.

### 3.4 Update staff user

```
PATCH /api/v1/users/:userId
```

Roles: `OWNER`, `MANAGER`.

Updatable: `name`, `email`, `role`.

`phone` is not updatable, because it is the login identity and is globally unique. A phone change is a new user record plus a deactivation.

A `MANAGER` cannot set a role to `OWNER` and cannot edit an `OWNER`.

Nobody can change their own role, including an `OWNER`. This prevents the only owner from accidentally demoting themselves and locking everyone out.

### 3.5 Activate or deactivate staff user

```
PATCH /api/v1/users/:userId/status
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{ "isActive": false }
```

There is no delete endpoint for a user. Attendance history must survive staff turnover.

On deactivation, revoke every refresh token for that user immediately.

Failure 422 if this would deactivate the last active `OWNER` of the restaurant.

### 3.6 Reset a staff password

```
PATCH /api/v1/users/:userId/password
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{ "newPassword": "temporary one" }
```

The current password is not required. This is a manager resetting a password for someone who forgot it.

A `MANAGER` cannot reset an `OWNER` password.

Revokes every refresh token for the target user.

---

## Permission summary for M0

| Endpoint | OWNER | MANAGER | CASHIER | WAITER | KITCHEN | STOREKEEPER |
|---|---|---|---|---|---|---|
| POST /auth/login | public | public | public | public | public | public |
| POST /auth/refresh | public | public | public | public | public | public |
| POST /auth/logout | yes | yes | yes | yes | yes | yes |
| POST /auth/logout-all | yes | yes | yes | yes | yes | yes |
| GET /auth/me | yes | yes | yes | yes | yes | yes |
| PATCH /auth/password | yes | yes | yes | yes | yes | yes |
| GET /restaurant | yes | yes | yes | yes | yes | yes |
| PATCH /restaurant | yes | no | no | no | no | no |
| GET /branches | yes | yes | yes | yes | yes | yes |
| POST /users | yes | yes* | no | no | no | no |
| GET /users | yes | yes | no | no | no | no |
| GET /users/:id | yes | yes | no | no | no | no |
| PATCH /users/:id | yes | yes* | no | no | no | no |
| PATCH /users/:id/status | yes | yes* | no | no | no | no |
| PATCH /users/:id/password | yes | yes* | no | no | no | no |

`yes*` means yes, except on a user whose role is `OWNER`, and except when setting a role to `OWNER`.

---

## Open questions still unanswered

These belong to later modules but are recorded here so they are not forgotten.

Business day start time. Affects M3 and M6. Not needed for M0.

Simultaneous table access by two waiters. Affects M2.

Recipe unit conversion. Affects M4.

PIN-based quick login for shift staff on a shared tablet. Deferred out of version 1. If it comes back, it is a second credential on the user record, not a second user.

---

# M1 Menu Management

Owner: Arya.

Categories, menu items, variants, add-ons, and the availability toggle.

Combos are out of scope for M1. The module catalog names them, but a combo needs rules for which items can substitute for which, and that is real design work with no MVP customer asking for it yet. Revisit after a pilot restaurant asks. Logged as a decision, not an open question, because it is a call, not a gap.

---

## 1. Category endpoints

### 1.1 Create category

```
POST /api/v1/categories
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{
  "name": "Starters",
  "displayOrder": 1
}
```

Response 201 returns the created category.

Failure 409 `DUPLICATE` if the name already exists in this restaurant, case-insensitive.

### 1.2 List categories

```
GET /api/v1/categories
```

Any authenticated role. A waiter and the kitchen both need to read the menu.

No pagination. A restaurant has a few dozen categories at most. Returns a flat array, sorted by `displayOrder`.

### 1.3 Update category

```
PATCH /api/v1/categories/:categoryId
```

Roles: `OWNER`, `MANAGER`.

Request, both optional, at least one required:

```json
{
  "name": "Starters and Soups",
  "displayOrder": 2
}
```

404 if the category belongs to another restaurant.

### 1.4 Deactivate category

```
PATCH /api/v1/categories/:categoryId/status
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{ "isActive": false }
```

There is no delete. A category with menu items under it stays as a historical grouping, since old orders and bills reference item names, not live category data.

Deactivating a category does not touch the items inside it. Each item's own `isActive` still controls whether it can be ordered. This is deliberate: an owner might fold a category into another without wanting every dish inside it to vanish from the menu at the same moment.

---

## 2. Menu item endpoints

### 2.1 Create item

```
POST /api/v1/menu-items
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{
  "categoryId": "664a...",
  "name": "Paneer Tikka",
  "description": "Marinated cottage cheese, char-grilled",
  "priceInPaise": 24000,
  "taxRateBasisPoints": 500,
  "variants": [
    { "name": "Half", "priceInPaise": 24000 },
    { "name": "Full", "priceInPaise": 42000 }
  ],
  "addOns": [
    { "name": "Extra Chutney", "priceInPaise": 3000 }
  ]
}
```

`priceInPaise` at the top level is required even when variants exist. It is the price shown in a list view before a variant is picked, and it is what a bill line falls back to if an order is somehow created without a variant selected.

`variants` and `addOns` are both optional and default to empty arrays. An item with no variants is sold at its single `priceInPaise`.

Response 201 returns the created item, including a generated `id` on every variant and add-on, since M2 needs a stable id to reference when an order line picks one.

Failure 409 `DUPLICATE` if the name already exists in this restaurant's category, case-insensitive.

Failure 422 `BUSINESS_RULE_VIOLATED` if `categoryId` does not exist or is inactive.

### 2.2 List items

```
GET /api/v1/menu-items?categoryId=664a...&isAvailable=true&search=paneer
```

Any authenticated role.

`categoryId`, `isAvailable`, and `search` all optional filters. `search` matches item name, partial, case-insensitive.

No pagination. A full restaurant menu is a few hundred items at most and M2's ordering screen needs the whole thing in one call, not pages of it.

### 2.3 Read one item

```
GET /api/v1/menu-items/:itemId
```

Any authenticated role. 404 if it belongs to another restaurant.

### 2.4 Update item

```
PATCH /api/v1/menu-items/:itemId
```

Roles: `OWNER`, `MANAGER`.

Any field from create is optional here, at least one required. `variants` and `addOns`, if sent, replace the full array rather than merging one entry at a time. Partial patching of a single variant inside the array is not supported in version 1, the client sends the whole array back.

This endpoint changes the live menu price. It never touches an order or bill that was already created, because those already hold their own copy of the price. That is the whole reason the copy rule exists.

### 2.5 Toggle availability

```
PATCH /api/v1/menu-items/:itemId/availability
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`, `STOREKEEPER`. Any authenticated role can flip this one.

Request:

```json
{ "isAvailable": false }
```

This is the "we're out of paneer" button. It has to be fast and it has to be usable by whoever is standing at the pass when the kitchen runs out, not gated behind a manager login. This is the one write endpoint in M1 open to every role.

Response 200 returns the updated item.

This field is separate from `isActive`. `isActive` is the owner's decision that a dish is on the menu at all. `isAvailable` is today's stock reality. A dish can be `isActive: true` and `isAvailable: false` at 8pm and available again tomorrow.

### 2.6 Deactivate item

```
PATCH /api/v1/menu-items/:itemId/status
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{ "isActive": false }
```

No delete. An old order references this item's name and price as a snapshot, not as a live link, so removing the item never breaks order history. But the row itself stays for that same reason, in case a report ever needs to join back to it.

---

## Permission summary for M1

| Endpoint | OWNER | MANAGER | CASHIER | WAITER | KITCHEN | STOREKEEPER |
|---|---|---|---|---|---|---|
| POST /categories | yes | yes | no | no | no | no |
| GET /categories | yes | yes | yes | yes | yes | yes |
| PATCH /categories/:id | yes | yes | no | no | no | no |
| PATCH /categories/:id/status | yes | yes | no | no | no | no |
| POST /menu-items | yes | yes | no | no | no | no |
| GET /menu-items | yes | yes | yes | yes | yes | yes |
| GET /menu-items/:id | yes | yes | yes | yes | yes | yes |
| PATCH /menu-items/:id | yes | yes | no | no | no | no |
| PATCH /menu-items/:id/availability | yes | yes | yes | yes | yes | yes |
| PATCH /menu-items/:id/status | yes | yes | no | no | no | no |

---

## Decisions made for M1, not asked back to the team

Combos are out of scope for version 1. See the module header above.

Add-ons and variants are embedded inside the menu item, not a shared collection. An "extra cheese" add-on used on ten different items is entered ten times. This trades a small amount of duplicate typing for a much simpler data model, no join, no shared-editing conflicts. Revisit if a restaurant's menu turns out to have heavy add-on reuse across many items.

`isAvailable` is open to every role. `isActive` is owner and manager only. This is a deliberate split between "on the menu" and "in stock right now," documented above in 2.5.

No image upload in M1. A menu item has no photo field yet. Every screen the module catalog describes for M1 is text and price, not visual browsing. Add it later if a customer-facing ordering module needs it.

---

# M2 Order Taking and KOT

Owner: Rishi.

The largest module in the MVP. Tables, orders, order lines, firing to the kitchen, and the kitchen display.

Order types in version 1: `DINE_IN` and `TAKEAWAY`. Delivery is not built, because aggregator integration is out of scope and there is no in-house delivery flow.

## Two rules that shape this whole module

**Copy on create.** Every order line stores its own copy of the item name, the variant name, the unit price, the tax rate, and each add-on name and price, taken at the moment the line is added. Nothing in M2 or M3 ever reads a live price from `menuitems`. If the owner changes the paneer price at 8pm, a line added at 7pm still bills at the 7pm price.

**Orders grow.** A table orders starters, then mains twenty minutes later, on the same order. An order is never a single frozen thing created once. Lines are added over time, fired to the kitchen in batches, and each batch becomes its own KOT.

## Order status values

| Status | Meaning | Set by |
|---|---|---|
| `OPEN` | Taking orders. Lines can be added, edited, cancelled. | M2 |
| `READY_TO_BILL` | Every non-cancelled line is served. Waiting for the cashier. | M2 |
| `BILLED` | A bill exists. Reserved for M3. M2 never sets this. | M3 |
| `CANCELLED` | Whole order voided with a reason. | M2 |

## Order line status values

| Status | Meaning |
|---|---|
| `PENDING` | Added to the order, not yet sent to the kitchen. Editable. |
| `FIRED` | Sent to the kitchen. On a KOT. No longer editable. |
| `READY` | Kitchen marked it done. |
| `SERVED` | Delivered to the table. |
| `CANCELLED` | Voided. Carries `wasPrepared` and a reason. |

---

## 1. Table endpoints

### 1.1 Create table

```
POST /api/v1/tables
```

Roles: `OWNER`, `MANAGER`.

Request:

```json
{
  "name": "T1",
  "section": "Ground Floor",
  "seats": 4,
  "displayOrder": 1
}
```

Response 201 returns the created table.

Failure 409 `DUPLICATE` if the name already exists in this restaurant, case-insensitive.

### 1.2 List tables

```
GET /api/v1/tables?section=Ground Floor&isOccupied=true
```

Any authenticated role. No pagination.

Each table in the response carries a derived occupancy block. It is computed from open orders at request time and is never stored on the table document.

```json
{
  "success": true,
  "data": [
    {
      "id": "665a...",
      "name": "T1",
      "section": "Ground Floor",
      "seats": 4,
      "displayOrder": 1,
      "isActive": true,
      "occupancy": {
        "isOccupied": true,
        "orderId": "665b...",
        "orderNumber": 1043,
        "openedAt": "2026-08-29T13:10:00.000Z",
        "runningTotalInPaise": 68400
      }
    }
  ]
}
```

`occupancy.isOccupied` is false and every other field in the block is null when no order is open on that table.

### 1.3 Update table

```
PATCH /api/v1/tables/:tableId
```

Roles: `OWNER`, `MANAGER`. Fields: `name`, `section`, `seats`, `displayOrder`, all optional, at least one required.

### 1.4 Deactivate table

```
PATCH /api/v1/tables/:tableId/status
```

Roles: `OWNER`, `MANAGER`. Body `{ "isActive": false }`. No delete.

Failure 422 `BUSINESS_RULE_VIOLATED` if an order is currently open on that table.

---

## 2. Order endpoints

### 2.1 Create order

```
POST /api/v1/orders
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request for dine-in:

```json
{
  "orderType": "DINE_IN",
  "tableId": "665a...",
  "guestCount": 4,
  "lines": []
}
```

Request for takeaway:

```json
{
  "orderType": "TAKEAWAY",
  "customerName": "Mehul",
  "customerPhone": "9876543210",
  "lines": []
}
```

`tableId` is required when `orderType` is `DINE_IN` and must be absent when it is `TAKEAWAY`.

`customerName` and `customerPhone` are optional on takeaway and must be absent on dine-in.

`lines` is optional. An order can be created empty and filled in afterwards, which is what happens when a waiter seats a table before anyone has decided.

Response 201 returns the full order.

**Failure 409 `TABLE_OCCUPIED`** if an order is already open on that table. The response includes the existing order so the client can open it instead of showing an error dead end:

```json
{
  "success": false,
  "error": {
    "code": "TABLE_OCCUPIED",
    "message": "An order is already open on this table.",
    "existingOrderId": "665b..."
  }
}
```

This is the answer to the two-waiters problem. One open order per table, enforced by a unique index, so the second waiter joins the first waiter's order rather than creating a duplicate.

### 2.2 List orders

```
GET /api/v1/orders?status=OPEN&orderType=DINE_IN&tableId=665a...&page=1&limit=50
```

Any authenticated role.

`status` accepts a comma-separated list, for example `OPEN,READY_TO_BILL`.

Sorted by `createdAt` descending. Paginated, default 50, max 200.

### 2.3 Read one order

```
GET /api/v1/orders/:orderId
```

Any authenticated role. 404 if it belongs to another restaurant.

Response includes every line, its status, and a computed totals block:

```json
{
  "success": true,
  "data": {
    "id": "665b...",
    "orderNumber": 1043,
    "orderType": "DINE_IN",
    "tableId": "665a...",
    "tableName": "T1",
    "guestCount": 4,
    "customerName": null,
    "customerPhone": null,
    "status": "OPEN",
    "version": 7,
    "openedBy": "664f...",
    "openedAt": "2026-08-29T13:10:00.000Z",
    "lines": [
      {
        "id": "665c...",
        "menuItemId": "664d...",
        "itemName": "Paneer Tikka",
        "variantId": "664e...",
        "variantName": "Full",
        "unitPriceInPaise": 42000,
        "taxRateBasisPoints": 500,
        "quantity": 2,
        "addOns": [
          { "addOnId": "664g...", "name": "Extra Chutney", "priceInPaise": 3000 }
        ],
        "lineTotalInPaise": 90000,
        "notes": "less spicy",
        "status": "FIRED",
        "kotId": "665d...",
        "firedAt": "2026-08-29T13:14:00.000Z",
        "cancelledAt": null,
        "wasPrepared": null,
        "cancelReason": null
      }
    ],
    "totals": {
      "subtotalInPaise": 90000,
      "lineCount": 1
    }
  }
}
```

`lineTotalInPaise` is `(unitPriceInPaise + sum of addOn prices) * quantity`. It is computed on read and never stored, so it cannot drift from its own parts.

`totals.subtotalInPaise` sums `lineTotalInPaise` across all non-cancelled lines. It is not a bill. No tax, no discount, no rounding. M3 owns all bill arithmetic.

### 2.4 Add lines to an order

```
POST /api/v1/orders/:orderId/lines
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request:

```json
{
  "version": 7,
  "lines": [
    {
      "menuItemId": "664d...",
      "variantId": "664e...",
      "quantity": 2,
      "addOnIds": ["664g..."],
      "notes": "less spicy"
    }
  ]
}
```

The client sends only IDs and quantity. The server looks up the menu item and writes the snapshot fields itself. A client is never trusted to send a price.

`version` is the order version the client last read. See section 2.9.

Response 200 returns the full updated order.

Failure 422 `BUSINESS_RULE_VIOLATED` if the menu item does not exist, is inactive, is unavailable, or belongs to another restaurant. Also if `variantId` is not one of that item's variants, or an `addOnId` is not one of that item's add-ons.

Failure 422 if the order status is not `OPEN`.

### 2.5 Edit a line

```
PATCH /api/v1/orders/:orderId/lines/:lineId
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request:

```json
{
  "version": 8,
  "quantity": 3,
  "notes": "no onion"
}
```

Only `quantity` and `notes` are editable. Price, item, and variant are not, because changing what was ordered is a cancel plus a new line, not an edit.

Failure 422 if the line status is not `PENDING`. Once a line is fired, the kitchen is already cooking it and it can only be cancelled.

### 2.6 Cancel a line

```
POST /api/v1/orders/:orderId/lines/:lineId/cancel
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request:

```json
{
  "version": 8,
  "reason": "Customer changed their mind",
  "wasPrepared": false
}
```

`reason` is required. `wasPrepared` is required when the line status is `FIRED`, `READY`, or `SERVED`, and must be absent when the status is `PENDING`.

**`wasPrepared` is the answer to the cancelled item problem.** If the kitchen already cooked the dish, the ingredients are gone and M4 must still deduct stock. If it was cancelled before cooking started, they are not. The system cannot guess, so whoever cancels is asked. A `PENDING` line was never sent to the kitchen, so the question does not arise.

M4 will read this field. M2 only records it.

The line is never removed from the array. Its status becomes `CANCELLED` and it keeps its snapshot values.

### 2.7 Fire pending lines to the kitchen

```
POST /api/v1/orders/:orderId/fire
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request:

```json
{ "version": 9 }
```

Takes every line on this order with status `PENDING`, creates one KOT containing them, and sets each line to `FIRED` with `firedAt` and the new `kotId`.

Response 200:

```json
{
  "success": true,
  "data": {
    "kot": { },
    "order": { }
  }
}
```

Failure 422 `BUSINESS_RULE_VIOLATED` if there are no pending lines. Firing an empty batch would print a blank ticket in a hot kitchen.

Failure 422 if order status is not `OPEN`.

Firing twice creates two KOTs. That is correct and is how the starters-then-mains flow works.

### 2.8 Mark a line served

```
PATCH /api/v1/orders/:orderId/lines/:lineId/served
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request `{ "version": 11 }`.

Failure 422 if the line status is not `READY`.

When every non-cancelled line on the order reaches `SERVED`, the order status automatically becomes `READY_TO_BILL`. The server does this, no separate endpoint.

An order where every line ends up cancelled does not become `READY_TO_BILL`. It stays `OPEN` so someone has to cancel it deliberately.

### 2.9 Move an order to another table

```
PATCH /api/v1/orders/:orderId/table
```

Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`.

Request:

```json
{
  "version": 11,
  "tableId": "665f..."
}
```

Failure 409 `TABLE_OCCUPIED` if an order is already open on the destination table.

Failure 422 if the order is `TAKEAWAY`.

### 2.10 Cancel a whole order

```
POST /api/v1/orders/:orderId/cancel
```

Roles: `OWNER`, `MANAGER`. Not waiters and not cashiers.

Request:

```json
{
  "version": 11,
  "reason": "Customer left",
  "wasPrepared": false
}
```

`wasPrepared` applies to every fired line at once and is required if any line has been fired.

Sets the order status to `CANCELLED` and every non-cancelled line to `CANCELLED`. Frees the table.

Failure 422 if the order status is already `CANCELLED` or `BILLED`.

Nothing is deleted. The order and every line stay in the database forever.

---

## 3. Optimistic concurrency, the two waiters problem

Every order document has an integer `version`, starting at 1 and incremented by the server on every successful write.

Every write endpoint in section 2 requires the client to send the `version` it last read.

If the sent version does not match the stored version, the server rejects with 409 `VERSION_CONFLICT` and returns the current order:

```json
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This order was changed by someone else. Reloading.",
    "currentVersion": 12
  }
}
```

The client reloads and shows the waiter what actually happened, rather than silently overwriting a colleague's work.

This is a lock-free approach. Two waiters can both have the order open. Only the first write wins, and the second waiter is told immediately instead of at bill time.

---

## 4. KOT endpoints

A KOT is a kitchen ticket. It is created by firing, never directly.

### 4.1 List KOTs, the kitchen display

```
GET /api/v1/kots?status=PENDING,IN_PROGRESS&page=1&limit=50
```

Any authenticated role. The kitchen screen is the main consumer.

Sorted by `createdAt` ascending. Oldest ticket first, because that is the order a kitchen works in.

Each KOT carries a denormalised copy of the table name and order number so the kitchen screen needs one call, not a join per ticket.

### 4.2 Read one KOT

```
GET /api/v1/kots/:kotId
```

Any authenticated role.

### 4.3 Mark a KOT line ready

```
PATCH /api/v1/kots/:kotId/lines/:lineId/ready
```

Roles: all six. The person at the pass marks food ready, whoever they are.

No `version` field. A KOT is append-only from the kitchen's side and two cooks marking the same dish ready is harmless.

Sets that KOT line to `READY`, and sets the matching order line to `READY`.

Failure 422 if the line is already `READY` or `CANCELLED`.

### 4.4 Mark a whole KOT ready

```
PATCH /api/v1/kots/:kotId/ready
```

Roles: all six.

Marks every non-cancelled line on the ticket ready in one action, and the matching order lines with it.

### KOT status

Derived, never stored: `PENDING` when no line is ready, `IN_PROGRESS` when some are, `COMPLETED` when all non-cancelled lines are ready.

---

## Permission summary for M2

| Endpoint | OWNER | MANAGER | CASHIER | WAITER | KITCHEN | STOREKEEPER |
|---|---|---|---|---|---|---|
| POST /tables | yes | yes | no | no | no | no |
| GET /tables | yes | yes | yes | yes | yes | yes |
| PATCH /tables/:id | yes | yes | no | no | no | no |
| PATCH /tables/:id/status | yes | yes | no | no | no | no |
| POST /orders | yes | yes | yes | yes | no | no |
| GET /orders | yes | yes | yes | yes | yes | yes |
| GET /orders/:id | yes | yes | yes | yes | yes | yes |
| POST /orders/:id/lines | yes | yes | yes | yes | no | no |
| PATCH /orders/:id/lines/:lineId | yes | yes | yes | yes | no | no |
| POST /orders/:id/lines/:lineId/cancel | yes | yes | yes | yes | no | no |
| POST /orders/:id/fire | yes | yes | yes | yes | no | no |
| PATCH /orders/:id/lines/:lineId/served | yes | yes | yes | yes | no | no |
| PATCH /orders/:id/table | yes | yes | yes | yes | no | no |
| POST /orders/:id/cancel | yes | yes | no | no | no | no |
| GET /kots | yes | yes | yes | yes | yes | yes |
| GET /kots/:id | yes | yes | yes | yes | yes | yes |
| PATCH /kots/:id/lines/:lineId/ready | yes | yes | yes | yes | yes | yes |
| PATCH /kots/:id/ready | yes | yes | yes | yes | yes | yes |

Cancelling a single line is open to waiters. Cancelling a whole order is not. A whole-order cancel is the move a dishonest staff member would use to make a table disappear, and it is exactly the gap restaurant owners lose money to today.

---

## Decisions made for M2, not asked back to the team

**The two waiters problem is now closed.** One open order per table, enforced by a unique index, plus optimistic concurrency with a `version` field. The second waiter joins the existing order instead of creating a second one. Move this from Open Questions to the decision log.

**Order and KOT numbers are sequential per restaurant and never reset.** They do not reset daily, because a daily reset needs the business day start time, which is still undecided. A number that runs to 40,000 over three years is not a problem.

**Gaps in order and KOT numbers are acceptable.** A number is reserved before the document is written, so a crash between the two loses a number. This is fine for orders and kitchen tickets. It is not fine for bill numbers, and M3 will handle those differently.

**No delivery order type.** Aggregator integration is out of scope and there is no in-house delivery flow in the MVP.

**No table merge or split.** A party moving from two tables to one is handled by moving one order and cancelling the other. Real split-bill handling belongs to M3 if it happens at all.

**Line totals are computed, not stored.** Anything that can be derived from its own parts is derived, so it cannot silently disagree with them.

---

## PART 5: DATABASE SCHEMA


MongoDB via Mongoose. One shared database. Tenancy by `restaurantId` on every record.

Rules that apply to every collection unless stated otherwise, from `docs/CONVENTIONS.md` section 4:

Every record has `restaurantId` and `branchId`.
Every record has `createdAt` and `updatedAt`, stored in UTC.
Every compound index starts with `restaurantId`.
Money is a whole integer of paise. Percentages are integers in basis points.

Last updated: [DATE] by [NAME]

---

# M0 Foundation

Four collections: `restaurants`, `branches`, `users`, `refreshtokens`.

---

## Important: the tenancy root exception

`restaurants` and `branches` are the tenancy roots. They cannot follow the normal rule, and this must be handled deliberately rather than worked around later.

A restaurant document does not belong to a restaurant. It **is** the restaurant. Its `_id` is the value that every other collection stores as `restaurantId`.

A branch document belongs to a restaurant but is not inside a branch. Its `_id` is the value every other collection stores as `branchId`.

Therefore:

| Collection | `baseSchema` plugin | `tenantGuard` plugin | Notes |
|---|---|---|---|
| `restaurants` | No | No | Queried by `_id`. Guard would block every legitimate query. |
| `branches` | Partial | Yes, on `restaurantId` only | Has `restaurantId`, has no `branchId`. |
| `users` | Yes | Yes | Full. |
| `refreshtokens` | Yes | Yes | Full. |

Because `restaurants` is exempt from the guard, every query against it must be reviewed by hand. There are only two legitimate patterns: lookup by `_id` taken from a verified token, and the provisioning script. Any third pattern is a bug.

`branches` needs a plugin variant that adds `restaurantId` but not `branchId`. Build it as `baseSchemaTenantRoot.js` rather than passing an option flag, so the difference is visible in the import line.

---

## 1. `restaurants`

The tenant. One document per customer restaurant.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | This is the `restaurantId` used everywhere else |
| `name` | String | yes | Trading name. Shown on screen. |
| `legalName` | String | no | Registered company name. Appears on a GST invoice. |
| `gstin` | String | no | 15 characters. Optional because a small restaurant may not be registered. |
| `fssaiLicenseNumber` | String | no | 14 digits |
| `address.line1` | String | no | |
| `address.line2` | String | no | |
| `address.city` | String | no | |
| `address.state` | String | no | |
| `address.pincode` | String | no | 6 digits |
| `contactPhone` | String | no | 10 digits |
| `contactEmail` | String | no | |
| `isActive` | Boolean | yes | Default true. Platform-controlled, not customer-controlled. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes: `_id` only. No compound index needed, this collection will have tens of documents, not millions.

Deliberately not here yet:

GST rate settings. M3 owns tax configuration and will add a `settings.tax` object. Do not invent it now.

Business day start time. Undecided, an open question. Do not add a field for it, because a nullable field nobody agreed on will get a default guessed into it.

---

## 2. `branches`

One physical outlet. Version 1 creates exactly one per restaurant and never a second.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | This is the `branchId` used everywhere else |
| `restaurantId` | ObjectId | yes | `restaurants._id` | Indexed |
| `name` | String | yes | | Defaults to `"Main"` at provisioning |
| `address.line1` | String | no | | |
| `address.line2` | String | no | | |
| `address.city` | String | no | | |
| `address.state` | String | no | | |
| `address.pincode` | String | no | | |
| `contactPhone` | String | no | | 10 digits |
| `isActive` | Boolean | yes | | Default true |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

Indexes: `{ restaurantId: 1 }`.

No `branchId` field. Its own `_id` serves that purpose.

---

## 3. `users`

Every person who logs in. Owners, managers, and floor staff, all in one collection.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | |
| `branchId` | ObjectId | yes | `branches._id` | Single branch in version 1 |
| `name` | String | yes | | Trimmed, 1 to 100 characters |
| `phone` | String | yes | | Exactly 10 digits, first digit 6 to 9. **Globally unique.** |
| `email` | String | no | | Optional. Not a login identity. |
| `passwordHash` | String | yes | | bcrypt. Never returned by any endpoint. Excluded by default via `select: false`. |
| `role` | String | yes | | One of `OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`, `STOREKEEPER` |
| `isActive` | Boolean | yes | | Default true. There is no delete. |
| `lastLoginAt` | Date | no | | UTC. Null until first login. |
| `passwordChangedAt` | Date | no | | UTC. Used to invalidate access tokens issued before a password change. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

Indexes:

`{ phone: 1 }` unique. Note that this one does **not** start with `restaurantId`, and that is correct here, for the reason below.

`{ restaurantId: 1, branchId: 1, isActive: 1 }` for staff lists.

`{ restaurantId: 1, role: 1 }` for permission and reporting queries.

### Why `phone` is globally unique, and what it costs

Login is phone plus password, with no restaurant selector on the login screen. If two restaurants both had a user with phone `9876543210`, the server would not know which account to check.

So a phone number identifies exactly one account across the whole platform.

The consequence is real and you should know it before it surprises you. If the same person works at two restaurants that are both your customers, they need two phone numbers. This is uncommon at owner and manager level and more common with floor staff who work two jobs.

The alternative was a restaurant code field on the login screen, which is friction on a screen used forty times a day.

This is the trade we chose. Log it in the decision log.

### `passwordChangedAt` and access tokens

A refresh token can be revoked because it lives in the database. An access token cannot, because it is stateless and valid for 15 minutes.

`passwordChangedAt` closes that window. The `authenticate` middleware compares the token's `iat` against this field, and rejects any access token issued before the last password change.

Without this, a stolen access token keeps working for up to 15 minutes after the user changes their password in response to that exact theft.

---

## 4. `refreshtokens`

One document per active session. This is what makes logout and revocation real.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | |
| `branchId` | ObjectId | yes | `branches._id` | |
| `userId` | ObjectId | yes | `users._id` | Indexed |
| `tokenHash` | String | yes | | SHA-256 of the raw token, hex. Indexed, unique. |
| `expiresAt` | Date | yes | | UTC. 30 days from issue. |
| `revokedAt` | Date | no | | UTC. Null while active. |
| `revokedReason` | String | no | | `LOGOUT`, `LOGOUT_ALL`, `ROTATED`, `REUSE_DETECTED`, `PASSWORD_CHANGED`, `USER_DEACTIVATED` |
| `replacedByTokenHash` | String | no | | Set on rotation. Builds the chain used for reuse detection. |
| `userAgent` | String | no | | Truncated to 255 characters |
| `ipAddress` | String | no | | Stored for session review. Never written to a log line. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

Indexes:

`{ tokenHash: 1 }` unique. Like `phone`, this deliberately does not lead with `restaurantId`, because the lookup happens before any tenant context exists. At refresh time the token is the only thing the server has.

`{ restaurantId: 1, userId: 1, revokedAt: 1 }` for listing and bulk-revoking a user's sessions.

`{ expiresAt: 1 }` as a TTL index with `expireAfterSeconds: 0`.

### The TTL index is a deliberate exception to the no-hard-delete rule

CLAUDE.md says never hard delete a bill, order, or stock entry. A refresh token is none of those. It is session state with no audit value once expired, and keeping every session record forever grows without bound for no benefit.

Mongo removes expired documents automatically. Revoked-but-unexpired tokens stay until their natural expiry, which is what makes reuse detection work.

Write this reason as a comment in the model file. Someone will otherwise read the TTL index as a rule violation and remove it.

---

## Provisioning

There is no signup endpoint. Accounts are created by a script that Arya or Rishi runs.

`npm run provision:restaurant`

It creates, in one transaction where possible:

One `restaurants` document.
One `branches` document named `"Main"`, linked to it.
One `users` document with role `OWNER`, linked to both.

It prints the phone number and the generated password to the terminal once, and never stores the plain password anywhere.

If any step fails, nothing is created. A restaurant with no owner is unusable and a user with a dangling `restaurantId` is worse.

---

## What M0 deliberately does not contain

No menu, item, category, order, bill, stock, or attendance collection. Those belong to M1 through M5 and will be defined in this file when those modules are designed.

No permissions collection. Roles are a fixed enum in code. A database-driven permission system is a version 2 problem.

No audit log collection yet. M3 needs one for voids and discounts. It will be defined then, not guessed now.

---

# M1 Menu Management

Two collections: `categories` and `menuitems`. Both apply `baseSchema` and `tenantGuard` in full, no exceptions this time.

---

## 1. `categories`

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `restaurantId` | ObjectId | yes | from `baseSchema` |
| `branchId` | ObjectId | yes | from `baseSchema` |
| `name` | String | yes | Trimmed, 1 to 60 characters. Unique per restaurant, case-insensitive. |
| `displayOrder` | Number | yes | Integer. Controls menu screen ordering. Default 0. |
| `isActive` | Boolean | yes | Default true. No delete. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes:

`{ restaurantId: 1, branchId: 1, isActive: 1, displayOrder: 1 }` for the list screen.

`{ restaurantId: 1, name: 1 }` unique, case-insensitive via a collation, for the duplicate check.

---

## 2. `menuitems`

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `restaurantId` | ObjectId | yes | from `baseSchema` |
| `branchId` | ObjectId | yes | from `baseSchema` |
| `categoryId` | ObjectId | yes | Links to `categories._id` |
| `name` | String | yes | Trimmed, 1 to 100 characters. Unique per category, case-insensitive. |
| `description` | String | no | Up to 500 characters |
| `priceInPaise` | Number | yes | Integer, whole paise. The base price shown before any variant is picked. |
| `taxRateBasisPoints` | Number | yes | Integer, 0 to 10000. GST rate for this item. |
| `variants` | Array of subdocument | no | Default empty array. See below. |
| `addOns` | Array of subdocument | no | Default empty array. See below. |
| `isAvailable` | Boolean | yes | Default true. Today's stock reality. Any role can flip it. |
| `isActive` | Boolean | yes | Default true. Owner and manager only. No delete. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

### `variants` subdocument

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | Mongoose generates this even inside a subdocument array. M2 stores this id on an order line to record which variant was picked. |
| `name` | String | yes | For example `"Half"`, `"Full"`, `"Regular"`, `"Large"` |
| `priceInPaise` | Number | yes | Integer. Absolute price for this variant, not a difference from the base price. |

### `addOns` subdocument

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | Same reasoning as above |
| `name` | String | yes | For example `"Extra Cheese"` |
| `priceInPaise` | Number | yes | Integer. Added on top of the item or variant price. |

Indexes:

`{ restaurantId: 1, branchId: 1, categoryId: 1, isActive: 1 }` for the menu list screen.

`{ restaurantId: 1, categoryId: 1, name: 1 }` unique, case-insensitive via collation, for the duplicate check.

`{ restaurantId: 1, isAvailable: 1 }` since M2's ordering screen filters to available items constantly.

---

## Why variant and add-on prices are absolute, not deltas

A "Full" variant priced as a difference from "Half" reads naturally to a person and is a constant source of arithmetic bugs in code, and worse, in a report six months from now written by someone who forgot the convention. Every price field in this schema means exactly what it says: the number of paise a customer pays for that thing. M2 reads one field and copies it. No addition, no base-plus-delta logic anywhere near a bill.

## What M1 deliberately does not contain

No combo or bundle collection. Deferred, decision logged in `API-CONTRACT.md`.

No recipe or ingredient link. That is M4's job, added when M4 is designed. A menu item does not know its own ingredients yet.

No image field. No customer-facing description formatting. Both are for a later customer-facing ordering module, not this one.

No price history collection. If a report ever needs to know what a dish cost last month, it reads that from the orders that were placed last month, which each hold their own copied price. The menu item itself only ever holds today's price.

---

# M2 Order Taking and KOT

Four collections: `tables`, `orders`, `kots`, `counters`.

All four apply `baseSchema` and `tenantGuard` in full. None is a tenancy root.

---

## 1. `tables`

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `restaurantId` | ObjectId | yes | from `baseSchema` |
| `branchId` | ObjectId | yes | from `baseSchema` |
| `name` | String | yes | Trimmed, 1 to 20 characters. Unique per restaurant, case-insensitive. For example `T1`, `A4`, `Terrace 2`. |
| `section` | String | no | Up to 40 characters. For example `Ground Floor`, `Terrace`, `AC Hall`. |
| `seats` | Number | no | Integer, 1 to 50 |
| `displayOrder` | Number | yes | Integer. Default 0. |
| `isActive` | Boolean | yes | Default true. No delete. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes:

`{ restaurantId: 1, branchId: 1, isActive: 1, displayOrder: 1 }`

`{ restaurantId: 1, name: 1 }` unique with a case-insensitive collation.

No occupancy field. Occupancy is derived from open orders at request time. A stored occupancy flag drifts the first time a process dies mid-write, and then a table is permanently stuck as occupied with no order on it.

---

## 2. `orders`

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | |
| `branchId` | ObjectId | yes | `branches._id` | |
| `orderNumber` | Number | yes | | Integer, sequential per restaurant, from `counters`. Never reused. Gaps acceptable. |
| `orderType` | String | yes | | `DINE_IN` or `TAKEAWAY` |
| `tableId` | ObjectId | conditional | `tables._id` | Required when `DINE_IN`, null when `TAKEAWAY` |
| `tableName` | String | no | | Snapshot of the table name at order creation, so a renamed table does not rewrite history |
| `guestCount` | Number | no | | Integer, 1 to 100. Dine-in only. |
| `customerName` | String | no | | Takeaway only. Up to 100 characters. |
| `customerPhone` | String | no | | Takeaway only. 10 digits. |
| `status` | String | yes | | `OPEN`, `READY_TO_BILL`, `BILLED`, `CANCELLED`. Default `OPEN`. |
| `version` | Number | yes | | Integer, starts at 1, incremented on every write. Optimistic concurrency. |
| `lines` | Array of subdocument | yes | | Default empty array. See below. |
| `openedBy` | ObjectId | yes | `users._id` | Who created the order |
| `openedAt` | Date | yes | | UTC |
| `readyToBillAt` | Date | no | | UTC |
| `billId` | ObjectId | no | | Reserved for M3. Null until billed. M2 never sets it. |
| `isCancelled` | Boolean | yes | | Default false |
| `cancelledAt` | Date | no | | UTC |
| `cancelledBy` | ObjectId | no | `users._id` | |
| `cancelReason` | String | no | | Required when cancelling |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### `lines` subdocument

Every price field here is a snapshot written at the moment the line was added. None of them is ever read from `menuitems` again.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | The line id used in every line-level endpoint |
| `menuItemId` | ObjectId | yes | `menuitems._id` | Reference only, for reporting. Never read for price. |
| `itemName` | String | yes | | Snapshot |
| `variantId` | ObjectId | no | | The variant subdocument id from `menuitems` |
| `variantName` | String | no | | Snapshot |
| `unitPriceInPaise` | Number | yes | | Snapshot. Integer. The variant price if a variant was chosen, otherwise the item base price. |
| `taxRateBasisPoints` | Number | yes | | Snapshot. Integer, 0 to 10000. M3 reads this, not the live menu. |
| `quantity` | Number | yes | | Integer, 1 to 999 |
| `addOns` | Array | no | | Each entry `{ addOnId, name, priceInPaise }`, all snapshots. Default empty array. |
| `notes` | String | no | | Up to 200 characters. Kitchen instructions. |
| `status` | String | yes | | `PENDING`, `FIRED`, `READY`, `SERVED`, `CANCELLED`. Default `PENDING`. |
| `kotId` | ObjectId | no | `kots._id` | Set when fired |
| `addedBy` | ObjectId | yes | `users._id` | |
| `addedAt` | Date | yes | | UTC |
| `firedAt` | Date | no | | UTC |
| `readyAt` | Date | no | | UTC |
| `servedAt` | Date | no | | UTC |
| `cancelledAt` | Date | no | | UTC |
| `cancelledBy` | ObjectId | no | `users._id` | |
| `cancelReason` | String | no | | Required when cancelling a line |
| `wasPrepared` | Boolean | no | | Required when cancelling a line that was `FIRED`, `READY`, or `SERVED`. Null otherwise. M4 reads this to decide whether to deduct stock. |

No `lineTotalInPaise` field. It is computed on read from `(unitPriceInPaise + sum of addOn prices) * quantity`. A stored total can disagree with its own parts. A computed one cannot.

Indexes:

`{ restaurantId: 1, branchId: 1, status: 1, createdAt: -1 }` for the order list.

`{ restaurantId: 1, orderNumber: 1 }` unique.

`{ restaurantId: 1, tableId: 1, status: 1 }` — **partial unique index**, filtered to `status: 'OPEN'`. This is what enforces one open order per table and makes the two-waiters race impossible at the database level rather than in application code. A partial index in Mongo uses `partialFilterExpression: { status: 'OPEN' }`.

`{ restaurantId: 1, 'lines.menuItemId': 1 }` for M6 reporting later.

---

## 3. `kots`

One kitchen ticket. Created by firing an order, never directly.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | |
| `branchId` | ObjectId | yes | `branches._id` | |
| `kotNumber` | Number | yes | | Integer, sequential per restaurant, from `counters`. Gaps acceptable. |
| `orderId` | ObjectId | yes | `orders._id` | |
| `orderNumber` | Number | yes | | Denormalised so the kitchen screen needs no join |
| `orderType` | String | yes | | Denormalised |
| `tableName` | String | no | | Denormalised. Null for takeaway. |
| `lines` | Array of subdocument | yes | | See below |
| `firedBy` | ObjectId | yes | `users._id` | |
| `firedAt` | Date | yes | | UTC |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### KOT `lines` subdocument

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `orderLineId` | ObjectId | yes | The `_id` of the matching line inside the order document |
| `itemName` | String | yes | Snapshot |
| `variantName` | String | no | Snapshot |
| `quantity` | Number | yes | Integer |
| `addOnNames` | Array of String | no | Names only. The kitchen does not need prices. |
| `notes` | String | no | |
| `status` | String | yes | `PENDING`, `READY`, `CANCELLED`. Default `PENDING`. |
| `readyAt` | Date | no | UTC |

No price on a KOT line. A kitchen ticket showing money is a leak of information the kitchen has no use for.

No stored KOT status. It is derived on read: `PENDING` when no line is ready, `IN_PROGRESS` when some are, `COMPLETED` when all non-cancelled lines are ready.

Indexes:

`{ restaurantId: 1, branchId: 1, createdAt: 1 }` — ascending, because a kitchen screen shows the oldest ticket first.

`{ restaurantId: 1, orderId: 1 }`

`{ restaurantId: 1, kotNumber: 1 }` unique.

---

## 4. `counters`

Atomic sequence generator. Built in M2 because KOT and order numbers need it first. M3 will reuse it for bill numbers.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `restaurantId` | ObjectId | yes | |
| `branchId` | ObjectId | yes | |
| `name` | String | yes | `ORDER`, `KOT`. `BILL` comes in M3. |
| `value` | Number | yes | Integer. Last issued number. Starts at 0. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Index: `{ restaurantId: 1, branchId: 1, name: 1 }` unique.

### How to increment

One atomic operation, never a read followed by a write:

```js
findOneAndUpdate(
  { restaurantId, branchId, name },
  { $inc: { value: 1 } },
  { new: true, upsert: true }
)
```

`upsert: true` means the counter creates itself on first use. No seeding step, no provisioning change.

### On gaps

A number is reserved by this increment before the order or KOT document is written. If the write then fails, that number is lost and the sequence has a gap.

For order numbers and KOT numbers this is acceptable. Nobody audits kitchen ticket sequences.

For bill numbers it is not acceptable, because a gap in a bill sequence is a compliance question from an accountant. M3 must not reuse this pattern as-is for bills. That is M3's problem to solve, flagged here so it is not solved by accident with the wrong approach.

---

## What M2 deliberately does not contain

No bill, payment, tax, or discount fields. Every one of those is M3. The order carries a snapshot `taxRateBasisPoints` per line so M3 has what it needs, and computes nothing with it.

No stock deduction. M4 reads `lines.status` and `lines.wasPrepared` to decide what to deduct. M2 only records them.

No delivery fields, no rider, no aggregator id.

No table merge or split.

No stored occupancy on `tables`, no stored line total, no stored KOT status. Everything derivable is derived.
