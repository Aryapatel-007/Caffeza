# P20B New look, part 2: back office and customisation

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P20A.

---

## 1. What to build, in one sentence

Move every remaining screen onto version 2 of the design system, give the owner an Appearance settings page with a live preview and a Today tiles editor, then remove version 1's tokens, fonts and components and make version 2 the only design system.

## 2. Module

M20 Floor Plan and Look. This prompt completes it.

## 3. The design is already written

`docs/DESIGN-SYSTEM.md`, as settled by P20A.
**Build exactly what it says.** Where it and this prompt disagree, the design system wins, and you tell me.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P20B-look-back-office-customisation.md`.
2. `git pull`. `git status` should show only that file.
3. `docs/prompts/README.md` must show P20A as Done. If not, stop.
4. Run `npm test` and record the count. It should match P20A's "after" count. If anything fails, stop and tell me.

## 5. Files to read first

1. `docs/DESIGN-SYSTEM.md`, all of it, including what P20A added.
2. P20A's entry in `docs/PROJECT-STATE.md`, for what it settled and what it left marked for removal.
3. Every client folder P20A did not move: `features/reports/`, `features/settings/`, `features/menu/`, `features/users/`, `features/dashboard/`, `features/auth/`, `features/inventory/`, `features/attendance/`, and the screens for stations, payment methods, accounts and payouts.
4. The R1 Today definition and its tile keys from P18.
5. `client/src/index.css`, after P20A.

---

## 6. Part A. Report screens

Move the report page from P18 onto version 2:

1. The check strip becomes `BalanceSeal`, exactly as section 7b of the design system draws it, and it is the first thing on every report, above the filter sentence.
2. Report tables use `DataTable` with the `dense` style, the sticky first column, and the totals row rule.
3. Every money value through `Money`. Every state through `StateChip`.
4. Charts keep version 1's rules: one series, drawn in `ink`, with the table twin underneath. The charts' numbers in Plex Mono.
5. The A4 print stylesheet always prints in the day theme, whatever the device is set to.
6. The reports index from P18, laid out as the design system's back-office layout.

## 7. Part B. Every other screen

Move each onto version 2, one at a time, checking each against section 14 of the design system:

1. Sign in, and the dashboard or home screen for each role.
2. Settings, and every settings section added since M7: features, invoice numbers, stations, payment methods, discounts, Day Close, floor.
3. Menu, categories and items.
4. Staff and users.
5. Accounts and payouts.
6. Table management.
7. Inventory and attendance screens. Move them too, even though Caffeza has both switched off. They must not be the only screens left on version 1.

Same rules as P20A: change how things look, never what they do. One primary action per screen. Every state through `StateChip`. No raw hex. No version 1 token.

## 8. Part C. The Appearance page

A new section in Settings, "Appearance", owner only, using the `appearance` settings from P20A.

1. **Accent.** The six presets as large swatches, each showing a sample primary button in day and in night. A seventh choice, "Your own colour", with a hex field.
2. As the owner types a hex, check it with `client/src/utils/colour.js` and show, in plain words, whether it passes. When it fails, say which rule and why it matters, for example "This is too close to the colour for a printed bill, so staff could mistake a button for a table state", and offer the nearest preset as one tap. The server still decides when saving.
3. **Live preview.** Beside the choices, a small fixed preview drawn with the real components: one table tile in each state, a primary button, a ticket with a late time edge, and a balance seal. It updates as the owner changes the accent, and has a day and night switch. It uses the real components, not pictures of them.
4. **Wordmark.** The name shown in the top bar, defaulting to the restaurant's name. Up to 24 characters.
5. **Second language.** None, Gujarati or Hindi, with a preview of the Pay button with its second line.
6. **Today tiles.** Every R1 tile, each with a switch and up and down buttons to reorder. Saved to `todayTiles`. The Today screen from P18 reads this order and shows only the switched-on tiles.
7. Saving asks for the reason, as every settings change does, and the page shows the saved state.

Show the screen at phone width too: the preview moves under the choices.

## 9. Part D. Remove version 1

Only after Parts A to C are done and every screen is on version 2:

1. Remove the version 1 tokens from `client/src/index.css`.
2. Remove IBM Plex Sans from the client.
3. Delete `StatusBadge`, `AvailabilityStamp`, and anything else P20A marked for removal, once nothing imports them.
4. Widen the guard tests from P20A to the whole of `client/src/`: no raw hex colour outside `index.css`, no version 1 token class, and no money formatting outside `Money`.
5. Move `docs/DESIGN-SYSTEM.md` to `docs/archive/DESIGN-SYSTEM-V1.md`, then move `docs/DESIGN-SYSTEM.md` to `docs/DESIGN-SYSTEM.md`, both with `git mv`. Change the new file's title to "Design System" and its first lines to say it is version 2 and version 1 is archived.
6. Search every doc and prompt file for `DESIGN-SYSTEM.md` and point it at `DESIGN-SYSTEM.md`. Leave dated history entries as they are.
7. Add `DESIGN-SYSTEM-V1.md` to `docs/archive/README.md`.

## 10. Part E. Caffeza's setup file

In `setup/caffeza.json`, under `settings`, add:

```json
"appearance": { "accentPreset": "TO CONFIRM", "secondLanguage": "GUJARATI" }
```

Gujarati, because version 1 already put Gujarati on the billing screen for Ahmedabad and Gandhinagar staff.
The accent is Caffeza's choice, shown to them during training from the Appearance page. Until then the default, Ocean, applies.
Run the setup script's dry run to confirm the file still validates.

---

## 11. Tests

**Server**
1. `todayTiles` accepts only known R1 tile keys, with no repeats, and refuses anything else with the allowed keys listed.
2. R1 returns its tiles in `todayTiles` order and leaves out switched-off tiles. The figures of the tiles it shows are unchanged.

**Guard tests**, widened
3. No raw hex colour anywhere in `client/src/` except `index.css`.
4. No version 1 token class anywhere in `client/src/`.
5. No money formatting outside `Money`.
6. No import of a deleted component anywhere.

Run the full suite at the end. Every test that passed before must still pass.

---

## 12. Non-negotiable rules that apply

"Check permissions on the server for every endpoint." The Appearance page is owner only on the server, through the existing settings rule.
"Every label on a screen or an export comes from `docs/GLOSSARY.md`."
"Schema changes are additive."
From the design system, section 11c: state colours, the one primary action rule, contrast minimums and the balance seal's position can never be changed by any setting.

## 13. Checks and golden day

No money changes. The golden day acceptance test and every report test must still pass untouched.

---

## 14. Docs to update

1. `CLAUDE.md`: the table row for `docs/DESIGN-SYSTEM.md` stays, and now points at version 2 by the file move.
2. `docs/CAFFEZA-BUILD-PLAN.md` section 3: P20 is now P20A and P20B.
3. `docs/GO-LIVE.md` section 2, training, Owner row: add "Choose the accent colour and Today tiles on the Appearance page."
4. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P21, the golden day end to end."
   3. Module status: M20 becomes DONE, "Floor plan in P19, the look in P20A and P20B."
   4. Decision log, dated today: "Version 2 is the only design system. Version 1 is archived, and guard tests stop its tokens, raw colours and private money formatting from coming back. | One look, enforced, not remembered."
   5. "What changed recently": a P20B entry at the top, and the oldest moved to the archive.
5. `docs/prompts/README.md`: mark P20B as Done.

---

## 15. Out of scope

Uploading a logo image.
Per-user themes. Themes are per device and per restaurant.
Translating the whole app. The second language stays on fixed service words only.
Any change to what a screen does.

---

## 16. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand, with `npm run seed:golden` loaded: every screen in Parts A and B at 380, 768 and 1280 pixels, in Day and Night, and at 130% text size, against section 14 of the design system. List any that failed and how each was fixed.
4. By hand: as the owner, try `#9B2F68` on the Appearance page, see it refused with the reason and the suggested preset, pick Plum, save, and see the preview, the buttons and the focus ring change.
5. By hand: switch off two Today tiles and move one up, and see the Today screen follow.
6. By hand: R2 for the golden day shows "Balanced, with 1 note" at the top, for the cash difference.
7. Every doc in section 14 is updated.
8. Commits on `main`, one line each, for example:
   `move report screens to v2`
   `move back office screens to v2`
   `add appearance page with live preview`
   `remove design system v1`
   `update docs for p20b`
9. Push `main`.
10. Print a short summary: commits, files added, changed, moved and deleted, test counts before and after, and every screen checked by hand.
