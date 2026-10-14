# P47 Other modes: Swiggy, Zomato and EazyDiner one tap away, kept in Settings

**Asked for by:** Rishi, 2026-10-14: "also add the other mode of payment where there should be swiggy, zomato, eazy dineout and also in the setting there is easiest way to add the other mode of payment".
**Modules:** M10 (payments), M7 (settings).
**Depends on:** P43 (Other with its mode), P44 (the day-end message splits Other by mode).

## The rule

`settings.payments.otherModes`: the modes the payment panel offers one tap each when Other is picked. Up to 12, each 1 to 40 characters, no two the same (ignoring case). Default, for every restaurant: Swiggy Dineout, Zomato Dineout, EazyDiner, Cheque, Bank transfer, Coupon. A mode can still be typed for anything not listed.

The owner keeps the list on **Settings, Payment methods**, under **Other modes**: each mode with a remove ×, and a box with **Add**. It saves with the rest of Settings, with its reason. When Other itself is switched off, the list says so and says where to switch it on.

`GET /auth/me` returns `payments: { otherModes }`, because a cashier cannot read `GET /settings`.

Each mode is its own line in the day-end message: "Other (Zomato Dineout) - 906". The frozen reference is the mode's text when it was paid, so renaming a mode later never changes an old payment.

## Z Chaat

Other is switched on for Z Chaat, as its owner would in Settings, after the deploy.

## Tests

The defaults on a new restaurant and on `/auth/me`; the owner changes the list and a cashier's `/auth/me` follows; too many, too long, empty and repeated modes refused; a manager refused. Browser: the owner adds a mode in Settings; the cashier's Other shows it beside Swiggy Dineout, Zomato Dineout and EazyDiner, and a payment by it is recorded with it as the mode.
