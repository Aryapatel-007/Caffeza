# DATABASE SCHEMA

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
| `settings.businessDayStartsAtMinutes` | Number | yes | Integer, 0 to 1439. Minutes past midnight IST at which the business day rolls over. Default 300 (05:00 IST). Added by M5, decision log D1. |
| `settings.tax` | Object | yes | `pricingMode`, `defaultTaxRateBps`, `roundOffEnabled`. Added by M7. See section 17. |
| `settings.receipt` | Object | yes | Header lines, footer text, and three print toggles. Added by M7. See section 17. |
| `settings.inventory` | Object | yes | `lowStockAlertsEnabled`. Added by M7. See section 17. |
| `isActive` | Boolean | yes | Default true. Platform-controlled, not customer-controlled. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes: `_id` only. No compound index needed, this collection will have tens of documents, not millions.

The `settings` object:

`settings.businessDayStartsAtMinutes` is here as of M5. See section 7 and decision log entry D1. It is an integer number of minutes past midnight IST, default 300 (05:00), configurable per restaurant through `PATCH /api/v1/restaurant`. Every attendance entry derives and stores its `businessDate` from this value at clock-in, so a shift that runs 18:00 to 01:30 is counted under the day it started.

`settings.tax`, `settings.receipt` and `settings.inventory` were added by M7,
which owns configuration for the whole project. Section 17 has every field, its
type and its default. Nothing reads them directly: `services/settingsService.js`
is the only way any module reads a setting.

M3 was originally expected to add `settings.tax`. It did not, and M7 added it
instead, which is why `tax.pricingMode` and `tax.roundOffEnabled` are stored and
deliberately not yet wired into M3's frozen tax arithmetic. Section 17 says why.

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
| `email` | String | no | | Optional. Lowercased. **Globally unique when present.** A second login identity: `POST /auth/login` takes it in place of phone. |
| `passwordHash` | String | yes | | bcrypt. Never returned by any endpoint. Excluded by default via `select: false`. |
| `role` | String | yes | | One of `OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`, `STOREKEEPER` |
| `isActive` | Boolean | yes | | Default true. There is no delete. |
| `lastLoginAt` | Date | no | | UTC. Null until first login. |
| `passwordChangedAt` | Date | no | | UTC. Used to invalidate access tokens issued before a password change. |
| `pinHash` | String | no | | bcrypt hash of a 4 to 6 digit PIN for the M5 shared-tablet clock. `select: false`. Null until set. Never returned, never logged. Added by M0-D. |
| `pinFailedAttempts` | Number | no | | `select: false`. Default 0. Consecutive failed PIN checks. Reset to 0 on a correct PIN or a PIN reset. Added by M0-D. |
| `pinLockedUntil` | Date | no | | UTC. Set when the PIN locks after 5 consecutive failures. Not a timeout: the PIN stays locked until an OWNER or MANAGER sets a new one. The date is kept for the audit line and the staff message. Added by M0-D. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

Indexes:

`{ phone: 1 }` unique. Note that this one does **not** start with `restaurantId`, and that is correct here, for the reason below.

`{ email: 1 }` unique, **partial on `email` being a string**. Same reasoning as `phone`: a login identity has to be unique across the whole platform, not per restaurant. The partial filter (`{ email: { $type: 'string' } }`) is what lets any number of users have no email while any two that do have one cannot collide. Email is lowercased by the model, so the uniqueness is case-insensitive without a collation index.

`{ restaurantId: 1, branchId: 1, isActive: 1 }` for staff lists.

`{ restaurantId: 1, role: 1 }` for permission and reporting queries.

### Why `phone` and `email` are globally unique, and what it costs

Login is phone plus password, with no restaurant selector on the login screen. If two restaurants both had a user with phone `9876543210`, the server would not know which account to check.

So a phone number identifies exactly one account across the whole platform.

The consequence is real and you should know it before it surprises you. If the same person works at two restaurants that are both your customers, they need two phone numbers. This is uncommon at owner and manager level and more common with floor staff who work two jobs.

The alternative was a restaurant code field on the login screen, which is friction on a screen used forty times a day.

This is the trade we chose. Log it in the decision log.

`email` was added as a **second** login identity, not a replacement: an owner or a manager who would rather sign in with an address they remember can, while floor staff keep using a phone. It is still optional. When it is set it obeys the same global-uniqueness rule as phone, for the same reason — login has no restaurant context, so the identifier alone has to point at one account.

### `passwordChangedAt` and access tokens

A refresh token can be revoked because it lives in the database. An access token cannot, because it is stateless and valid for 15 minutes.

`passwordChangedAt` closes that window. The `authenticate` middleware compares the token's `iat` against this field, and rejects any access token issued before the last password change.

Without this, a stolen access token keeps working for up to 15 minutes after the user changes their password in response to that exact theft.

### The PIN, and why it issues no session

M5's shared-tablet attendance clock (`POST /api/v1/attendance/station/clock`) lets a staff member clock in by tapping their name and typing a PIN, on a tablet that holds one ordinary logged-in session for the whole floor.

`authService.verifyPin({ restaurantId, branchId, userId }, pin)` checks the PIN and returns the user id on success. It issues **no token of any kind**, access or refresh. That is the property that makes a PIN safe on a device forty people touch: the worst a leaked PIN can do is record a clock event for the wrong person, which a manager corrects from the register with an audit line.

Everything that reads or writes `pinHash` lives in `services/authService.js`, the same discipline as `passwordHash`, so `grep -rn "pinHash" server/controllers/` stays empty.

A missing user, a user with no PIN, and a wrong PIN all cost one bcrypt comparison against the dummy hash and fail identically, so timing cannot tell which users exist or which have a PIN. Five consecutive failures lock the PIN until an OWNER or MANAGER resets it through `PATCH /api/v1/users/:userId/pin`. It does not unlock on its own.

There is deliberately no uniqueness constraint on a PIN within a branch. Verification takes the `userId` — the staff member taps their own tile first — so it asks "is this that person's PIN", never "whose PIN is this". A unique index on a salted bcrypt hash is not possible anyway, and an application-level check across the branch buys nothing the tap already provides.

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

It prints the owner's sign-in identity and password to the terminal once, and never stores the plain password anywhere. The password is generated unless `--password` is given; an `--email` may be set as a second login identity.

If any step fails, nothing is created. A restaurant with no owner is unusable and a user with a dangling `restaurantId` is worse.

---

## What M0 deliberately does not contain

No order, bill, or stock collection. Those belong to M2 through M4 and will be defined in this file when those modules are designed. The menu and category collections were defined by M1, and the `attendanceentries` collection by M5; all are below.

No permissions collection. Roles are a fixed enum in code. A database-driven permission system is a version 2 problem.

No audit log collection yet. M3 needs one for voids and discounts. It will be defined then, not guessed now.

---

# M1 Menu Management

Two collections: `categories` and `menuitems`.

Both are ordinary tenant collections. Neither is a tenancy root, so both apply
`baseSchemaPlugin` and then `tenantGuardPlugin` in full, and both therefore get
`restaurantId`, `branchId`, `createdAt`, `updatedAt`, the compound
`{ restaurantId, branchId }` index, and the `toJSON` transform that renames
`_id` to `id` and drops `__v`.

| Collection | `baseSchema` plugin | `tenantGuard` plugin |
|---|---|---|
| `categories` | Yes | Yes |
| `menuitems` | Yes | Yes |

---

## 5. `categories`

A menu section. "Starters", "Main Course", "Beverages".

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `restaurantId` | ObjectId | yes | From `baseSchema`. From the token, never the body. |
| `branchId` | ObjectId | yes | From `baseSchema`. From the token, never the body. |
| `name` | String | yes | Trimmed, 1 to 60 characters |
| `nameLower` | String | yes | Internal. Derived from `name`. Never in a response. |
| `displayOrder` | Number | yes | Integer, minimum 0, default 0 |
| `isActive` | Boolean | yes | Default true. This is the delete. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes:

`{ restaurantId: 1, branchId: 1, nameLower: 1 }` unique. Two categories in one
branch cannot share a name, compared case-insensitively.

`{ restaurantId: 1, branchId: 1, displayOrder: 1 }` for the ordered list read.

### Why `nameLower` exists

Case-insensitive uniqueness in Mongo otherwise needs a collation-aware index,
and a query written without the matching collation silently misses the index and
returns case-sensitive answers. A derived lowercase field makes the uniqueness
ordinary, visible in the index definition, and impossible to query around by
accident.

It is maintained by the model, not by callers, and is stripped in `toJSON`. It
is an implementation detail of the index and is not part of the API contract.

---

## 6. `menuitems`

One sellable dish. The record M2 copies from and M4 attaches a recipe to.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | M2 stores this on an order line, M4 on a recipe |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `categoryId` | ObjectId | yes | `categories._id` | Must exist in the same restaurant and branch |
| `name` | String | yes | | Trimmed, 1 to 100 characters |
| `nameLower` | String | yes | | Internal, as above. Never in a response. |
| `description` | String | no | | Trimmed, maximum 500 characters |
| `priceInPaise` | Number | yes | | Integer, 0 to 100000000. Whole paise. |
| `taxRateBps` | Number | yes | | Integer, 0 to 10000. Basis points. 5% is 500. |
| `displayOrder` | Number | yes | | Integer, minimum 0, default 0 |
| `isAvailable` | Boolean | yes | | Default true. "In stock right now." |
| `isActive` | Boolean | yes | | Default true. "On the menu at all." The delete. |
| `variants` | [Variant] | yes | | Default `[]`, at most 20 |
| `addOns` | [AddOn] | yes | | Default `[]`, at most 30 |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

