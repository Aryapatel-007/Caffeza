# P20A New look, part 1: foundation and service screens

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P19.

---

## 1. What to build, in one sentence

Put version 2 of the design system in place: its fonts, its day and night themes, its accent setting on the server, its components, and every service screen moved onto it, meaning floor, order, kitchen, bill and payment, cash drawer and Day Close.

## 2. Module

M20 Floor Plan and Look, the look part. P20B finishes it.

## 3. The design is already written

`docs/DESIGN-SYSTEM.md` is the spec. Read all of it before writing anything.
**Build exactly what it says.** Where it and this prompt disagree, the design system wins, and you tell me.
Where it is silent, follow the version 1 rule it says it keeps, in its section 2.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P20A-look-foundation-service.md`.
2. In `docs/prompts/README.md`, replace the P20 row with two rows: "P20A New look, part 1: foundation and service screens" and "P20B New look, part 2: back office and customisation".
3. `git pull`. `git status` should show only those two files, plus `docs/DESIGN-SYSTEM.md` if it was just copied in. If it was, commit it on its own first, as `add design system v2`.
4. `docs/prompts/README.md` must show P19 as Done. If not, stop.
5. `docs/DESIGN-SYSTEM.md` must exist. It is copied into the repo by hand before this prompt. If it is missing, stop and tell me.
6. Run `npm test` and record the count. It should match P19's "after" count. If anything fails, stop and tell me.

## 5. Files to read first

1. `docs/DESIGN-SYSTEM.md`, all of it.
2. `docs/DESIGN-SYSTEM.md`, version 1, to see what is being replaced.
3. `client/src/index.css`, `client/src/main.jsx`, `client/src/App.jsx`.
4. Everything in `client/src/components/`.
5. The device settings hook and "This device" panel from P05.
6. The service screens: `client/src/features/orders/`, `kitchen/`, `billing/`, and the cash drawer and Day Close screens from P10, and the floor and layout editor from P19.
7. The two version 1 `Bilingual` components and labels files: `features/attendance/` and `features/billing/`.
8. On the server: `server/models/Restaurant.js` settings, `server/services/settingsService.js`, `server/validators/settingsValidators.js`, `me` in `server/controllers/authController.js`, and `server/models/Station.js` from P05.

---

## 6. Part A. The server side

Small, and first, so the client has what it needs.

### 6a. Appearance settings

Add `settings.appearance`, exactly as `docs/DESIGN-SYSTEM.md` section 11a defines it.
Owner only to change, audited like every setting, through the existing settings code.

`accentHex` is validated by the rules in section 4c of the design system:
1. A valid six-digit hex colour.
2. White text on it at least 4.5 to 1.
3. At least 3 to 1 against day `ground`, `#F2F4F3`.
4. Its hue at least 30 degrees from the hue of each state colour, `#7A4F00`, `#16614F`, `#922457`, `#A8321C` and `#256640`, unless its saturation is under 25%.

Put the colour arithmetic in a new `server/utils/colour.js`: relative luminance, contrast ratio, hue and saturation, and `nightVariant(hex)`, which raises lightness in steps until the colour reaches 4.5 to 1 against night `ground`, `#0F1715`.
Mirror it, with no imports, in `client/src/utils/colour.js`, so the settings screen can preview and explain before saving. Add a test that the two files give the same results for 50 seeded random colours.

A refused colour returns 400 with a message naming the rule it broke and the nearest preset by hue.

`GET /auth/me` gains `appearance`, beside `features`, for every role, with `accentNight` already worked out so the client does no colour maths on load.

### 6b. Station target time

`stations` gains `targetMinutes`, integer 5 to 120, default 15. The kitchen ticket's time edge measures against it. Editable where stations are edited, by the same roles.

### 6c. Spec first

Commit before the code, as `add appearance settings spec`: the `appearance` group in `docs/API-CONTRACT.md` M7 and `docs/DB-SCHEMA.md` section 17, `appearance` on `GET /auth/me`, and `targetMinutes` in the M18 section and DB-SCHEMA section 19.

