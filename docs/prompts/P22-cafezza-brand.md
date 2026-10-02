# P22 Cafezza brand and professional finish

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P20B and P21.

---

## 1. What to build, in one sentence

Dress the product in Cafezza's real brand, its logo, its espresso brown and its warm linen and cream look, through settings any restaurant can use, then give every screen a professional finishing pass, without changing any state colour, any contrast minimum, or anything a screen does.

## 2. Module

M20 Floor Plan and Look. This prompt extends it.

## 3. Why this exists

P20B gave the owner an accent and a text wordmark, and listed "Uploading a logo image" as out of scope.
The client wants the product to look like Cafezza and to feel professional, not like a generic POS in Ocean blue.
Their registered trademark is a device mark, "CAFEZZA BE CAFFEINATED", so the logo itself is the brand.
This prompt is not yet in `docs/CAFFEZA-BUILD-PLAN.md` section 3. Step 0 and section 14 add it, which puts it in scope.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P22-cafezza-brand.md`.
2. `git pull`. `git status` should show only that file and the files in `docs/brand/`.
3. `docs/prompts/README.md` must show P20B and P21 as Done. If not, stop.
4. `docs/brand/` must contain:
   1. `cafezza-logo-square.png`: the logo, 447 by 447 pixels, cream artwork on a solid espresso brown square.
   2. `cafezza-menu-reference.png`: two pages of their printed menu. A style reference only.
   3. Optionally, files the owner sends later: a vector logo, or transparent PNGs with brown artwork for light grounds and cream artwork for dark grounds. Use them if present.
   If either of the first two is missing, stop and ask me.
5. Never download a logo from the internet. Never redraw, trace, recolour or restyle the logo artwork.
6. The menu reference is never copied into `client/`, never served, and never shipped. It only informs the look.
7. Run `npm test` and record the count. If anything fails, stop.

## 5. Files to read first

1. `docs/DESIGN-SYSTEM.md`, all of it, especially sections 4, 5, 6, 8, 11, 13, 13a, 13b and 14.
2. `docs/CAFFEZA-PROFILE.md` section 1.
3. `server/utils/colour.js` and its mirror `client/src/utils/colour.js`.
4. `client/src/index.css`, `client/src/context/ThemeProvider.jsx`, `client/src/components/AppShell.jsx`, `client/src/features/settings/AppearancePage.jsx`, `client/src/features/auth/LoginPage.jsx`, `client/src/features/printing/useDeviceSettings.js`, `client/index.html`.
5. The `settings.appearance` sections of `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md`, and how `PATCH /settings` writes its audit entry.
6. The Express setup: the JSON body limit, and how `GET /auth/me` builds `appearance`.
7. `setup/caffeza.json` and the setup and provisioning scripts in `server/scripts/`.
8. `server/tests/designGuard.test.js`.
9. `docs/CONVENTIONS.md`, for endpoint naming, the envelope and error codes.
10. Look at both images in `docs/brand/`.

---

## 6. Part A. Confirm the measured brand

These values were measured from the files in `docs/brand/`. Re-measure them from the pixels with a throwaway script run outside the repo. Do not add a project dependency for it.

| Name | Hex | Where it was measured |
|---|---|---|
| Logo brown | `#4A2E2A` | The logo square's background |
| Logo cream | `#F2D7BC` | The logo artwork |
| Menu linen | about `#D6CCBE` | The menu page behind the cards |
| Menu card cream | about `#FFF4E8` | The menu item cards |
| Menu text brown | about `#543C24` | Item names and prices on the menu |

The accent:

1. Logo brown is at hue 8 degrees and 28% saturation. The `alert` colour is at hue 9 degrees. So the logo brown fails the 30 degree hue rule in section 4c, and a primary button in it could be read as an error.
2. The same hue and lightness at 24% saturation is `#49302D`. It passes the low-saturation exception, and it is visually the logo brown.
3. Confirm `#49302D` passes every rule in section 4c with `server/utils/colour.js`, and compute its night value with `nightVariant`. It becomes Cafezza's custom accent.
4. Never loosen a rule to make a colour fit.

If any re-measured value is far from the table, or the accent fails a rule, stop and show me the numbers before continuing.

