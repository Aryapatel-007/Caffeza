# M0 SUMMARY

What M0 actually built, why, and what to know before touching it. `docs/PROJECT-STATE.md` is the terse changelog and decision log; this is the readable version for anyone picking up the project after the fact.

M0 is DONE as of 2026-08-29. Three parts, three branches, three owners of context: Rishi built all three.

---

## What M0 is

The foundation every other module sits on. Auth, tenancy, roles, and the four collections everything else depends on: `restaurants`, `branches`, `users`, `refreshtokens`. No menu, no orders, no bills — those are M1 onward.

Three parts, built in order because each depended on the last:

| Part | Branch | What it built |
|---|---|---|
| M0-A | `feat/m0/foundation-scaffold` | The plumbing: server boot, config, middleware chain, the tenant guard, error handling, response envelope, money/time helpers, the React client shell. Zero business logic, zero models. |
| M0-B | `feat/m0/auth-provisioning` | The four models, login/refresh/logout with rotation and reuse detection, the restaurant and branch read endpoints, the provisioning script. |
| M0-C | `feat/m0/user-management` | The six staff management endpoints and screens: create, list, read, update, activate/deactivate, reset password. |

---

## The single most important thing M0-A built

**The tenant guard.** Every model applies `tenantGuardPlugin`, which hooks every Mongoose query and throws if the filter has no `restaurantId`. This is what makes "restaurant A sees restaurant B's data" a crash instead of a silent leak.

There is exactly one documented escape hatch — `.setOptions({ skipTenantGuard: true })` — and it is used in exactly **four** places in the whole server, each with a comment explaining why the operation is genuinely tenant-less:

1. `authService.verifyCredentials` — looking a user up by phone **or email** at login, before any token exists.
2. `tokenService` — looking a refresh token up by its hash. At refresh time the token is the only thing the server has.
3. `authService.isPhoneRegistered` — checking a phone number isn't already registered anywhere on the platform (phone is globally unique), used by both user creation and provisioning.
4. `authService.isEmailRegistered` — the same check for email, which became a second login identity in M0-D and is globally unique on the same terms and for the same reason.

It was three until M0-D added email as a second login identity. Number four is legitimate — a globally unique login identifier cannot be checked inside one restaurant, because login has no restaurant context — but it went in without the tripwire noticing, because that test asserted on *file names* and `authService.js` was already on the list. The test now counts call sites per file (`tests/menu.test.js`), so a fifth use anywhere, including inside a file already listed here, fails the suite.

The whole tenant-isolation audit is still one command: `grep -rn "skipTenantGuard" server/`. Anything beyond these four, plus the guard's own file and the tests, needs justifying in the decision log before it is written.

## The tenancy-root exception

`restaurants` and `branches` don't play by the normal rule, because they *are* the tenant, not tenant-scoped data:

- `Restaurant` applies **neither** plugin. Its `_id` is what everything else calls `restaurantId`. Every query against it must be by `_id` from a verified token, or from the provisioning script — no third pattern is legitimate.
- `Branch` gets a dedicated `baseSchemaTenantRootPlugin`: it has `restaurantId` but no `branchId` field, because its own `_id` serves that role. `GET /branches` filters `{ restaurantId }` directly rather than using the shared `scoped(req)` helper, which would try to spread a `branchId` that doesn't exist on this schema and throw under `strictQuery`.

## Auth mechanics worth knowing

- **Access tokens** are 15-minute JWTs carrying only `sub`, `role`, `restaurantId`, `branchId` — nothing personal, since a JWT is base64, not encryption.
- **Refresh tokens** are 64 random bytes, stored only as a SHA-256 hash. The raw value exists in one response body, once, and is never recoverable from the database.
- **Rotation + reuse detection:** every refresh issues a new token and revokes the old one, so a token is valid exactly once. If an already-revoked token is presented again, that's a replay — every session for that user is revoked immediately, logged at warn level, and the caller gets a 401.
- **`passwordChangedAt`** closes the window a refresh-token revocation can't: a stolen access token would otherwise keep working for up to 15 minutes after the password change made in response to that exact theft. The comparison is `<=` on whole seconds (JWT `iat` resolution), fail-closed — found via a flaky test during M0-B.
- **Login timing:** all four failure reasons (unknown phone, wrong password, inactive user, inactive restaurant) return a byte-identical 401 `INVALID_CREDENTIALS`, and the not-found path still runs a bcrypt comparison against a dummy hash so response timing can't be used to enumerate registered phone numbers.

## Staff permission rules (M0-C)

All six `/users` endpoints are `OWNER`/`MANAGER` only. On top of that, four more restrictions live in one file, `services/userPermissionService.js`, specifically so the rules are readable in one place rather than scattered across controllers:

- A `MANAGER` cannot create an `OWNER`, edit an `OWNER`, promote anyone to `OWNER`, or reset an `OWNER`'s password. (403 — about who's asking.)
- Nobody can change their own role, including an `OWNER`. (422 — a business rule, binds everyone.)
- Nobody can deactivate the last active `OWNER` of a restaurant, counted per-restaurant at the moment of the request. (422 `LAST_OWNER`.)

## Bugs this uncovered (both fixed, both have regression tests)

1. **The `passwordChangedAt` same-second gap (M0-B).** The comparison used `<` on whole seconds, so a token issued in the same second as a password change survived — exactly the window the mechanism exists to close. Found by a test that passed or failed depending on which side of a second boundary it landed on.
2. **New users couldn't use their first token (M0-C).** `POST /users` stamped `passwordChangedAt` with the current time, as originally specified. Combined with fix #1's fail-closed comparison, that rejected a brand-new user's first access token whenever creation and login landed in the same second — which automated onboarding does routinely. Fixed by setting it to `null` on creation (there are no tokens to invalidate for someone who's never logged in). Caught by a live end-to-end run, not by the unit tests — the original test only checked that login returned 200, and login doesn't run `authenticate`, so it never touched the broken path.

## Numbers

- **155 tests**, all passing, run against `mongodb-memory-server` (an in-process one-node replica set — Atlas has been unreachable from this machine all through M0; see known problems).
- **16 endpoints** total: 1 health, 9 auth/restaurant/branch, 6 staff management.
- **4 collections**, all matching `docs/DB-SCHEMA.md` field-for-field.
- ESLint clean, client builds, across all three parts.

## Known problems carried out of M0

Still open, logged in `docs/PROJECT-STATE.md`:

1. **Atlas Network Access allowlist isn't configured.** No code has ever run against the real cluster — everything above is verified against the in-memory replica set. Add this machine's IP under Atlas → Network Access to unblock it.
2. **Refresh token lives in `localStorage`.** One XSS hole hands over a 30-day credential. Needs to move to an httpOnly cookie before any pilot. One call site (`client/src/utils/sessionStorage.js`), marked with a TODO.
3. **The database credential was shared in plaintext in chat and hasn't been rotated.** It never made it into any commit, but rotate it anyway.

## What's next

M1 Menu Management is unblocked. Nothing in M0 remains — parts A, B, and C are all merged-ready on their branches, none merged to `main` yet.