Indexes:

`{ restaurantId: 1, branchId: 1, nameLower: 1 }` unique.

`{ restaurantId: 1, branchId: 1, categoryId: 1, displayOrder: 1 }` for the menu
tree read.

`{ restaurantId: 1, branchId: 1, isActive: 1, isAvailable: 1 }` for the filtered
list read.

`taxRateBps` lives on the item, not in a global setting, because different
dishes are taxed differently and a zero-rated item is legitimate. CLAUDE.md's
"GST rates are settings, never hardcoded" is satisfied by the rate being data on
the record rather than a constant in code.

### `isAvailable` and `isActive` are different questions

`isAvailable` is "can I sell this right now". The kitchen flips it many times a
day and all six roles may do so.

`isActive` is "is this on the menu at all". It is the soft delete, changed rarely
and only by an owner or manager.

Collapsing them into one field would mean a cook marking paneer out of stock and
a manager removing a dish from the menu were the same event, and reinstating one
would reinstate the other.

### Subdocument: Variant

A size or portion. `_id` is on.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | **Permanent once issued.** See below. |
| `name` | String | yes | Trimmed, 1 to 40 characters. Unique within the item, case-insensitive. |
| `priceInPaise` | Number | yes | Integer, minimum 0. **Absolute price, not a delta.** |
| `isAvailable` | Boolean | yes | Default true |

### Subdocument: AddOn

An extra. `_id` is on.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | Permanent once issued, same rule as Variant |
| `name` | String | yes | Trimmed, 1 to 40 characters. Unique within the item, case-insensitive. |
| `priceInPaise` | Number | yes | Integer, minimum 0 |
| `isAvailable` | Boolean | yes | Default true |

Add-ons are typed per item on purpose. There is no shared add-on library, because
"extra cheese" on a pizza and "extra cheese" on a sandwich are different prices
and would drift apart the moment one was edited.

### Variant and add-on ids are permanent

A subdocument `_id`, once issued, is never regenerated. `PATCH /menu-items/:id`
matches incoming entries to existing subdocuments by id and updates them in
place. See API-CONTRACT.md section 5.4 for the exact rule.

M4 attaches a recipe to a `menuItemId` plus an optional `variantId`, and M2
stores a `variantId` on an open order line. Both are foreign keys into this
array. A naive array replacement that regenerated every `_id` on every edit would
silently detach a recipe from its variant the first time a manager renamed
"Half" to "Half Plate", and nothing would notice until M4 ran a deduction.

### The subdocument `toJSON` trap

`baseSchema`'s `toJSON` transform is set on the parent schema and does not
descend into `variants` or `addOns`. Without the same transform on both
subdocument schemas, a response ships an item with `id` whose variants still
carry `_id` and `__v`.

Both subdocument schemas apply the shared transform from
`models/plugins/jsonTransform.js`. There is a test asserting no response body
anywhere in the suite contains the literal string `_id`.

### Deliberately not here

No price history and no scheduled price changes. Changing a price overwrites the
old value. The 7pm order still bills at the 7pm price because M2 copies price,
name and tax rate onto the order line at creation, which is the rule in
CLAUDE.md, not because this collection keeps a history.

No combos or meal bundles. No item images. No time-based pricing.

---

# M5 Employee Attendance

One collection: `attendanceentries`.

It is an ordinary tenant collection. It is not a tenancy root, so it applies
`baseSchemaPlugin` and then `tenantGuardPlugin` in full, and therefore gets
`restaurantId`, `branchId`, `createdAt`, `updatedAt`, the compound
`{ restaurantId, branchId }` index, and the `toJSON` transform that renames
`_id` to `id` and drops `__v`.

| Collection | `baseSchema` plugin | `tenantGuard` plugin |
|---|---|---|
| `attendanceentries` | Yes | Yes |

M5 hangs off M0 alone. It never reads the menu or the ordering chain. The one
number it produces that a later module wants is minutes worked per person,
exposed as `GET /api/v1/attendance/summary` and consumed by M6 when M6 is built.

---

## 7. `attendanceentries`

One clock-in, and the clock-out that closes it, for one person. The record M6's
hours-worked report reads and any future payroll build sums.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema`. From the token, never the body. |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema`. From the token, never the body. |
| `userId` | ObjectId | yes | `users._id` | Whose shift this is. On the self-service and station paths the server sets it; only the two manager endpoints accept it from the body. |
| `clockInAt` | Date | yes | | UTC. The server's clock at clock-in, never a time sent by a client, except on the manager create endpoint. |
| `clockOutAt` | Date | no | | UTC. `null` while the shift is open. The server's clock, or a manager correction. |
| `workedMinutes` | Number | no | | Integer whole minutes. `null` while open. Recomputed from `clockInAt` and `clockOutAt` on every write. Never supplied by a client, never patched directly. |
| `businessDate` | String | yes | | `"YYYY-MM-DD"`. The business day this shift belongs to, derived at clock-in. Never sent by a client. See below. |
| `clockInSource` | String | yes | | Enum `SELF`, `STATION`, `MANAGER`. |
| `clockOutSource` | String | no | | Enum `SELF`, `STATION`, `MANAGER`. `null` while open. |
| `corrections` | [Correction] | yes | | Default `[]`. Append only. Every manager edit, every manual creation, and the station undo write one entry. See the subdocument below. |
| `isVoided` | Boolean | yes | | Default false. The CONVENTIONS section 4 void fields. There is no delete. |
| `voidedAt` | Date | no | | UTC. Set when voided. |
| `voidedBy` | ObjectId | no | `users._id` | Set when voided. |
| `voidReason` | String | no | | Trimmed, 1 to 500 characters. Required when voiding. `MIS_TAP` is the value the station undo writes. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### Subdocument: Correction

One recorded change to an entry. Append only: a correction is never edited or
removed once written, because the audit trail is the point.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `correctedAt` | Date | yes | UTC. The server's clock. |
| `correctedBy` | ObjectId | yes | `users._id`. Who made the change. |
| `field` | String | yes | Enum `clockInAt`, `clockOutAt`, `CREATION`. What changed. `CREATION` marks the seed entry a manual create writes. |
| `previousValue` | String | no | The value before, as an ISO string, or `null`. |
| `newValue` | String | no | The value after, as an ISO string, or `null`. |
| `reason` | String | yes | Trimmed, 1 to 500 characters. A correction with no reason is rejected at validation, never defaulted to `""`. |

The Correction subschema applies the shared `toJSON` transform from
`models/plugins/jsonTransform.js`, the same one the M1 variant and add-on
subdocuments use, so a correction ships as `id`, not `_id`.

### Indexes

Every index starts with `restaurantId`, per CONVENTIONS section 4.

`{ restaurantId: 1, branchId: 1, userId: 1, clockInAt: -1 }` for the register
read and one person's history, both of which list a user's entries newest first.

`{ restaurantId: 1, branchId: 1, businessDate: 1 }` for the summary read, which
groups by user across a range of business days.

`{ restaurantId: 1, branchId: 1, userId: 1 }` **unique, partial on
`{ clockOutAt: null }`**. This is what makes "one open shift per person" a
database constraint rather than a race between two tablets. See below.

### Why the partial unique index, and how it is expressed

Two tablets can call `POST /attendance/clock-in` for the same person in the same
second. A service-layer "do they already have an open shift" check has a window
between its read and its write where both calls pass. The partial unique index
closes it: at most one document per `{ restaurantId, branchId, userId }` may have
`clockOutAt` null, so the second insert fails at the database and the service
turns that into a clean `409 ALREADY_CLOCKED_IN`.

The partial filter is `{ clockOutAt: null }`. MongoDB partial indexes accept
equality expressions, and equality to `null` matches both an explicitly-null
field and a missing one. They do **not** accept `$exists: false`, so an open
shift stores `clockOutAt: null`; a closed shift holds a real date and is not
covered by the index, which is why a person may have many closed entries and
only one open one. Task B verifies this `unique` + partial combination against
`mongodb-memory-server` and a real cluster, the way M1 has a test asserting its
own tenancy tripwire.

### Why `businessDate` is a string, and how it is derived

It is stored as `"YYYY-MM-DD"`, not a `Date` at UTC midnight. A business day is a
label, not an instant: it answers "which day's report does this shift land on",
and it must not change meaning when read in another timezone. A string cannot be
pulled into `Date` arithmetic or shifted by a `getTimezoneOffset()` a later
screen forgot, and it groups cleanly in the summary query.

It is derived once, at clock-in, and never recomputed: take `clockInAt` (UTC),
convert to IST, subtract `restaurants.settings.businessDayStartsAtMinutes`
(default 300), and take the calendar date of the result. A clock-in at
2026-08-29 01:30 IST with the default 05:00 boundary lands on `businessDate`
`"2026-08-28"`, so a shift that ran from 18:00 the previous evening is counted
under the evening it started. A correction to `clockInAt` does **not** move
`businessDate`; to move an entry to another day a manager voids it and recreates
it, so a day that has already been reported on stays stable.

### Why whole minutes

`workedMinutes` is an integer, for the same reason money is whole paise:
fractional hours accumulate rounding error, and two screens that round
differently disagree about someone's pay. Seconds are dropped at computation,
`workedMinutes = floor((clockOutAt - clockInAt) / 60000)`. Task B has real tests
on this arithmetic, including a shift that crosses midnight and one that crosses
the configured business-day boundary, because a quiet bug here is the
money-and-GST equivalent for this module.

### `corrections[]` is embedded, not a shared audit collection