## 7. Part B. Warm neutrals, specified first

The cool green-grey set in section 4a stays the default for every restaurant.
This part adds a warm set, translated from the menu: cream cards on linen become white surfaces on a warm linen ground, with espresso ink.

1. Add `neutralTone` to `settings.appearance`: `COOL`, the default, or `WARM`. Write it into `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md` first, in its own commit.
2. Start from these values. They were pre-checked. Verify each one.

| Token | Warm day | Warm night |
|---|---|---|
| `ground` | `#EFE9E1` | `#1A1310` |
| `surface` | `#FFFFFF` | `#241B17` |
| `sunken` | `#E9E2D8` | `#140E0C` |
| `ink` | `#2E201B` | `#F3E8DC` |
| `muted` | `#625147` | `#B9A699` |
| `line` | `#D5CABD` | `#3A2E28` |

Shadow and scrim: the same recipe as the cool set, made from the warm `ink` in day and pure black in night.

3. Why the day `surface` stays pure white, not menu cream: a cream surface lowers the contrast of the amber `open` tint against it, so a free table drifts toward looking open. The warmth comes from the ground, ink, muted text and lines instead.
4. Rules every warm value must meet, measured, and recorded in a table the way section 4a records the cool set:
   1. `ink` on `surface`, `ink` on `ground`, `muted` on `surface`, `muted` on `sunken` and `muted` on `ground`: each at least 4.5 to 1.
   2. Each state's text and edge colour: at least 3 to 1 against the warm `surface`.
   3. Each state tint against the warm `surface`: no lower than against the cool `surface`.
   4. Every accent preset and Cafezza's accent: at least 3 to 1 against warm day `ground`, and the night value at least 4.5 to 1 against warm night `ground`.
5. A custom accent is validated against both cool and warm grounds, so switching the tone can never break a saved accent. If `nightVariant` reads a fixed night ground, make it check both, and keep every existing preset's night value unchanged.
6. Put the warm values as named constants in `server/utils/colour.js`, and in `client/src/index.css` under `[data-neutral='warm'][data-theme='day']` and `[data-neutral='warm'][data-theme='night']`.
7. `ThemeProvider` sets `data-neutral` on the root from `appearance.neutralTone`. The Appearance preview may set it on its own subtree, the way it already sets `data-theme`.
8. Printing keeps the cool day set. Paper stays plain.
9. State tints, state colours, their words and their icons do not change. Section 11c holds in full.

## 8. Part C. Brand tokens, with one narrow job

Two new tokens, fixed per restaurant from its logo, not chosen by the owner:

| Token | Cafezza | Used for |
|---|---|---|
| `brand` | `#4A2E2A`, the exact logo background | The sign-in brand panel, and the plate behind a logo that has its own background |
| `on-brand` | `#F2D7BC`, the logo cream | Text on the brand panel |

1. `on-brand` on `brand` must be at least 4.5 to 1. It measures about 8.9.
2. `brand` is used in exactly two places: the sign-in brand panel, and the logo plate. Nowhere else. Not buttons, not headers, not tiles, not backgrounds of service screens.
3. `brand` uses the exact logo background, not the adjusted accent, so the square logo blends into the panel with no visible edge.
4. Store `brandHex` and `onBrandHex` in `settings.appearance`, null by default. Without them, the sign-in screen looks as it does today.
5. A guard test fails if `bg-brand` or `text-on-brand` appears outside `BrandLogo` and `LoginPage`.

## 9. Part D. The logo

Write the spec into `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md` first, in its own commit.

**Two slots, both optional**

1. `forLightGround`: dark artwork on a transparent background, for day screens.
2. `forDarkGround`: light artwork, on transparent or on its own solid background, for night screens and the brand panel.
3. Cafezza currently has only the square, cream on brown. It goes in `forDarkGround`.
4. When a screen's ground has no matching logo, show the other one on a `brand` plate with an 8 pixel radius. So until the owner sends a transparent brown version, day screens show the cream logo on a brown plate.

**Preparing Cafezza's file**

