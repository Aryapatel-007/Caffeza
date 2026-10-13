# P43 Other, with the mode of payment

**Asked for by:** Rishi, 2026-10-13: "in the payment method add the option of other with option of other mode of payment".
**Modules:** M10 (payments), M3 (the bill screen).
**Depends on:** P07 (configured payment methods; the built-in `OTHER` starts switched off), P08.

## The rule

The payment panel offers **Other** wherever the restaurant has the built-in `OTHER` method switched on. Picking it asks **Mode of payment**, required: one tap on Cheque, Bank transfer, Wallet or Coupon, or anything typed (up to 100 characters). The mode is the payment's `reference`, so it shows on the bill screen as "Other · Cheque", and reports keep the payment under Other.

The server refuses an `OTHER` payment with no `reference`: 422 `BUSINESS_RULE_VIOLATED`, "Say how it was paid, for example Cheque." Other methods keep their optional reference.

## Z Chaat

`OTHER` is switched on for Z Chaat in its records, as an owner would in Settings, Payment methods.

## Tests

An Other payment without a mode is refused and the bill unchanged; with one it is recorded with the mode as its reference; Cash still needs none. Breaking the rule on purpose fails the test. Browser: the cashier picks Other, the Record button waits for a mode, Cheque fills it, and the bill shows "Other · Cheque".