## 7. Part B. Fonts

1. Add Anek Latin, Anek Gujarati and Anek Devanagari as variable fonts from `@fontsource-variable`. Check the exact package names on npm before installing. If a family is not published there, use the plain `@fontsource` package with the weights the scale in section 5b needs, and say so.
2. Keep IBM Plex Mono from P12.
3. Keep IBM Plex Sans installed until P20B removes it, because back-office screens still use it until then.
4. Check that the width axis works: a test page in development showing "T 14" at widths 82, 100 and 112. If the installed Anek has a different width range, map the design's three widths onto it as closely as possible and record the mapping in the design system.

## 8. Part C. Tokens and themes

In `client/src/index.css`:

1. Define every neutral and state token from section 4 of the design system as CSS variables, under `:root[data-theme="day"]` and `:root[data-theme="night"]`.
2. Expose them to Tailwind v4 through the `@theme` block, so classes like `bg-surface`, `text-muted`, `border-bill`, `bg-open-tint` and `bg-accent` follow the active theme. Check Tailwind v4's documentation for referencing CSS variables from `@theme`, and use the method it recommends.
3. Define the type scale from section 5b as utility classes or `@utility` rules, including each style's width setting, so a component writes `type-tile-name`, not five separate values.
4. Keep the version 1 tokens defined for now, so back-office screens keep working until P20B. Mark them in a comment as "version 1, removed in P20B".

A `ThemeProvider` near the root of the app:
1. Sets `data-theme` on the root element from the device setting: Automatic, Day or Night. Automatic means Night on the kitchen screen route and Day everywhere else.
2. Sets `--accent` and `--accent-night` from `appearance` in the signed-in user's `/auth/me`.
3. Applies the device's density and text size, as section 11b says: text size scales the root font size, density changes spacing only.
4. Before sign-in, uses Ocean and Day.

Extend the P05 device settings hook and "This device" panel with theme, density, text size and second language. Keep its single storage key.

## 9. Part D. Components

Build or rebuild every component in section 9 of the design system, in `client/src/components/ui/`, reading only tokens.

1. `StateChip` replaces `StatusBadge` and `AvailabilityStamp`. Move every use across. Keep `StatusBadge` and `AvailabilityStamp` files only if a back-office screen still imports them, and mark them for removal in P20B.
2. `TimeEdge` updates once a minute from a single shared timer for the whole page, not one timer per tile. It never animates on its own.
3. `TableTile` and `TicketCard` use `TimeEdge` and `StateChip` exactly as sections 7a and 8b draw them.
4. `Money` becomes the only component that formats paise for display. Replace every other formatting call in the service screens with it.
5. One `Bilingual` component and one labels file per language, in `client/src/features/i18n/`, replacing the two version 1 copies. Move every existing label across, and use the restaurant's `secondLanguage` with the device's override.
6. The icon set from section 9, as inline SVG components.
7. `Button`, `Sheet`, `NumericKeypad`, `ReasonPicker`, `EmptyState`, `ErrorState` restyled to the new tokens.

## 10. Part E. The service screens

Move each of these onto the new components and tokens, one at a time, checking each against section 14 of the design system before moving on:

1. `AppShell`: the rail on wide screens, the bottom bar on phones, with each role's places.
2. Floor: plan and tile views, billing strip, guest picker, from P19.
3. Order screen, menu picker, takeaway and delivery flows.
4. Kitchen screen, night by default, tickets with time edges, oldest first and late to the front.
5. Bill and payment: the bill total in `num-hero`, the payment method buttons from P08, split payments, corrections, discount, No Charge, charge to account, void, print.
6. Cash drawer and Day Close, with the blind count.
7. The table layout editor from P19.

Rules while moving screens:
1. Change how things look, never what they do. Every API call, permission check and rule stays exactly as it is.
2. One primary action per screen. Where a screen has two `chana` buttons today, pick the one that is actually next, and make the other secondary.
3. Every state through `StateChip`, with its word and icon.
4. No raw hex anywhere. No version 1 token in any screen in this list.