5. The square has wide empty brown margins, and at top-bar size the artwork would be tiny.
6. Make `docs/brand/cafezza-lockup-dark.png` by trimming only the plain brown margin around the artwork, keeping padding equal to one eighth of the trimmed height on every side.
7. Trim margin only. Never cut into the cup, the steam, the wordmark or the tagline. Never scale the artwork unevenly.
8. Keep the original square for the favicon and as the app icon.

**Storage and checks**

9. Store logos on the restaurant, outside `settings`, so they never travel with `GET /settings` and never land in an audit entry. For each slot: content type, bytes, SHA-256 hash, width, height, size, when set and by whom. Every field has a default, so the change is additive.
10. Accept PNG, WebP or JPEG. At most 200 KB, at most 1024 pixels on the longest side, at least 128.
11. Check the real bytes: the file signature, and width and height from the header. Never trust the file name or a data URL prefix. If reading dimensions needs a dependency, tell me which and why before adding it.
12. Refuse SVG. An SVG can carry script, and refusing it is safer than cleaning it. A vector from the owner is converted to PNG locally before upload.

**Endpoints.** Follow `docs/CONVENTIONS.md`. If these names clash with it, use the conventions and tell me.

13. `PUT /settings/appearance/logo/:slot`, slot `LIGHT_GROUND` or `DARK_GROUND`: owner only, checked on the server, with a reason.
14. `DELETE /settings/appearance/logo/:slot`: owner only, with a reason.
15. `GET /restaurant/logo/:slot`: any signed-in role, the caller's own restaurant only. Returns the image with its content type, an ETag of its hash and a private cache header. 404 when the slot is empty, and 404 for any other restaurant, never 403.
16. Raise the JSON body limit on the upload route only. Never globally.
17. Audit actions `BRAND_LOGO_SET` and `BRAND_LOGO_REMOVED`, with slot, hash, size, dimensions, type and reason. Never the bytes.
18. `GET /auth/me` adds `neutralTone`, `brandHex`, `onBrandHex` and a hash per slot. Never image bytes.

**One component draws it.** `BrandLogo`, with the wordmark as its alt text.

19. Never recolour, filter, invert, crop or stretch a logo at runtime.

## 10. Part E. Where the brand shows

1. **Sign-in screen.** The one place the brand gets a large surface.
   1. Wide screens, 900 pixels and over: a split layout. On the left, about 40% of the width, a full-height `brand` panel with the logo centred, at most 240 pixels wide. On the right, the sign-in form on `ground`, left-aligned, at most 400 pixels wide, vertically centred.
   2. Phones and tablets: a `brand` band across the top, about 180 pixels tall, with the logo centred, and the form below it.
   3. One primary action, Sign in, in the accent.
   4. No tagline text added, because the logo already carries "Be Caffeinated".
2. **Back-office top bar.** The trimmed lockup at 40 pixels tall on the left, in place of the text wordmark.
3. **Service screens.** On phones, the lockup at 32 pixels tall in the top bar. On wide screens, the square logo at 44 pixels at the top of the rail, with a 10 pixel radius.
4. **Browser tab.** The page title becomes the wordmark. The favicon becomes the square logo. Replace "Restaurant ERP" in `client/index.html` with the product's own name as the fallback.
5. **Nowhere else.** Not on tiles, tickets, sheets, reports, exports or printed receipts. The thermal receipt stays text.
6. Without any logo, every place above shows the text wordmark exactly as today.

**Before anyone signs in**

7. After a successful sign-in, save in this device's settings, beside the printing settings: the logos as small data URLs, their hashes, the wordmark, the accent pair, the neutral tone, `brandHex` and `onBrandHex`.
8. The sign-in screen uses the last restaurant on this device. Signing out keeps them. None of it is secret.
9. When a hash from `/auth/me` differs from the saved one, fetch that logo again.
10. Update the sentence in `ThemeProvider` and the design system that says sign-in is always Ocean and Day.

## 11. Part F. The Appearance page

1. A Logo section first: both slots, each previewed on its own ground, each with Upload and Remove. Check type, size and dimensions in the browser first, with plain-word errors. The server decides.
2. A Brand colours row: `brandHex` and `onBrandHex`, with the contrast between them shown in words.
3. Neutral tone: Cool or Warm, as two swatches with ground, surface and text samples.
4. The live preview follows every choice and adds a small sign-in panel and a top bar with the logo, drawn with the real components.
5. Every change asks for a reason.
6. At phone width the preview sits under the choices.