BUILD-PLAN section 7 requires an audit trail on a corrected attendance entry:
who, when, why. There is no shared audit-log collection in the project yet, and
DB-SCHEMA already says M3 will define one for voids and discounts. Rather than
build a general audit collection speculatively, M5 embeds the trail on the entry
as `corrections[]`. When M3 designs the shared collection it decides whether to
pull these in or leave them. This is a deliberate call, decision log D3, not an
oversight.

### Nobody corrects their own entry

A correction, void, or manual create whose actor is the entry's own `userId` is
refused with `422 SELF_CORRECTION_FORBIDDEN`. The audit trail exists because
BUILD-PLAN section 7 calls it the feature that catches a dishonest insider; a
manager who can silently extend their own shift defeats it. This binds an OWNER
too, which is why it is a 422 business rule and not a 403: 403 means not you, 422
means not this by anyone, the M0-C split. A single-owner restaurant therefore
cannot fix its own entries; that cost is accepted, decision log D4. The one
exception is the station undo, described in API-CONTRACT.md section 8.

### An open shift is never auto-closed

A shift left open past 12 hours is almost always a forgotten clock-out. The
server never writes a clock-out time it invented: an auto-close puts a fictional
number into a payroll record. Instead the entry is flagged in the register read
(`requiresAttention: true`) and a manager closes it with a correction and a
reason, decision log D5. The 12-hour threshold is a server constant, not an
environment variable and not client logic.

### Dependency: the staff PIN

`POST /attendance/station/clock` is the shared-tablet path: a staff member taps
their name and types a PIN, and the server records a clock event without issuing
any session. It uses the per-user PIN credential defined in **section 3**
(`users.pinHash`, `pinFailedAttempts`, `pinLockedUntil`), delivered by M0-D.

`attendanceService.stationClock` calls `authService.verifyPin`, which returns
the user id on success and throws `InvalidPinError` / `PinLockedError`
otherwise. It issues no token, so a leaked PIN buys a clock event and nothing
that outlives the request. There is no PIN uniqueness constraint within a
branch: verification takes the `userId` (the person taps their own tile first),
so it asks "is this that person's PIN", never "whose PIN is this".

### Deliberately not here

No `breakMinutes` or paid/unpaid break tracking. A break is a clock-out and a
later clock-in in version 1.

No scheduled shifts or rosters. This collection records what happened, not what
was planned.

No geolocation or device fingerprint on a clock event. The PIN plus the tablet's
own logged-in session is the control.

No `hourlyRateInPaise` or any pay figure. Attendance produces minutes. Turning
minutes into money is payroll, which BUILD-PLAN excludes from version 1.

No pay-period or `businessWeek` field. The summary endpoint takes an explicit
date range; a pay period is payroll's concept to impose later.

---

# M2 Order Taking and KOT

Owner: Rishi.

Four collections: `tables`, `orders`, `kots`, `counters`.

**On the section numbers.** These are 8 to 11 even though M2 was built before
M5, because this section was written *after* M5's. M2 shipped without a
DB-SCHEMA section at all, which broke the precedent M1 and M5 both set, and this
is the backfill. It documents the collections exactly as they were built and
merged; nothing here is a proposal. `attendanceentries` stays section 7 because
four places in this file and in API-CONTRACT.md already point at that number.

All four are ordinary tenant collections. None is a tenancy root, so all four
apply `baseSchemaPlugin` and then `tenantGuardPlugin` in full.

| Collection | `baseSchema` plugin | `tenantGuard` plugin |
|---|---|---|
| `tables` | Yes | Yes |
| `orders` | Yes | Yes |
| `kots` | Yes | Yes |
| `counters` | Yes | Yes |

---

## 8. `tables`

One table on the floor. Version 1 has no floor plan and no coordinates; a table
is a name, a section and a seat count.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | `orders.tableId` points here |
| `restaurantId` | ObjectId | yes | From `baseSchema` |
| `branchId` | ObjectId | yes | From `baseSchema` |
| `name` | String | yes | Trimmed, 1 to 20 characters. "T1", "Garden 4". |
| `nameLower` | String | yes | Internal. Derived from `name`. Never in a response. |
| `section` | String | no | Trimmed, max 40 characters. "Garden", "AC Hall". Null when unset. |
| `seats` | Number | no | Integer 1 to 50. Null when unset. |
| `displayOrder` | Number | yes | Integer, minimum 0, default 0 |
| `isActive` | Boolean | yes | Default true. This is the delete. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes:

`{ restaurantId: 1, nameLower: 1 }` unique. Two tables in one restaurant cannot
share a name, compared case-insensitively.

`{ restaurantId: 1, branchId: 1, isActive: 1, displayOrder: 1 }` for the floor
read.

`nameLower` is the same derived-field technique M1 uses for categories and menu
items, and for the same reason: a collation-aware unique index is only honoured
by queries that specify the same collation, and one written without it silently
answers case-sensitively. Three collections now do this identically.

**A table has no `status` field, and that is deliberate.** Whether a table is
occupied is derived on read from whether an order with an occupying status
points at it. A stored occupancy flag drifts the first time a process dies
mid-write, and then a table is permanently occupied with no order on it and only
a database edit clears it.

---

## 9. `orders`

The record M3 bills from and M4 deducts stock from. The most important
collection in the project after `menuitems`.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | `bills.orderId` will point here |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `orderNumber` | Number | yes | | Sequential per restaurant, from `counters`. Never reused. **Gaps are acceptable here.** |
| `orderType` | String | yes | | Enum `DINE_IN`, `TAKEAWAY` |
| `tableId` | ObjectId | no | `tables._id` | Null on a takeaway |
| `tableName` | String | no | | Snapshot, so renaming a table does not rewrite last month's orders |
| `guestCount` | Number | no | | Integer 1 to 100. Null when unset. |
| `customerName` | String | no | | Trimmed, max 100 characters |
| `customerPhone` | String | no | | Trimmed |
| `status` | String | yes | | Enum `OPEN`, `READY_TO_BILL`, `BILLED`, `CANCELLED` |
| `version` | Number | yes | | Optimistic concurrency. Starts at 1. See below. |
| `lines` | [OrderLine] | yes | | Default `[]`. Append only; a line is never removed. |
| `openedBy` | ObjectId | yes | `users._id` | |
| `openedAt` | Date | yes | | UTC |
| `readyToBillAt` | Date | no | | UTC. Set when the last line is served. |
| `billId` | ObjectId | no | `bills._id` | **Reserved for M3. Null until billed. M2 never sets it.** |
| `isCancelled` | Boolean | yes | | Default false |
| `cancelledAt` | Date | no | | UTC |
| `cancelledBy` | ObjectId | no | `users._id` | |
| `cancelReason` | String | no | | Trimmed, max 200 characters |
| `occupiesTable` | Boolean | yes | | Internal, never in a response. See below. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### Subdocument: OrderLine

`_id` is on. **Every field from `itemName` down to `addOns` is a snapshot**
taken from the menu item when the line was created. Nothing downstream reads a
price back out of `menuitems`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | `kots.lines[].orderLineId` and M4's deduction key point here |
| `menuItemId` | ObjectId | yes | Reference only, for M6 reporting. **Never read for a price.** |
| `itemName` | String | yes | Snapshot of the item name |
| `variantId` | ObjectId | no | The variant subdocument id from the menu item. M4 attaches recipes to it. Null when no variant. |
| `variantName` | String | no | Snapshot. Null when no variant. |
| `unitPriceInPaise` | Number | yes | Integer paise. The variant's price when one was chosen, otherwise the item's base price. |
| `taxRateBps` | Number | yes | Integer basis points. **M3 reads this, not the live menu.** Same name as `menuitems.taxRateBps`, which it is copied from. |
| `quantity` | Number | yes | Integer 1 to 999 |
| `addOns` | [LineAddOn] | yes | Default `[]` |
| `notes` | String | no | Trimmed, max 200 characters. "No onion." |
| `status` | String | yes | Enum `PENDING`, `FIRED`, `READY`, `SERVED`, `CANCELLED` |
| `kotId` | ObjectId | no | `kots._id`. Null until fired. |
| `addedBy` | ObjectId | yes | `users._id` |
| `addedAt` | Date | yes | UTC |
| `firedAt` | Date | no | UTC |
| `readyAt` | Date | no | UTC |
| `servedAt` | Date | no | UTC |
| `cancelledAt` | Date | no | UTC |
| `cancelledBy` | ObjectId | no | `users._id` |
| `cancelReason` | String | no | Trimmed, max 200 characters |
| `wasPrepared` | Boolean | no | **The cancelled-item answer.** Required when cancelling a line that reached the kitchen, refused when cancelling one that did not. M4 reads it to decide whether the ingredients are gone. |
| `categoryId` | ObjectId | no | Added by P03. `categories._id` of the menu item's category **when the line was added**. Null on lines added before P03. |
| `categoryName` | String | no | Added by P03. That category's `name` when the line was added. Null on lines added before P03, or if the category could not be found. |

`categoryId` and `categoryName` are frozen at add time for the same reason price
and name are: if a dish moves category between the order and the bill, the sale
belongs to the category it was ordered under. Reports never read today's
category for an old sale.

### Subdocument: LineAddOn

`_id: false`, on purpose. Nothing addresses one of these by id: an add-on is
changed by cancelling the line and adding a new one, because changing what was
ordered is not an edit.

| Field | Type | Required | Notes |
|---|---|---|---|
| `addOnId` | ObjectId | yes | Points back at the menu item's add-on subdocument, for reporting. Never read for a price. |
| `name` | String | yes | Snapshot |
| `priceInPaise` | Number | yes | Integer paise. Snapshot. |