## 11. Tests

**Server**
1. Each of the six presets is accepted. `CUSTOM` with `#2D5DA8` is accepted.
2. Refused, each with its rule named: `#FFD54F`, white text too faint; `#8A5A00`, too close to `open`; `#9B2F68`, too close to `bill`; `#1F6B57`, too close to `served`; `#123`, not six digits.
3. `#6B5A63` is accepted even though its hue is within 4 degrees of `bill`, because its saturation is under 25%.
4. `nightVariant` of every preset reaches at least 4.5 to 1 on night `ground`. It steps HSL lightness up by 0.01 from the colour's own lightness and rounds each channel to the nearest whole number. Its results should match the night column in the design system's preset table to within 1 in each channel. If any differs, update the table to what the code produces, and say so.
5. `GET /auth/me` returns `appearance` with `accentNight` for a WAITER.
6. `targetMinutes` defaults to 15, and values outside 5 to 120 are refused.
7. The client and server colour files agree on 50 seeded random colours.

**Guard tests**, reading files from disk, in `server/tests/designGuard.test.js`:
8. No file under `client/src/components/` or the service screen folders contains a raw hex colour.
9. No file in those folders uses a version 1 token class: `paper`, `steel`, `chana`, `mirch` or `patta`.
10. No component in those folders formats money except through `Money`. Check for `toLocaleString` on numbers and for `/ 100` next to a `₹`.

P20B widens tests 8 and 9 to the whole client.

**By hand**, in section 15.

Run the full suite at the end. Every test that passed before must still pass.

---

## 12. Non-negotiable rules that apply

"Check permissions on the server for every endpoint. Hiding a button in React is not security." A restyle changes no permission.
"Every label on a screen or an export comes from `docs/GLOSSARY.md`."
"Store timestamps in UTC. Convert to India time only for display." Time edges use `formatDate.js` helpers and the shared timer.
"Schema changes are additive."

## 13. Checks and golden day

No money changes. The golden day acceptance test and every report test must still pass untouched.

---

## 14. Docs to update

1. `docs/DESIGN-SYSTEM.md`: anything the build settled that it left open, such as the font width mapping and the Tailwind variable method.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P20B, back office and customisation."
   3. Decision log, dated today:
      "Version 2 of the design system replaces version 1: day and night themes, six fixed state colours each with a word and an icon, an owner-chosen accent from six tested presets or a validated custom colour, Anek with Gujarati and Devanagari siblings, and two signature elements, the time edge on service screens and the balance seal on reports. | The client asked for a look they can make their own. Service runs on time, and reports run on proof."
      "The rotated availability stamp is retired in favour of `StateChip`. | A signature element should carry information."
      "Colour contrast rules are checked on the server in `utils/colour.js`, mirrored on the client. | An owner's brand colour must never make a button unreadable or look like a state."
   4. "What changed recently": a P20A entry at the top, and the oldest moved to the archive.
3. `docs/prompts/README.md`: mark P20A as Done.

---

## 15. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand, with `npm run seed:golden` loaded: every screen in Part E, at 380, 768 and 1280 pixels wide, in Day and in Night, and at 130% text size, checked against section 14 of the design system. List any screen that fails a point, and fix it before committing.
4. By hand: the kitchen screen opens in Night. A ticket older than its station's target shows a full red edge and "Late".
5. By hand: switch the accent to Espresso as the owner, and see every primary button and focus ring change on the next page load, and nothing else.
6. Every doc in section 14 is updated.
7. Commits on `main`, one line each, for example:
   `add appearance settings spec`
   `add appearance settings and station targets`
   `add v2 fonts tokens and themes`
   `add v2 components`
   `move service screens to v2`
   `update docs for p20a`
8. Push `main`.
9. Print a short summary: commits, files added and changed, test counts before and after, every screen checked by hand and anything that failed and was fixed.