## 12. Part G. Professional finishing pass

Change how things look, never what they do. Every fix must follow the design system. Where the design system has no answer, propose the rule, add it to section 13c, then apply it.

Go through every screen in the order of section 8 of the design system, at 380, 768 and 1280 pixels, in Day and Night, Cool and Warm, at 100% and 130% text size, and fix:

1. **Alignment.** Every screen title, section and list on the same left edge. Numbers right-aligned in columns with `tabular-nums`. Prices on a row aligned to the same right edge.
2. **Spacing.** Only 4, 8, 12, 16, 24, 32 and 48. Find and remove any other value.
3. **Hierarchy.** One `title` per screen, `heading` for sections, nothing in between invented. No two elements on a screen competing for the eye except the one primary action.
4. **Real Cafezza names.** Test with the longest real items, such as "Smoked Rajma Galouti with Crispy Basket" and "Cafezza Chip & Dip". Names wrap to two lines on tiles, tickets and order lines, then truncate with the full name available. Prices never wrap and never get pushed off the row.
5. **Empty, loading and error states.** Every list has an `EmptyState` that says what to do next. Loading shows the screen's layout with quiet placeholders in `sunken`, never a lone spinner in the middle of a page, and never motion that loops.
6. **Touch and keyboard.** Every tap target at least 48 pixels. Tab order follows the screen top to bottom, left to right. The focus ring visible on everything.
7. **Consistency.** The same action has the same word, icon and button kind on every screen. Sheets open from the same side with the same footer.
8. **Top bars and rails.** Same height, same padding and same placement of the signed-in person on every screen.

Keep a list of every screen and what was fixed. It goes in the summary.

## 13. Part H. Dress Cafezza

1. In `setup/caffeza.json`, under `settings.appearance`: `accentPreset` `CUSTOM`, `accentHex` `#49302D`, `neutralTone` `WARM`, `brandHex` `#4A2E2A`, `onBrandHex` `#F2D7BC`, `wordmark` `Cafezza`, and `secondLanguage` stays `GUJARATI`.
2. Add `logos`: `{ "DARK_GROUND": "docs/brand/cafezza-lockup-dark.png" }`. The setup script uploads through the same service as the endpoint, so every check runs. Run the dry run and confirm it validates.
3. Spelling: their trademark, menu and listings all say "Cafezza". Use it for everything staff or guests see. Leave the repo name, file names and existing doc text alone.
4. `docs/CAFFEZA-PROFILE.md` section 1: add that the registered trademark is "CAFEZZA BE CAFFEINATED", device mark. The GST bill spelling stays `TO CONFIRM` with the owner. Add a `TO CONFIRM` item: ask the owner for the vector logo and a transparent brown version for light grounds.
5. `AppShell` falls back to the hardcoded text "Caffeza". A client's name does not belong inside the product. Fall back to the restaurant's name, then the product's name.

---

## 14. Tests

**Server**

1. Every warm pair in Part B, rule 4, measured from the constants in `server/utils/colour.js`. Fails if one drops below its minimum.
2. The warm values in `client/src/index.css` match the constants exactly.
3. `#49302D` passes on both grounds. `#4A2E2A` as an accent is refused with the reason naming the alert colour.
4. Every preset passes on both grounds. A custom accent that passes on cool but fails on warm is refused.
5. `neutralTone` accepts only `COOL` and `WARM`.
6. `brandHex` and `onBrandHex` are refused when their contrast is under 4.5 to 1.
7. Each slot accepts valid PNG, WebP and JPEG within limits.
8. Each slot refuses, with the field named and a plain message: an SVG, a text file renamed `.png`, a file over 200 KB, an image over 1024 pixels, an image under 128 pixels.
9. Upload and remove are owner only. Manager and captain are refused under the existing permission rules.
10. Restaurant B asking for restaurant A's logo gets 404, never 403.
11. Audit entries carry slot, hash, size, dimensions, type and reason, and never bytes.
12. `/auth/me` carries hashes and tone and brand colours, never bytes.
13. The setup script runs the same checks on `logos`, and refuses a bad file.