**An add-on carries no tax rate of its own, and that is a decision, not an
omission.** It is taxed at the parent line's `taxRateBps`. Under GST an add-on
is naturally bundled with the dish it is attached to — a composite supply — and
a composite supply takes the rate of its principal supply. Extra cheese on a 5%
dish is taxed at 5% even if cheese sold alone would not be.

M3 must not look for a rate here, and nobody should add one without changing
the tax code at the same time: a second rate on the same line would break the
per-slab grouping M3 does, because one line would belong to two slabs.

### Derived money fields, computed on read and stored nowhere

Neither of these is a column in this collection. Both are computed by
`serialiseOrder` in `services/orderService.js` every time an order is read, and
both appear in every order response.

`lineTotalInPaise`, on each line:

```
lineTotalInPaise = (unitPriceInPaise + sum of every addOns[].priceInPaise) * quantity
```

Add-ons are added to the unit price *before* multiplying by quantity, so three
paneer tikkas with extra cheese are charged for three lots of cheese. Every
input is a whole-paise integer and the multiplication is exact, so there is no
rounding at this stage and no opportunity for one.

`totals`, on the order:

```json
{ "subtotalInPaise": 72000, "lineCount": 3 }
```

`subtotalInPaise` sums `lineTotalInPaise` over every line that is **not**
`CANCELLED`. A cancelled line keeps its snapshot and stays in the array as
evidence, but nobody is paying for it, so it counts towards neither number.
`lineCount` counts the same live lines.

**This is not a bill.** No tax, no discount, no rounding, no service charge. M3
owns every one of those, and M2 deliberately does not preview them: two pieces
of code that both work out a total will eventually disagree by a rupee and
nobody will trust either. M3's taxable base is built from `lineTotalInPaise`
grouped by the line's `taxRateBps`.

### Indexes

`{ restaurantId: 1, branchId: 1, status: 1, createdAt: -1 }` for the floor and
list reads.

`{ restaurantId: 1, orderNumber: 1 }` unique.

`{ restaurantId: 1, tableId: 1 }` **unique, partial on `{ occupiesTable: true }`**.
`branchId` is deliberately not in the key: the constraint is one live order per
table, and a table already belongs to exactly one branch, so adding `branchId`
would only weaken it if a table document were ever duplicated across branches.
This is what makes "one open order per table" a database constraint rather than
a race between two tablets.

`{ restaurantId: 1, 'lines.menuItemId': 1 }` for M6 reporting and for the M1
guard on removing a variant that an open line still points at.

### `version`, and the only legal way to write an order

`version` is optimistic concurrency. It starts at 1 and the server increments it
on every successful write. It is **not** Mongoose's `__v`, which is about array
positions.

Every write puts the version in the update filter and never reads-then-compares:

```js
findOneAndUpdate({ _id, restaurantId, version }, { ..., $inc: { version: 1 } })
```

A null result is separated into 404 and 409 by one extra scoped read.
`applyVersionedUpdate` in `services/orderService.js` is the only way an order is
written. A read-modify-save reintroduces exactly the lost update the field
exists to prevent, so do not add one.

This is half the answer to the two waiters problem from BUILD-PLAN section 8.
The other half is the partial unique index above.

### `occupiesTable`, and why it exists

It mirrors `status`: true for `OPEN` and `READY_TO_BILL`, false for `BILLED` and
`CANCELLED`. It is internal and never appears in a response.

It exists for one reason. MongoDB's `partialFilterExpression` does not support
`$in`: it accepts one at index-creation time without complaint and then silently
matches nothing, so the unique index looks right and enforces nothing. Equality
is supported, so the partial index filters on this boolean instead of on
`status` directly.

Ordinary queries are free to keep using `status: { $in: OCCUPYING_ORDER_STATUSES }`,
because `$in` works fine outside a `partialFilterExpression` — it is only broken
there. Two `pre` hooks keep the boolean in sync, so no call site has to remember
to set a second field alongside `status`.

**A table is occupied by `OPEN` and by `READY_TO_BILL`, not by `OPEN` alone.**
The customers are still sitting there, unbilled, until a bill exists.
`OCCUPYING_ORDER_STATUSES` in `models/Order.js` is the single definition; the
partial index, the `GET /tables` occupancy lookup, the `TABLE_OCCUPIED` check
and the table-deactivation guard all read from it.

### What M3 must know

`billId` and the `BILLED` status are reserved and untouched. M2 never writes
either. Setting them is M3's job, and it must go through `applyVersionedUpdate`
or an equally version-safe write.

A bill copies `itemName`, `unitPriceInPaise` and `taxRateBps` **from the order
line**, which already copied them from the menu. The bill never reads
`menuitems`. Not for a name, not for a price, not for a tax rate.

The tax rate is called `taxRateBps` on both the menu item and the order line, so
the copy is name-for-name. It was not always: M2 shipped the line field as
`taxRateBasisPoints` and it was renamed on 2026-08-30, before M3 read either,
so that one quantity has one name. `unitPriceInPaise` and `priceInPaise` still
differ, and that difference is meaningful rather than accidental: the line price
is the *chosen variant's* price, which is not always the item's base price.
CONVENTIONS section 2 now carries the one-name-per-quantity rule.

Cancelled lines keep every snapshot value, because a cancelled line is evidence.
A bill must exclude them from its totals; a sales figure that includes cancelled
lines is the soft-delete leak from BUILD-PLAN section 8.

---

## 10. `kots`

One kitchen ticket. Produced by firing an order; never edited afterwards except
to mark lines ready or cancelled.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `kotNumber` | Number | yes | | Sequential per restaurant, from `counters`. Gaps acceptable. |
| `orderId` | ObjectId | yes | `orders._id` | |
| `orderNumber` | Number | yes | | Snapshot, so the ticket reads without a join |
| `orderType` | String | yes | | Enum `DINE_IN`, `TAKEAWAY` |
| `tableName` | String | no | | Snapshot |
| `lines` | [KotLine] | yes | | Default `[]` |
| `firedBy` | ObjectId | yes | `users._id` | |
| `firedAt` | Date | yes | | UTC |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### Subdocument: KotLine

| Field | Type | Required | Notes |
|---|---|---|---|
| `orderLineId` | ObjectId | yes | `orders.lines[]._id` |
| `itemName` | String | yes | Snapshot |
| `variantName` | String | no | Snapshot |
| `quantity` | Number | yes | Integer, minimum 1 |
| `addOnNames` | [String] | yes | Default `[]`. Names only: the kitchen does not need prices. |
| `notes` | String | no | Trimmed, max 200 characters |
| `status` | String | yes | Enum `PENDING`, `READY`, `CANCELLED` |
| `readyAt` | Date | no | UTC |

Indexes: `{ restaurantId: 1, branchId: 1, createdAt: 1 }` for the kitchen
display, `{ restaurantId: 1, orderId: 1 }`, and
`{ restaurantId: 1, kotNumber: 1 }` unique.

**A KOT carries no money.** No price, no tax rate, no total. The kitchen needs
to know what to cook, and a ticket that carries prices is a ticket that can
disagree with the bill.

**A ticket's own status is derived from its lines**, not stored. A partly-ready
ticket is a real state and storing a rollup would let it drift from the lines it
summarises.

Cancelling a fired order line also cancels its matching KOT line. Without that
the kitchen keeps cooking a dish the floor already voided.

---

## 11. `counters`

Atomic sequence generator. Written only by `services/counterService.js`. There
is no controller and no route for this collection, and nothing reads it directly.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `restaurantId` | ObjectId | yes | From `baseSchema` |
| `branchId` | ObjectId | yes | From `baseSchema` |
| `name` | String | yes | Enum `ORDER`, `KOT`. Closed, like the role list. |
| `value` | Number | yes | The last number issued. Starts at 0, so the first number handed out is 1. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Index: `{ restaurantId: 1, branchId: 1, name: 1 }` unique. Two counter documents
for the same sequence would each hand out numbers without knowing about the
other, which is the exact duplicate this collection exists to prevent.

### `BILL` is deliberately absent from the enum, and M3 cannot copy this pattern

A number is reserved by incrementing the counter document, and the order or KOT
is written afterwards. If that write fails, the number is spent and the sequence
has a hole in it.

For order numbers and kitchen ticket numbers that is fine. Nobody audits a
kitchen ticket sequence and a missing number costs nothing.

For bill numbers it is not fine. CLAUDE.md requires bill numbers to be
sequential and never reused, and BUILD-PLAN section 8 names the gap problem
directly: a hole in a bill sequence is a question from an auditor that nobody
can answer. M3 must reserve the number **inside the same transaction that
inserts the bill**, so both commit or neither does, rather than incrementing
first and writing second.

The reasoning is written out in full at the bottom of `models/Counter.js` so M3
does not reuse this by accident.

### Deliberately not here

No floor plan, table coordinates or table merging. One order to one table.

No split bills, item transfers between tables, or course timings.

No printed-KOT record. Firing produces a `kots` document; whether a physical
ticket was printed is not tracked in version 1.

---

# M3 Billing with GST

Owner: Rishi.

Two collections: `bills` and `auditlogs`, plus one additive change to M2's
`counters`.

Both are ordinary tenant collections, `baseSchemaPlugin` then
`tenantGuardPlugin` in full. Neither is a tenancy root.

| Collection | `baseSchema` plugin | `tenantGuard` plugin |
|---|---|---|
| `bills` | Yes | Yes |
| `auditlogs` | Yes | Yes |

