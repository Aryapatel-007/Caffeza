# P32 The client's weight

**Model:** Opus, high effort. The route split is mechanical, but deciding what stays eager is a judgement about who waits, and the font subset is a build step that has to be got exactly right or text renders as boxes.
**Branch:** none. Commit directly to `main`.
**Depends on:** P30 for the baseline. Independent of P31; they can run in either order.

---

## 1. What to build, in one sentence

Stop a captain's phone downloading the Tally screens, the report engine and the integration settings in order to draw a floor plan, and stop a till downloading 450 kB of Gujarati font to print 42 glyphs.

## 2. Module

M20 Floor Plan and Look owns the client's shape, but this changes no screen and no token. It touches `client/src/App.jsx`, `client/src/main.jsx` and the build.

## 3. Why

Measured from `npm run build` at commit `0be8cb6`:

| Asset | Raw | Gzip |
|---|---|---|
| `index-*.js` | 781.67 kB | 225.24 kB |
| `PublicSite-*.js` | 41.25 kB | 11.72 kB |
| `index-*.css` | 59.89 kB | 11.41 kB |

`App.jsx` statically imports all 44 screens. `PublicSite` is the only `lazy()` route in the file. So there is one chunk, and everybody gets all of it: the captain opening a floor on a phone downloads the Tally bridge screens, every report definition, the integration settings, the appearance editor, inventory and attendance. Vite prints its own warning about the chunk size on every build.

This is already in the known problems table in `docs/PROJECT-STATE.md`, found on 8 October, written up as what it costs a guest on the public page. It costs the staff more than the guest, because the staff load it on restaurant wifi forty times a day.

Separately, the fonts. The font CSS carries 29 `unicode-range` blocks, so the script fonts are correctly subsetted by script and only fetch when their glyphs appear. But Z Chaat has a second language set, so Anek Gujarati does fetch on the service screens. It is 450.19 kB — larger than the entire JavaScript bundle gzipped — and `client/src/features/i18n/gu.js` contains 42 distinct Gujarati glyphs. The whole script is being downloaded to draw a few dozen fixed action words.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P32-client-weight.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count, then `npm run build` and record the three figures above as they are today.

## 5. Files to read first

1. `client/src/App.jsx`, the whole file: every import and every route.
2. `client/src/main.jsx`, the font imports at the top and the `QueryClient` defaults.
3. `client/src/components/AppShell.jsx`, especially `OnlineAlerts` and `CaptainBillPrinter`, which mount for every signed-in screen.
4. `client/src/features/i18n/labels.js`, `gu.js` and `hi.js`.
5. `client/src/features/public/PublicSite.jsx` and how `App.jsx` already lazies it, including the `Suspense` boundary.
6. `client/src/components/ui/Spinner.jsx`, which draws a still shape — it is what a `Suspense` fallback should use.
7. `server/tests/designGuard.test.js`, so you know which client rules a test already enforces.

---

## 6. Split the routes

### What stays eager

The screens someone opens during service, where a chunk fetch on a weak signal would be felt:

- `LoginPage`
- `DashboardPage`
- `FloorViewPage`, `OrderScreenPage`, `TakeawayOrderPage`
- `KitchenDisplayPage`
- `BillScreenPage`
- `NotFoundPage`, and the shell and its guards

### What becomes lazy

Everything else, grouped so a chunk is fetched once by the person who needs it rather than by everyone:

| Group | Screens |
|---|---|
| Reports | `ReportPage`, `ReportsIndexPage`, `ActivityLogPage`, `LabourPage`, `StockPage`, `v2/BillListPage`, `v2/BillDetailPage` |
| Settlement | `CashBookPage`, `DayClosePage`, `AccountsPage`, `PayoutsPage`, `BillsListPage`, `ReceiptPreviewPage` |
| Settings | `SettingsPage`, `AppearancePage`, `DeviceSettingsPage`, `StationsPage`, `TableManagementPage`, `TableArrangePage` |
| Integrations | `IntegrationsPage`, `ItemMappingPage`, `TallyPage` |
| Menu | `MenuBuilderPage`, `AvailabilityBoardPage` |
| Inventory | `StockListPage`, `RecipeEditorPage` |
| Attendance | `ClockScreen`, `AttendanceRegisterPage`, `MyAttendancePage` |
| Staff and customers | `StaffListPage`, `StaffFormPage`, `CustomersPage` |
| Online | `OnlineInboxPage`, `BookingsPage` |
| Delivery | `DeliveryOrderPage` |

Grouping is by `import()` specifier: screens that should share a chunk are imported from one small index module per group, or given matching `manualChunks` entries in `vite.config.js`. Choose one approach and use it for all of them; do not mix.

Two cautions:

1. `OnlineAlerts` and `CaptainBillPrinter` mount in `AppShell.jsx`, not on a route. They stay eager wherever they are imported from. A counter computer must not wait for a chunk before it can print a captain's bill.
2. The `Suspense` fallback must draw the screen's shape, still, using `Spinner`. `DESIGN-SYSTEM.md` section 13c requires it and a guard test enforces that nothing loops. A fallback of `null` would make a navigation look broken during a rush, which is exactly what that rule exists to prevent.

### The target

The eager chunk should fall to well under half of 225 kB gzip. Record the real figure; do not claim a number you did not build.

## 7. Subset the Gujarati and Devanagari fonts