**Guard tests**

14. No raw hex in `client/src/` outside `index.css` and the `utils/colour.js` mirror.
15. No component draws a logo except `BrandLogo`.
16. `bg-brand` and `text-on-brand` appear only in `BrandLogo` and `LoginPage`.
17. Nothing in `client/` references `cafezza-menu-reference`.

Run the full suite at the end. Every test that passed before must still pass.

---

## 15. Non-negotiable rules that apply

"Check permissions on the server for every endpoint."
"A record belonging to another restaurant returns 404, never 403."
"Every record has a `restaurantId`. Every query filters by it."
"Schema changes are additive."
"Every label on a screen comes from `docs/GLOSSARY.md`." Add any new label there first.
Section 11c: state colours, the one primary action rule, contrast minimums and the balance seal's position never change.
Change how things look, never what they do.

## 16. Docs to update

1. `docs/DESIGN-SYSTEM.md`:
   1. Section 4a: the warm set and its measured table.
   2. A new section 4d: the `brand` and `on-brand` tokens and their two uses.
   3. Section 11a: `neutralTone`, `brandHex`, `onBrandHex`, the two logo slots.
   4. Section 11b: sign-in remembers the last restaurant on this device.
   5. A new section 13c, "Settled while building P22", including every rule the finishing pass added.
   6. A new section 15, "Restaurant brand: Cafezza", with the measured table from Part A and why the accent is `#49302D`, not `#4A2E2A`.
2. `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md`, committed before the code.
3. `docs/CAFFEZA-PROFILE.md`, as in Part H.
4. `docs/CAFFEZA-BUILD-PLAN.md`: a P22 row in section 3, and the two audit actions in section 6.
5. `docs/GLOSSARY.md`: any new label.
6. `docs/GO-LIVE.md`, training, Owner row: "Check the logo, brand colours and warm look on the Appearance page."
7. `docs/PROJECT-STATE.md`: the date line, a P22 entry at the top of "What changed recently", and in the decision log, dated today: "A restaurant can add its logo, brand colours and warm neutrals. State colours and contrast minimums are unchanged. Cafezza's accent is its logo brown at 24% saturation, because the exact brown sits 1 degree from the alert colour. | The client asked for a look they can make their own."
8. `docs/prompts/README.md`: add P22 and mark it Done.

---

## 17. Out of scope

Any change to a state colour, its word or its icon.
New fonts. Anek and IBM Plex Mono stay. The menu's uppercase item names and serif titles are not copied, because the design system uses sentence case for reading at speed.
Cream card surfaces, rounded menu-style cards, textures, linen patterns, photos, gradients or decoration.
The logo on printed bills or exports.
Per-user themes. Logos for more than one outlet.
Any change to what a screen does.

---

## 18. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand, with `npm run seed:golden` loaded: every screen at 380, 768 and 1280 pixels, in Day and Night, Cool and Warm, at 130% text size, against section 14 of the design system.
4. By hand, as a captain on a phone with Warm on: a free table and an open table are told apart at a glance.
5. By hand: the sign-in screen at 380 and 1280 pixels shows the brand panel with the logo blending into it, with no visible edge around the logo.
6. By hand, as the owner: upload, see the logo in the top bar, rail, sign-in and browser tab, remove it and see the text wordmark return, and try an SVG and see it refused.
7. By hand: sign out and see the sign-in screen keep Cafezza's look on this device.
8. The golden day acceptance test and every report test pass untouched.
9. Every doc in section 16 is updated.
10. Commits on `main`, one line each, for example:
    `spec neutral tone, brand tokens and logo slots`
    `add warm neutral set`
    `add brand tokens`
    `add logo storage and endpoints`
    `brand sign in, top bar and rail`
    `add brand controls to appearance page`
    `finishing pass across screens`
    `dress cafezza in its brand`
    `update docs for p22`
11. Push `main`.
12. Print a short summary: commits, files added and changed, test counts before and after, every measured colour and contrast, and the finishing-pass list of every screen with what was fixed.