**Menu prices are tax-exclusive.** `menuitems.priceInPaise` is the price before
tax, and GST is computed and added on top. This is decision D1 and it follows
from M1 already storing `priceInPaise` and `taxRateBps` as separate fields. It
is the single assumption a chartered accountant must confirm before a pilot; see
the known problems table.

---

## 12. `bills`

One bill for one order. The document a customer is handed and an auditor asks
about.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | `orders.billId` points here |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `billNumber` | String | yes | | The printed number, `"2026-27/000148"`. Unique per restaurant. Never reused. |
| `financialYear` | String | yes | | `"2026-27"`. Indian FY, 1 April to 31 March. The sequence resets here and nowhere else. |
| `billSequence` | Number | yes | | The integer behind `billNumber`, 1 upwards within a financial year. Stored so a gap can be found by arithmetic rather than by parsing strings. In `PREFIX` mode (P02) it is the prefix series' running number, which does not reset each year. |
| `invoiceSeries` | String | no | | Added by P02. The series the number belongs to: the financial year, like `"2026-27"`, in `FINANCIAL_YEAR` mode, or the prefix, like `"CFA/C/"`, in `PREFIX` mode. `null` on bills created before P02, meaning the financial year series. The M19 invoice register groups by it. |
| `orderId` | ObjectId | yes | `orders._id` | One bill per order. See the partial unique index below. |
| `orderNumber` | Number | yes | | Snapshot, so a bill reads without a join |
| `orderType` | String | yes | | Enum `DINE_IN`, `TAKEAWAY`. Snapshot. |
| `tableName` | String | no | | Snapshot |
| `businessDate` | String | yes | | `"YYYY-MM-DD"`, derived once at creation by `businessDateFor`. Never recomputed. |
| `status` | String | yes | | Enum `UNPAID`, `PAID`. A voided bill keeps its last status and sets `isVoided`. |
| `lines` | [BillLine] | yes | | Copied from the order's live lines at creation. Frozen. |
| `subtotalInPaise` | Number | yes | | Sum of `lineTotalInPaise` over `lines`. Pre-tax, pre-discount. |
| `discount` | Discount | no | | Null when none. See the subdocument. |
| `taxBreakdown` | [TaxSlab] | yes | | One row per distinct `taxRateBps`. The printed CGST/SGST lines. |
| `totalTaxInPaise` | Number | yes | | Sum of `taxBreakdown[].taxInPaise` |
| `roundOffInPaise` | Number | yes | | Signed, −49 to +50. What was added to reach a whole rupee. |
| `grandTotalInPaise` | Number | yes | | `subtotal − discount + totalTax + roundOff`. A whole multiple of 100. |
| `payments` | [Payment] | yes | | Default `[]` |
| `amountPaidInPaise` | Number | yes | | Sum of `payments[].amountInPaise`. Default 0. |
| `billedBy` | ObjectId | yes | `users._id` | Who created it |
| `billedAt` | Date | yes | | UTC |
| `paidAt` | Date | no | | UTC. Set when `amountPaid` first reaches `grandTotal`. |
| `isVoided` | Boolean | yes | | Default false. The CONVENTIONS section 4 void fields. |
| `voidedAt` | Date | no | | UTC |
| `voidedBy` | ObjectId | no | `users._id` | |
| `voidReason` | String | no | | Trimmed, 1 to 500 characters. Required when voiding. |
| `captainId` | ObjectId | no | `users._id` | Added by P03. `orders.openedBy`, frozen at bill creation. "Captain" is the person who opened the order (GLOSSARY section 8). Null on bills created before P03. |
| `captainName` | String | no | | Added by P03. The captain's `name`, read when the bill is created, or `"Unknown"` if the user cannot be found. Renaming the user later does not change it. |
| `guestCount` | Number | no | | Added by P03. `orders.guestCount`, frozen. Covers. Null on a takeaway and on bills created before P03. |
| `orderOpenedAt` | Date | no | | Added by P03. `orders.openedAt`, frozen. UTC. For table time. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### Subdocument: BillLine

Copied from the order line at bill creation, which had already copied from the
menu. `_id: false`: nothing addresses a bill line individually, because a bill
is never edited.

| Field | Type | Required | Notes |
|---|---|---|---|
| `orderLineId` | ObjectId | yes | `orders.lines[]._id`, for tracing back |
| `menuItemId` | ObjectId | yes | Reference only, for M6 |
| `itemName` | String | yes | Snapshot of a snapshot |
| `variantName` | String | no | Snapshot |
| `addOnNames` | [String] | yes | Default `[]`. Names only; their prices are already inside `lineTotalInPaise`. |
| `quantity` | Number | yes | Integer |
| `unitPriceInPaise` | Number | yes | Integer paise, including add-ons: the per-unit price actually charged |
| `taxRateBps` | Number | yes | Integer basis points. The slab this line falls in. |
| `lineTotalInPaise` | Number | yes | `unitPriceInPaise * quantity`. Stored, not derived, because a bill is frozen. |
| `categoryId` | ObjectId | no | Added by P03. Copied from the order line. Null for lines on orders created before P03. |
| `categoryName` | String | no | Added by P03. Copied from the order line. Same. |
| `discountShareInPaise` | Number | no | Added by P03. This line's share of the bill discount. Integer, 0 or more. |
| `taxableInPaise` | Number | no | Added by P03. `lineTotalInPaise − discountShareInPaise`. Line net sales. |
| `taxInPaise` | Number | no | Added by P03. This line's share of its tax rate's GST. Integer, 0 or more. |

