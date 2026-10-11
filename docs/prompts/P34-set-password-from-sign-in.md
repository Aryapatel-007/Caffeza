# P34 Set a new password from the sign-in screen

**Model:** Opus, high effort. A public endpoint that changes a credential.
**Branch:** none. Commit directly to `main`.
**Depends on:** P28 (the manager's PIN).
**Asked for by:** Rishi, 2026-10-11: "add the set password to login over there",
and "owner or manager will approve this".

---

## 1. What to build, in one sentence

A "Forgot password?" link on the sign-in screen, where a person who cannot
sign in sets a new password once an owner or manager standing beside them
approves it with their own phone number and PIN.

## 2. Module

M0 Foundation, section 1 of `docs/API-CONTRACT.md`. No collection and no
field are added. Spec first: API-CONTRACT 1.7, DB-SCHEMA section 45, GLOSSARY
section 22, committed before any code.

## 3. Why the approver types their phone, not picks a name

Everywhere else (P28) the approver picks their name from a list. That list is
read with a session. On the sign-in screen nobody is signed in, so a list would
hand every staff name of a restaurant to anyone who types one of its phone
numbers. The approver types their own phone number and their PIN instead.

## 4. Rules

1. Public, `POST /api/v1/auth/password-reset`, behind the login limiter.
2. The person is found by phone or email, as at login. The approver is found by
   phone **inside the person's restaurant only**, and must be an active OWNER
   or MANAGER with a PIN set.
3. The approver cannot be the person. A PIN is weaker than a password, and is
   typed on shared screens; letting it reset its own owner's password would let
   anyone who saw it typed take over that manager's login.
4. A MANAGER cannot approve a new password for an OWNER, as on the Staff screen
   (`assertCanResetPassword`).
5. The PIN is checked by `authService.verifyPin`, so five wrong PINs lock it
   until an owner sets it again, exactly as for cancels and voids.
6. Every failure is the same 401 `INVALID_CREDENTIALS` with one message, and
   costs one bcrypt comparison, so the screen never says which phone exists,
   who works where, or which part was wrong.
7. On success: the password is replaced through `authService.setPassword`
   (which stamps `passwordChangedAt`), every session of that person is revoked,
   and `USER_PASSWORD_RESET` is audited with the approver as the actor and
   `details.source: "SIGN_IN_SCREEN"`. No token is issued; the screen signs in
   with the new password through the ordinary login.
8. The integration user (`isSystem`) and an inactive person are refused like an
   unknown phone.

## 5. Screen

On the sign-in screen, under the form: **Forgot password?**. It opens a form in
place of the sign-in form: your phone or email, the new password twice, then
"A manager approves" with the manager's phone and PIN. **Set password** sends
it; on success the screen signs in and goes on as a sign-in would. **Back to
sign in** returns. Works at 380 px wide.

## 6. Tests

1. A cashier's password set with a manager's PIN: the old password fails, the
   new one signs in, the old refresh token is revoked, one audit line names the
   manager as actor.
2. Each failure answers the identical 401 body: unknown phone, wrong PIN, an
   approver from another restaurant, an approver who is a cashier, the person
   approving themselves, a manager approving an owner, an inactive person, the
   integration user.
3. A manager's PIN locks after five wrong tries through this endpoint.
4. An owner approves a manager.
5. The tenant-guard tripwire counts one more `skipTenantGuard` in
   `authService.js` on purpose, with the reason beside it.

## 7. Not in scope

A code by SMS or email. An owner who is the restaurant's only owner still
cannot reset their own password this way; another owner, or Rishi with the
provisioning tools, does it.