`gu.js` has 42 distinct Gujarati glyphs and `hi.js` has 45 Devanagari ones. The fonts are 450.19 kB and 726.16 kB.

Build a subset from those two files at build time rather than checking a binary into the repo, so a new label can never silently render as a box. The build step reads `gu.js` and `hi.js`, collects every character above U+0900, and produces a subset of each variable font containing exactly those glyphs plus the Latin digits and punctuation that appear beside them in a bilingual line.

Three things to get right:

1. **Fail loudly.** If a glyph in the labels file is missing from the subset, the build fails with the character named. A silent box on a cashier's screen is worse than a failed build, and it follows the project's own habit: the server refuses to start when an environment variable is wrong rather than starting half configured.
2. **Keep `unicode-range`.** The subset still declares its range, so the browser still only fetches it when those glyphs render. A restaurant with no second language set must still download neither file.
3. **Devanagari should not be downloading at all** for Z Chaat, which is on Gujarati. Confirm that in a browser network tab before and after. If it is being fetched today, that is a bug worth its own line in the summary — something is rendering a Devanagari glyph that should not be.

If the subsetting step turns out to be more than half a day's work, stop and do the cheap version instead: `font-display: swap` on those two faces, so Latin text paints immediately and the second language fills in. Write down that you chose the cheap version and why. It stops the font blocking first paint but still spends the bandwidth, so the subset stays owed.

## 8. Leave React Query mostly alone

`main.jsx` sets `staleTime: 30_000` globally while several screens poll at 10 and 15 seconds. Where the poll is shorter than the stale time the cache is doing nothing useful. It is harmless today, and P33 is about to make those intervals dynamic, so the right move is to leave it and let P33 set `staleTime` per query alongside each interval.

`refetchOnWindowFocus` stays on. The comment above it explains why — two tablets on the availability board do not see each other live, and coming back to a tab is the moment to catch up — and that reason is still true.

---

## 9. Rules this must not break

From `docs/DESIGN-SYSTEM.md` section 13c and the guard test: loading draws the screen's shape, still, and nothing loops. Every new `Suspense` fallback obeys this.
From `docs/CONVENTIONS.md` section 10: server state comes through `/src/api`. Splitting routes must not move a `fetch` into a component.
From `CLAUDE.md`: "Schema changes are additive." Nothing here touches the server at all.
`server/tests/designGuard.test.js` must still pass. If a lazy boundary moves a file into a scope the guard reads differently, fix the code, not the guard.

## 10. Checks and golden day

No server change, so no figure can move. Run `npm test` anyway.

`npm run e2e` is the real check here, and it is the one most likely to find something: Playwright navigates between screens quickly, and a lazy boundary is exactly the thing that turns a passing navigation into a flake. All thirteen specs must pass, and if any of them needed a wait added, say which and why — a spec that needs a new wait is telling you a real person would see a blank frame.

Also check by hand, at 380 and 1280: sign in, go to the floor, open an order, bill it, then go to Reports. The jump to Reports is the first lazy chunk a person will hit. It must show the still shape and not a flash of nothing.

---

## 11. Docs to update

1. `docs/PERFORMANCE-BASELINE.md`: the three build figures from P30 beside today's, and the font sizes before and after.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P33, the live channel."
   3. Known problems: the row about a guest downloading the whole staff bundle, found 8 October, becomes FIXED today with the new figure.
   4. Decision log, dated today:
      "The back-office routes are lazy; the service screens stay eager. | A captain's phone was downloading Tally, the report engine and the integration settings to draw a floor. The screens someone opens forty times a day must never wait for a chunk."
      "The second-language fonts are subsetted at build time from `gu.js` and `hi.js`, and the build fails on a glyph they contain and the subset does not. | Anek Gujarati is 450 kB and the labels need 42 glyphs. A missing glyph must break the build, not a cashier's screen."
   5. "What changed recently": a P32 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
3. `docs/DESIGN-SYSTEM.md`: a line in section 13c saying a lazy route's fallback uses `Spinner` and draws the screen's shape.
4. `docs/prompts/README.md`: add the P32 row and mark it Done.
5. `docs/CAFFEZA-BUILD-PLAN.md` section 3: add the P32 row.

---

## 12. Out of scope

Any server change. P31.
Poll intervals and WebSockets. P33.
Changing what any screen does, shows or is called.
Adding a second language anywhere, or translating anything new. The scope of the second language is fixed action words, decided in M3 and again in P20A.
Replacing Anek. The typeface is a design-system decision from P20A, not a performance one.

## 13. Done when

1. `npm run build` passes with no Vite chunk-size warning, and the eager chunk's gzip figure is recorded beside P30's 225.24 kB.
2. `npm test` and `npm run lint` pass, counts recorded.
3. `npm run e2e` passes all thirteen specs, with any added wait explained.
4. In a browser network tab on the floor screen: the Gujarati font fetched is the subset, the Devanagari font is not fetched at all, and the Reports chunk is not fetched until you open Reports.
5. By hand at 380 and 1280: the first navigation to a lazy screen shows the still shape, no flash of nothing, no sideways scroll.
6. Every doc in section 11 is updated.
7. Commits on `main`, one line each, for example:
   `lazy-load the back office routes`
   `subset the second language fonts`
   `update docs for p32`
8. Push `main`.
9. Print a short summary: the chunk figures before and after, the font figures before and after, whether Devanagari was being fetched, and anything that surprised you.