**Line shares (P03).** The three share fields are written on every bill created
or re-discounted from P03 onwards, by `allocateLineShares` in
`server/utils/tax.js`. Inside each tax rate on the bill, separately: the rate's
discount (the sum of its line totals minus the slab's `taxableInPaise`) is split
across its lines in proportion to line total, by the largest remainder method —
whole paise rounded down, then the paise left over one at a time to the largest
leftover fractions, ties to the earlier line. The slab's `taxInPaise` is then
split the same way in proportion to each line's `taxableInPaise`. The shares
therefore always add up exactly to the bill's discount and to each slab's
figures (check C2). `computeBillTotals` is unchanged; this splits its output.
On bills created before P03 the three fields are absent and mean "not
recorded". Old bills are not back-filled.

**Cancelled order lines are not copied.** Only lines whose status is not
`CANCELLED` become bill lines. This is the soft-delete leak from BUILD-PLAN
section 8 closed at the point it would first appear.

### Subdocument: Discount

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | String | yes | Enum `FLAT`, `PERCENT` |
| `valueInPaise` | Number | no | Set when `kind` is `FLAT`. Integer paise. |
| `rateBps` | Number | no | Set when `kind` is `PERCENT`. Integer basis points, 1 to 10000. |
| `amountInPaise` | Number | yes | The resolved rupee amount taken off, whichever kind it was. This is what the arithmetic uses. |
| `reason` | String | yes | Trimmed, 1 to 200 characters. Never defaulted to `""`. |
| `appliedBy` | ObjectId | yes | `users._id` |
| `appliedAt` | Date | yes | UTC |

Bill-level only. There is no per-line discount in version 1: a line-level
discount multiplies the per-slab apportionment below by the number of lines, and
the arithmetic is where this module can lose a customer's money.

### Subdocument: TaxSlab

One row per distinct `taxRateBps` on the bill. This is what prints.

| Field | Type | Required | Notes |
|---|---|---|---|
| `taxRateBps` | Number | yes | 0, 500, 1800, and so on |
| `taxableInPaise` | Number | yes | Sum of `lineTotalInPaise` at this rate, **after** its share of the discount |
| `taxInPaise` | Number | yes | `applyBasisPoints(taxableInPaise, taxRateBps)` |
| `cgstInPaise` | Number | yes | Half, rounded up when the total is odd |
| `sgstInPaise` | Number | yes | `taxInPaise − cgstInPaise` |

### Subdocument: Payment

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `method` | String | yes | Enum `CASH`, `UPI`, `CARD`, `OTHER` |
| `amountInPaise` | Number | yes | Integer, 1 or more |
| `reference` | String | no | Trimmed, max 100 characters. A UPI reference or the last four digits of a card. Never a full card number. |
| `receivedBy` | ObjectId | yes | `users._id` |
| `receivedAt` | Date | yes | UTC |

`payments` is an array so a split bill is possible without a migration. The
version 1 screen defaults to one payment for the full amount, so nobody pays for
the flexibility in taps. No gateway, no money movement: BUILD-PLAN section 4.

### Indexes

`{ restaurantId: 1, billNumber: 1 }` unique. The number is the thing an auditor
quotes, so it is unique per restaurant rather than per branch.

`{ restaurantId: 1, branchId: 1, financialYear: 1, billSequence: 1 }` unique.
The same guarantee expressed in integers, which is what a gap check reads.

`{ restaurantId: 1, orderId: 1 }` **unique, partial on `{ isVoided: false }`**.
One live bill per order. A voided bill leaves the order billable again, which is
why the filter is on `isVoided` rather than the whole collection. Same technique
as M2's one-open-order-per-table index, and for the same reason: a
check-then-write in a controller has a race in the middle.

`{ restaurantId: 1, branchId: 1, businessDate: 1, isVoided: 1 }` for the day's
bill list and every M6 sales read.

### The arithmetic, in one place

All of it lives in `server/utils/tax.js` and nothing outside that file computes
tax, the same rule that keeps money arithmetic inside `server/utils/money.js`.

**Rounding is per slab, not per line and not on the total.** Group the live
lines by `taxRateBps`, sum the taxable value of each group, then round that
group's tax once. Rounding each line separately and adding gives a different
answer from adding and rounding once, and BUILD-PLAN section 8 names this as a
thing that makes the printed bill and the report disagree by a rupee. Per slab
is chosen because that is exactly how a GST invoice prints — CGST and SGST shown
against each rate — so the bill and any later report are reading the same
numbers.

**A discount is apportioned across slabs before tax is computed.** A bill-level
discount reduces taxable value, so it cannot simply come off the grand total.
Each slab takes a share in proportion to its share of the subtotal:

```
slabShare = round_half_away(discountAmount * slabSubtotal / subtotal)
```

Apportioned shares are then corrected so they sum to the discount exactly: any
remainder from rounding is added to the slab with the largest taxable value.
Without that correction the shares can miss the discount by a paisa and the
grand total stops reconciling.

**CGST takes the extra paisa.** Intra-state supply splits in half, and when a
slab's tax is an odd number of paise the halves are unequal. `cgst = ceil(tax/2)`
and `sgst = tax − cgst`, always, so the split is deterministic and the two always
re-add to the total. There is a test asserting it.

**There is no IGST in version 1.** A dine-in restaurant in Ahmedabad serving a
customer in Ahmedabad is always an intra-state supply. Interstate supply is a
different form and a different return; stating its absence here is deliberate so
a reader does not assume it was forgotten.

**Round-off is last.** The grand total is rounded to the nearest whole rupee
after tax, and the difference is stored signed in `roundOffInPaise` so the
printed bill can show it. `grandTotalInPaise` is therefore always a multiple of
100.

### Bill numbers, and why this cannot reuse M2's counter as-is

`counters` gains one name, `BILL`, and one new field, `scope`.

M2's `nextNumber` increments the counter and the caller writes the document
afterwards. If that write fails the number is spent and the sequence has a hole.
For an order or a kitchen ticket that is fine and `models/Counter.js` says so.

For a bill it is not. CLAUDE.md requires bill numbers to be sequential and never
reused, and BUILD-PLAN section 8 names the gap as a question from an auditor
nobody can answer. So M3 reserves the number **inside the same transaction that
inserts the bill**: both commit or neither does, and an aborted insert rolls the
counter back with it.

**Bill creation therefore requires a transaction and refuses to run without
one.** This is a deliberate difference from every other write in the project,
which uses `withOptionalTransaction` and degrades gracefully on a standalone
`mongod`. A gap-free sequence is not something that can degrade gracefully:
without a transaction the guarantee is simply absent, and silently issuing
gappy bill numbers on a developer machine is how the pattern reaches production.
Atlas and the test replica set both support transactions, so this costs nothing
real.

The `scope` field carries the financial year, because the sequence resets each
year while `name` stays `BILL`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `scope` | String | no | Default `null`. `"2026-27"` on a `BILL` counter. `ORDER` and `KOT` counters leave it null. |

P02 adds a second kind of `BILL` scope. In `PREFIX` invoice mode the scope is
`"PREFIX:"` followed by the prefix, for example `"PREFIX:CFA/C/"`. That counter
never resets. It is created with `$setOnInsert: { value: startingNumber - 1 }`,
inside the bill transaction, so the first bill of a new series is
`startingNumber`. A `PREFIX:` counter whose value is above zero is how the
settings rules know a prefix "has issued bills".

The unique index becomes `{ restaurantId: 1, branchId: 1, name: 1, scope: 1 }`.
This is additive: existing `ORDER` and `KOT` documents have no `scope`, which
indexes as null, and their uniqueness is unchanged.

**That unique index is load-bearing, not decorative.** The reservation is an
upsert, so the very first bill of a financial year has two transactions both
finding no counter and both trying to create one. The index is what makes the
second fail with a duplicate key, which `withTransaction` then retries against
the row the first one committed. Without the index both inserts succeed and both
callers are handed sequence 1.

This is not theoretical: the concurrency test caught it. It passed when run
alone and failed under the full suite, because index creation is asynchronous
and had not finished before ten transactions raced. Production builds indexes
during a deploy — `autoIndex` is off outside development, a decision from
2026-08-28 — so the index is there before traffic is. Anything that creates this
collection by hand must create the index with it.

`financialYearFor(instant)` lives in `server/utils/time.js` beside
`businessDateFor`, so no caller does its own date arithmetic. The Indian
financial year runs 1 April to 31 March, so 2026-08-30 is `"2026-27"` and
2027-02-14 is also `"2026-27"`.

### Deliberately not here

No service charge and no tip. Both are policy decisions a restaurant makes and
neither is a tax; adding them changes the taxable base and needs the CA in the
room.

No credit notes or partial refunds. A wrong bill is voided and re-issued, which
is what a restaurant of this size actually does.

No customer GSTIN or B2B invoice fields. Version 1 prints a B2C bill.

No split-by-cover or per-guest bills. One order, one bill: decision D8, following
M2 shipping one order per table with no merge path.

---

## 13. `auditlogs`

Who did the thing that involved money or trust, when, and why.

BUILD-PLAN section 7 requires an audit trail on voiding a bill, applying a
discount, correcting an attendance entry and adjusting stock, and calls it the
feature that sells the product to an owner losing money to a dishonest cashier.
M5 decision D3 deferred the shared collection to M3 on the grounds that M3 is
the module that would need it. This is that collection.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `action` | String | yes | | Enum. See below. |
| `entityType` | String | yes | | Enum `BILL`, `STOCK`, `ORDER`, `SETTINGS` |
| `entityId` | ObjectId | yes | | The record acted on |
| `entityLabel` | String | no | | A human handle that survives, such as the bill number. So a log line reads without a join. |
| `actorId` | ObjectId | yes | `users._id` | |
| `actorRole` | String | yes | | Snapshot of the role at the time, because roles change |
| `at` | Date | yes | | UTC |
| `reason` | String | yes | | Trimmed, 1 to 500 characters. Never defaulted to `""`. |
| `amountInPaise` | Number | no | | The money involved, where there is one: the discount given, the bill voided. |
| `details` | Mixed | no | | Small, flat, and free of personal data. Not a dumping ground. |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

`action` is a closed enum: `BILL_VOIDED`, `DISCOUNT_APPLIED`,
`STOCK_ADJUSTED`, `ORDER_CANCELLED`, `SETTINGS_CHANGED`.

`entityType` gained `SETTINGS` alongside it. Both were appended by M7; see
section 18 for the shape of a settings audit line.

Indexes:

`{ restaurantId: 1, branchId: 1, at: -1 }` for the audit read.

`{ restaurantId: 1, entityType: 1, entityId: 1 }` for "everything that happened
to this bill".

**Append only.** There is no update and no delete endpoint, and no code path
writes to an existing document. A tamperable audit log is worse than none,
because it is trusted.

**M5's `corrections[]` stay where they are.** Decision D3 left M3 to decide
whether to absorb them, and the answer is no: they are shipped, tested and
embedded on the entry they describe, and rewriting live attendance data to move
an audit trail gains nothing operational and risks the one record that exists to
be trustworthy. Two shapes, each documented. If M6 ever needs one feed it reads
both.

No personal data goes in `details`. BUILD-PLAN section 7 keeps staff names and
phone numbers out of logs, and this collection is a log.

---

# M4 Inventory with recipe deduction

Owner: Arya.

Three collections: `ingredients`, `recipes`, `stockmovements`. All ordinary
tenant collections, `baseSchemaPlugin` then `tenantGuardPlugin` in full.

| Collection | `baseSchema` plugin | `tenantGuard` plugin |
|---|---|---|
| `ingredients` | Yes | Yes |
| `recipes` | Yes | Yes |
| `stockmovements` | Yes | Yes |

BUILD-PLAN section 3 calls this the hardest logic in the version 1 build. Four
things in it are load-bearing and each has its own note below: units,
idempotency, the append-only ledger, and what happens when a recipe is missing.

---

## 14. `ingredients`

A raw material with a stock level. Paneer, oil, a soft-drink bottle.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | `recipes.items[].ingredientId` and `stockmovements.ingredientId` point here |
| `restaurantId` | ObjectId | yes | From `baseSchema` |
| `branchId` | ObjectId | yes | From `baseSchema` |
| `name` | String | yes | Trimmed, 1 to 80 characters |
| `nameLower` | String | yes | Internal, derived. Never in a response. Same technique as M1 and M2. |
| `baseUnit` | String | yes | Enum `G`, `ML`, `PIECE`. **Immutable once any movement exists.** |
| `currentQtyInBase` | Number | yes | Integer in the base unit. Default 0. **May be negative.** A cache; see below. |
| `lowStockThresholdInBase` | Number | yes | Integer, minimum 0, default 0. Low stock is computed on read against this. |
| `purchaseUnitName` | String | no | Display only. "kg", "litre", "packet", "box". Null means the base unit is also how it is bought. |
| `unitsPerBase` | Number | yes | Integer, minimum 1, default 1. How many base units are in one purchase unit. 1 kg of paneer is `1000` with `baseUnit: G`. |
| `isActive` | Boolean | yes | Default true. This is the delete. |
| `createdAt` | Date | auto | UTC |
| `updatedAt` | Date | auto | UTC |

Indexes:

`{ restaurantId: 1, branchId: 1, nameLower: 1 }` unique.

`{ restaurantId: 1, branchId: 1, isActive: 1, name: 1 }` for the stock list.

### Exactly three base units, and everything is an integer

`G`, `ML`, `PIECE`. Nothing else. This is decision D11 and it exists to kill the
factor-of-one-thousand bug BUILD-PLAN section 8 names: paneer bought in
kilograms and used in grams, where the recipe and the stock record disagree
about units and every deduction is out by 1000×.

Both stock levels and recipe quantities are stored as **integers in the base
unit**, never as a float and never in a purchase unit, for exactly the reason
money is whole paise. A recipe asking for 0.15 kg is stored as `150` with
`baseUnit: G`.

A purchase unit is an entry and display convenience only. A storekeeper types
"2" against a kilogram tile and the screen shows "2 kg = 2000 g" underneath, and
`server/utils/units.js` is the only place that multiplies. Nothing else in the
server converts, so there is one function to get right and one to test.

**`baseUnit` is immutable once any `stockmovements` document references the
ingredient.** Changing it would silently reinterpret every historical quantity
in the ledger — 500 g of paneer becoming 500 ml — and there is no way to detect
that after the fact. Attempting it is a 422.

### `currentQtyInBase` is a cache, and the ledger is the truth

It exists so a stock list does not aggregate the whole ledger on every read. It
is maintained by `$inc` **inside the same transaction** that inserts the
movement, so the two cannot diverge by a failed write.

There is a test that recomputes every ingredient's quantity by summing its
movements and asserts it equals the cached value. If that test ever fails the
cache is wrong and the ledger is right.

### Negative stock is allowed, and is not blocked

The kitchen cooked the dish whether or not the system agreed there was paneer
left. A system that refuses a sale because a number is wrong gets worked around
within a week, and then it holds no useful data at all.

So a deduction that would take a quantity below zero is applied anyway. The
ingredient reads as out of stock and is flagged loudly in the stock list and the
low-stock read. Nothing is blocked, ever, on the ordering or billing path.

### Deliberately not here

No cost price and no stock valuation. Attendance produces minutes and this
produces quantities; turning either into money is a separate build. M6 reports
consumption, not margin. The known problems table already records that there is
no price history, which is the other half of a margin report.

No supplier, purchase order or goods-received document. BUILD-PLAN section 4
defers vendors until inventory numbers are trusted, which is after a pilot.

No batch, expiry or FEFO tracking. No per-storeroom locations.

---

## 15. `recipes`

What one sellable thing consumes. The join between M1's menu and M4's stock.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `menuItemId` | ObjectId | yes | `menuitems._id` | |
| `variantId` | ObjectId | no | `menuitems.variants[]._id` | Null means this is the item-level recipe. See the fallback below. |
| `items` | [RecipeItem] | yes | | Default `[]`. At most 50. |
| `isActive` | Boolean | yes | | Default true |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

### Subdocument: RecipeItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `ingredientId` | ObjectId | yes | `ingredients._id` |
| `qtyInBase` | Number | yes | Integer, minimum 1, in that ingredient's base unit. Per one unit of the dish. |

`_id: false`. A recipe line is identified by its `ingredientId`, which is unique
within the recipe, so it needs no id of its own.

Indexes:

`{ restaurantId: 1, branchId: 1, menuItemId: 1, variantId: 1 }` unique. One
recipe per item, and one per variant.

`{ restaurantId: 1, 'items.ingredientId': 1 }` for "what uses this ingredient",
which is also the lookup that blocks deactivating an ingredient still in use.

### The variant fallback, and the missing recipe

When a line sells, the deduction looks for a recipe in this order:

1. A recipe for this `menuItemId` **and** this `variantId`.
2. Failing that, the recipe for this `menuItemId` with `variantId: null`.
3. Failing that, **nothing is deducted, and the sale succeeds.**

Case 3 records a `NO_RECIPE` note against the order line rather than raising an
error. Blocking a sale because inventory is half configured is the fastest way
to get the whole module switched off during a rush, and a restaurant that cannot
fire a KOT at 8pm will not use this software at all.

The honest answer to "then how does anyone find out" is a read: `GET
/inventory/unmapped` lists menu items that have sold with no recipe attached,
newest first. That list is also the seed-data gap from BUILD-PLAN section 8
answered in a way somebody will actually look at.

A half plate falling back to the full plate's recipe would over-deduct, which is
why step 1 is tried first. If a variant genuinely uses the same quantities, the
item-level recipe is the right place to say so once.

---

## 16. `stockmovements`

The ledger. Every change to a stock level is one row here, and this collection
is the truth about what happened.

| Field | Type | Required | Links to | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | | |
| `restaurantId` | ObjectId | yes | `restaurants._id` | From `baseSchema` |
| `branchId` | ObjectId | yes | `branches._id` | From `baseSchema` |
| `ingredientId` | ObjectId | yes | `ingredients._id` | |
| `qtyInBase` | Number | yes | | **Signed integer.** Negative consumes, positive adds. Never zero. |
| `type` | String | yes | | Enum. See below. |
| `eventKey` | String | yes | | The idempotency key. See below. |
| `sourceType` | String | yes | | Enum `ORDER_LINE`, `MANUAL` |
| `orderId` | ObjectId | no | `orders._id` | Set when `sourceType` is `ORDER_LINE` |
| `orderLineId` | ObjectId | no | `orders.lines[]._id` | Set when `sourceType` is `ORDER_LINE` |
| `reason` | String | no | | Required for every `MANUAL` movement. Trimmed, 1 to 200 characters. |
| `resultingQtyInBase` | Number | yes | | The ingredient's quantity after this movement. A snapshot, so the ledger can be read as a running balance without replaying it. |
| `actorId` | ObjectId | yes | `users._id` | Who caused it. On a deduction, whoever fired the KOT. |
| `at` | Date | yes | | UTC |
| `createdAt` | Date | auto | | UTC |
| `updatedAt` | Date | auto | | UTC |

`type` is a closed enum:

| Type | Sign | Raised by |
|---|---|---|
| `DEDUCTION` | negative | Firing a KOT line |
| `CANCELLATION_RETURN` | positive | Cancelling a fired line answered `wasPrepared: false` |
| `RECEIVED` | positive | Manual: stock arrived |
| `WASTAGE` | negative | Manual: spoiled |
| `SPILLAGE` | negative | Manual: dropped |
| `RECOUNT` | either | Manual: a physical count disagreed with the system |
| `RETURN` | positive | Manual: sent back to a supplier, or returned from the kitchen |

### Indexes

`{ restaurantId: 1, eventKey: 1 }` **unique.** This is the idempotency
guarantee, and it is an index rather than a check because a check has a race in
the middle of it.

`{ restaurantId: 1, branchId: 1, ingredientId: 1, at: -1 }` for one
ingredient's ledger, newest first.

`{ restaurantId: 1, branchId: 1, at: -1 }` for the consumption read M6 will
want.

### Idempotency, which is the thing most likely to break

A request is retried. A KOT is fired twice because a tablet lost its answer and
the waiter pressed again. An event is delivered twice. None of these may deduct
twice, because the second deduction is invisible: the number is simply wrong
from then on, and nothing ever flags it.

Every movement therefore carries a natural key:

```
eventKey = `${orderLineId}:${ingredientId}:${type}`  for sourceType ORDER_LINE
eventKey = `MANUAL:${new ObjectId()}`                for sourceType MANUAL
```

with a unique index on `{ restaurantId, eventKey }`. A repeat insert fails on
the duplicate key, the service catches exactly that error, undoes the `$inc` it
had already applied to the ingredient — the increment happens before the
insert, so it can be caught this way — and returns the movement that already
exists. A retry is a no-op, not an error and not a second row.

The key is per order **line and per ingredient**, not per line alone. A single
fired line's recipe usually touches more than one ingredient — Paneer Tikka
needs paneer, oil, and a spice mix — and one `DEDUCTION` movement is written
per ingredient. Keying only on `orderLineId:type` was the first draft of this
spec and it was wrong: the second ingredient's insert would have collided with
the first's on the unique index, and the idempotency guard would have silently
treated a genuinely new deduction as a duplicate and skipped it. Caught before
any code was written against it. It also still includes `type` so a
`CANCELLATION_RETURN` can exist alongside the `DEDUCTION` it reverses, and it
is per order **line**, not per order, because lines are fired in separate KOTs
at different times.

There is a test that calls the deduction twice and asserts the stock level moved
once. It is the single most important test in M4.

### Append only

A movement is never updated and never deleted. There is no endpoint that does
either and no code path that writes to an existing document.

A mistake is corrected by writing a **new, compensating movement** with a reason
and a user, exactly as a ledger works. If someone recorded 5 kg of wastage that
was really 500 g, the fix is a `RECOUNT` of +4500 g with the reason saying so,
not an edit that makes the first entry disappear.

This is the same rule as never hard deleting a bill, applied to the collection
where a dishonest correction would be worth the most.

### Cancel after fire, and what it does to stock

This follows M2's `wasPrepared`, which already exists on every order line and is
already tested. M4 adds no second mechanism.

Deduction happens at **KOT fire**, because that is when the ingredients
physically leave the shelf. Deducting at bill settlement would mean a table that
ate and walked out never deducted anything and stock drifted up forever.

When a fired line is cancelled:

`wasPrepared: true` — the food was made and the ingredients are gone. **Nothing
is written.** The deduction stands.

`wasPrepared: false` — it was never cooked. One `CANCELLATION_RETURN` movement
per recipe item puts the quantities back.

A line cancelled while still `PENDING` never reached the kitchen, so no
`DEDUCTION` exists for it and nothing is returned. M4 must key that decision on
**whether a `DEDUCTION` movement exists for the line**, not on `wasPrepared`
alone: `wasPrepared` is null on such a line by the rule fixed on 2026-08-30, but
the ledger is the reliable answer and the ledger is what M4 already reads.

**A voided bill never restocks automatically.** The food was made and eaten; the
bill being wrong does not put paneer back in the fridge. If it genuinely was not
consumed, a storekeeper writes a manual adjustment with a reason, and that is
visible in the audit log where an owner can see it. An automatic restock on void
is a way to turn a dishonest void into free inventory.

---

# M6 Reports and Dashboard

Owner: Rishi.

**M6 has no collections. It adds no model file, no field to any existing
collection, and no index.** This section exists so that a reader looking for
M6's schema finds this statement rather than an absence and wonders whether
something was forgotten.

Every M6 endpoint is a read that aggregates over collections other modules
already own and have frozen:

| Read from | Owned by | What M6 takes from it |
|---|---|---|
| `bills` | M3 | Every revenue, tax, discount and payment figure |
| `orders` | M2 | Open-order count and running value, for the dashboard only |
| `stockmovements` | M4 | Consumption, wastage and returns |
| `attendanceentries` | M5 | Minutes worked, and open shifts |
| `ingredients` | M4 | Low-stock rows, and a name and base unit for a movement |
| `users` | M0 | A name and role against a userId in a report row |

### The indexes M6 depends on already exist

M6 adds none, and needs none added, because each module already indexed the
shape its own reads needed and M6's reads are the same shape:

`bills` has `{ restaurantId, branchId, businessDate, isVoided }`, which is
exactly the leading filter on every sales, tax, discount and payment
aggregation.

`attendanceentries` has `{ restaurantId, branchId, businessDate }`.

`stockmovements` has `{ restaurantId, branchId, at }`, which is why the
consumption report converts a business-date range into a UTC instant range
rather than the other way round: that collection stores `at` and has no
`businessDate` field, so matching on an instant uses the index and deriving a
business date per row would not.

If a report is ever measurably slow on real data, the fix is an index on the
collection that owns the data, added by that module's section above, not a new
collection here.

### Why there is no rollup collection

Every figure is aggregated live on every request. A materialised daily-summary
collection would be a second source of truth for numbers that already exist,
and the failure mode is the worst kind: a stale rollup disagrees with the bills
it was built from, both look plausible, and nobody knows which to believe.

A restaurant of this size does a few hundred bills a day. The indexes above
cover every query. Revisit only if a real query is measurably slow against
real data, and then measure first.

### What M6 must never do to the data it reads

Never write. There is no `POST`, `PATCH`, `PUT` or `DELETE` in this module.

Never recompute a figure another module already stored. Tax in particular is
summed from `bills.taxBreakdown`, never recalculated from line totals: M3
rounded it once per slab under a documented rule, and a second implementation
here would disagree with the printed bill by a rupee. The same applies to
`workedMinutes`, which M5 computed and stored.

Never invent a value for a null. An open shift has `workedMinutes: null`
because M5 deliberately refuses to invent a clock-out time, and M6 refuses in
exactly the same way: an open shift contributes zero minutes and is listed
separately, never counted as elapsed-time-so-far.

Never include a voided record in a total. `bills.isVoided` and
`attendanceentries.isVoided` are excluded in the first `$match` of every
pipeline, not filtered out afterwards.

---

# M7 Restaurant Settings

Owner: Rishi.

**M7 adds no collection.** It expands the `settings` object already on
`restaurants` (section 1) and appends one value to each of the two `auditlogs`
enums (section 13). Nothing else in the database changes, and there is no
migration.

---

## 17. `restaurants.settings`, expanded

Every field below has a schema default. An existing restaurant document holding
only `settings.businessDayStartsAtMinutes` reads back a complete settings object
with every group filled in, because Mongoose applies subdocument defaults on
read for missing paths. **There is no migration and no backfill script**, and
adding one later would be a way to get this wrong rather than a way to fix it.

### `settings.businessDayStartsAtMinutes` — pre-existing, unmoved

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `settings.businessDayStartsAtMinutes` | Number | yes | 300 | Integer 0 to 1439. Minutes past midnight IST at which the business day rolls over. Added by M5, decision log D1. |

**It stays at the top level of `settings`. It is not nested under
`settings.business`.** M3 derives every bill's `businessDate` from it, M5 derives
every attendance entry's, and M6 reads it for every report. Nesting it for
tidiness would break three shipped modules at once and require a migration on
the one field that decides which day a sale belongs to.

The API groups it under `business` for readability. That mapping lives in
`services/settingsService.js` and nowhere else: the service reads and writes the
top-level path and presents the grouped one. See API-CONTRACT.md section M7.

### `settings.tax`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `pricingMode` | String | yes | `EXCLUSIVE` | Enum `EXCLUSIVE`, `INCLUSIVE`. Whether `menuitems.priceInPaise` is before or after GST. **Stored and deliberately not consumed.** |
| `defaultTaxRateBps` | Number | yes | 500 | Integer 0 to 10000. The rate `POST /menu-items` fills in when the body omits `taxRateBps`. |
| `roundOffEnabled` | Boolean | yes | true | Whether a bill rounds to the nearest rupee. **Stored and deliberately not consumed.** |

`pricingMode` and `roundOffEnabled` are read by nothing. M3's tax code is frozen,
tested to the paisa, and carries a documented per-slab rounding rule; rewiring it
from inside a settings module is how billing breaks quietly. Wiring them is its
own task, and it must not run before a chartered accountant has confirmed which
pricing mode the pilot restaurant actually uses. That confirmation is decision
D1's open risk in BUILD-PLAN section 14.

`defaultTaxRateBps` changes only the API's default. `menuitems.taxRateBps` stays
required on every stored document, an explicitly sent rate always wins, and an
item created today keeps its own rate forever. Changing this setting tomorrow
does not touch a single existing item, which is the same snapshot discipline
order lines already follow.

### `settings.receipt`

Consumed by nothing until Phase 2 thermal printing exists. Stored now because
the values are worth collecting during onboarding.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `headerLine1` | String | no | `null` | Trimmed, max 40 characters. Printed above the restaurant name. |
| `headerLine2` | String | no | `null` | Trimmed, max 40 characters. |
| `footerText` | String | no | `null` | Trimmed, max 200 characters. |
| `showGstin` | Boolean | yes | true | Print the GSTIN on the bill. |
| `showFssai` | Boolean | yes | true | Print the FSSAI licence number. |
| `showServerName` | Boolean | yes | false | Print who took the order. |

Forty characters is not arbitrary. An 80mm thermal roll fits roughly 42
characters per line at normal font, and a longer line wraps and destroys the
layout. That is the printer problem from BUILD-PLAN section 12, caught at data
entry rather than in a kitchen during Phase 2.

### `settings.inventory`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `lowStockAlertsEnabled` | Boolean | yes | true | Whether the low-stock list is surfaced. When false the low-stock reads return an empty list and the dashboard returns an empty `lowStock` array. Stock quantities are untouched; only the surfacing is switched off. |

### `settings.features` (added by P02)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `inventory` | Boolean | yes | true | M4 is in use. When false, the inventory routes and the stock report refuse with `FEATURE_DISABLED`, and firing or cancelling writes no `stockmovements`. Existing movements are never touched. |
| `attendance` | Boolean | yes | true | M5 is in use. When false, the attendance routes and the labour report refuse with `FEATURE_DISABLED`. |

The defaults are `true` so nothing changes for an existing restaurant. Caffeza's
setup in P11 switches both off.

### `settings.invoice` (added by P02)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `mode` | String | yes | `FINANCIAL_YEAR` | Enum `FINANCIAL_YEAR`, `PREFIX` |
| `prefix` | String | no | `null` | `PREFIX` mode only. 1 to 7 characters of letters, digits, `/` and `-`. |
| `startingNumber` | Number | no | `null` | `PREFIX` mode only. Integer 1 to 999,999,999. The first number a new prefix series issues. |

Seven plus nine is sixteen, the GST limit on an invoice number's length. The
rules that stop a change from breaking the unique indexes on `bills` are in
API-CONTRACT.md section M7 3, and live in `settingsService`.

---

## 18. `auditlogs`, two appended enum values

Section 13 is otherwise unchanged. Both additions are append-only to a closed
enum, the same discipline `utils/errors.js` follows.

`action` gains `SETTINGS_CHANGED`. `entityType` gains `SETTINGS`.

One document per field that actually changed value. A field sent with a value
identical to the stored one writes no audit line and is not an error.

| Field | Value for a settings change |
|---|---|
| `action` | `SETTINGS_CHANGED` |
| `entityType` | `SETTINGS` |
| `entityId` | the `restaurantId` |
| `entityLabel` | the dotted path, for example `tax.defaultTaxRateBps` |
| `reason` | from the request body, required, never defaulted to `""` |
| `amountInPaise` | `null` |
| `details` | `{ field, previousValue, newValue }`, both values as strings |

The settings write and every audit line for it commit together, through
`withOptionalTransaction`. A settings change that persists without its audit
line is worse than one that fails outright, because the log is trusted.

`details` holds a field path and two scalar values and nothing else. No personal
data goes in it, for the reason section 13 already gives.

---

## What M7 deliberately does not add

**No settings collection.** Settings live on `restaurants`, which is already
read on every authenticated request. A separate collection adds a lookup to gain
nothing.

**No per-branch settings.** Version 1 is one branch per restaurant. A `branchId`
on a settings document would be dead weight and a decision made without a
customer.

**No settings history collection.** `auditlogs` is the history.

**No currency or locale setting.** Version 1 is INR and IST.

**No service charge or tip setting.** Both change the taxable base and need a
chartered accountant in the room.

**The M5 twelve-hour open-shift threshold stays a constant.** Decision D5 made
it one deliberately, and M7 does not reopen it. Neither the six roles, the three
inventory base units, nor the counter names become configurable; all three are
deliberately closed lists.
