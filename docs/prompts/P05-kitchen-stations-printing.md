# P05 Kitchen stations and printing

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P04.

---

## 1. What to build, in one sentence

Add kitchen stations, route each category to a station so firing an order makes one KOT per station, filter the kitchen screen by station, and add printing from the browser for both KOTs and bills.

## 2. Module

M18 Kitchen Stations, new.
Printing is Phase 2 work from `docs/BUILD-PLAN.md` section 7.
It touches M1 (categories), M2 (firing, KOTs, the kitchen screen), M3 (the bill screen) and M0 (users).

## 3. Why

Caffeza has at least two stations, "Live Kitchen" and "Beverages". Today one fire makes one KOT with every line on it, so the coffee bar and the kitchen read the same ticket.
And nothing in the client prints at all. `GET /bills/:billId/receipt` returns the bill as text, but no screen sends it to a printer. A cafe cannot open without printed bills.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P05-kitchen-stations-printing.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. `docs/prompts/README.md` must show P04 as Done. If not, stop and tell me.
4. Run `npm test` and record the count. It should be 660 passing. If anything fails before you start, stop and tell me.

## 5. Files to read first

1. `docs/CAFFEZA-PROFILE.md` section 8, stations.
2. `docs/DEPLOYMENT.md` section 10, silent printing with Chrome.
3. `docs/API-CONTRACT.md` section 12 on firing and KOTs, section 15 on the receipt, and the M1 category endpoints.
4. `docs/DB-SCHEMA.md` the `categories`, `kots` and `users` sections.
5. `server/models/Kot.js`, `server/models/Category.js`, `server/models/User.js`.
6. `server/services/kitchenService.js`, all of it, especially `fireOrder`.
7. Whatever builds the receipt text for `GET /bills/:billId/receipt`. Find it from the route. The KOT ticket follows the same approach.
8. `server/validators/orderValidators.js`, `listKotsSchema`.
9. `client/src/features/kitchen/KitchenDisplayPage.jsx` and `client/src/features/billing/BillScreenPage.jsx`.
10. `docs/DESIGN-SYSTEM.md`, for any new screen.

---

## 6. The data

All additive.

### 6a. New collection `stations`

| Field | Type | Notes |
|---|---|---|
| `restaurantId`, `branchId` | ObjectId | From `baseSchema`, like every collection |
| `name` | String | Required, trimmed, 1 to 40 characters. Unique per restaurant, ignoring case, using a `nameLower` field the way categories do. |
| `displayOrder` | Number | Integer, default 0 |
| `printsTickets` | Boolean | Default false. Whether this station wants paper KOTs. |
| `isActive` | Boolean | Default true. Never deleted, only deactivated. |

Indexes: `{ restaurantId, branchId, nameLower }` unique, and `{ restaurantId, branchId, isActive, displayOrder }`.
Register the model in `server/models/index.js`. The registry test from P01 will fail if you forget.

### 6b. Changed collections

| Collection | New field | Notes |
|---|---|---|
| `categories` | `stationId` | ObjectId or null. Which station this category's dishes go to. |
| `kots` | `stationId`, `stationName` | ObjectId or null, and String or null. Frozen when the KOT is created. |
| `users` | `stationId` | ObjectId or null. Only meaningful for `KITCHEN` users. Which station their screen opens on. |

---

## 7. Routing when an order fires

In `fireOrder` in `server/services/kitchenService.js`:

1. Load the restaurant's active stations, ordered by `displayOrder`.
2. **No active stations:** behave exactly as today, one KOT with `stationId` null. Restaurants that do not use stations see no change, and every existing test still passes.
3. **One or more active stations:** for each line being fired, find its station through the category's **current** `stationId`, using the line's frozen `categoryId` from P03. Routing is decided at fire time, because it is about which counter cooks the dish today, not about history.
4. A line whose category has no station, whose category is missing, or whose station is inactive, goes to the **default station**: the first active station by `displayOrder`.
5. Group the lines by station. Create one KOT per station that has lines, each with its own `kotNumber` from the counter, and its own frozen `stationId` and `stationName`.
6. Everything else firing does stays the same: the same transaction, the same order line updates, and the stock deduction with its feature switch from P02. If the order lines point at a KOT, each line points at the KOT it actually went on.

Order the KOTs by station `displayOrder` so numbering is predictable.

---

## 8. Endpoints

Write the spec first, see section 11.

| Method and path | Roles | What it does |
|---|---|---|
| `GET /api/v1/stations` | All signed in | Active stations by `displayOrder`. `?includeInactive=true` for OWNER and MANAGER. |
| `POST /api/v1/stations` | OWNER, MANAGER | Create. Body `{ name, displayOrder?, printsTickets? }`. 409 on a duplicate name. |
| `PATCH /api/v1/stations/:stationId` | OWNER, MANAGER | Change `name`, `displayOrder`, `printsTickets`, `isActive`. |
| `PATCH /api/v1/categories/:categoryId` | Unchanged roles | Now also accepts `stationId`: an active station of this restaurant, or null. |
| `GET /api/v1/kots` | Unchanged | New optional `stationId` filter: a station id, or the word `none` for KOTs with no station. |
| `GET /api/v1/kots/:kotId/ticket?width=32` | All signed in | The KOT as plain text for printing. `width` 32 for 58mm paper, 48 for 80mm, default 32, anything else 400. `?reprint=true` adds a REPRINT line. |
| User create and edit | Unchanged roles | Now also accept `stationId` for `KITCHEN` users. Refused with 400 on any other role. |

Deactivating a station that categories still point at is allowed. Those categories fall back to the default station, by rule 4 of section 7. The response says how many categories now fall back, so the manager knows to fix them.

---

## 9. The KOT ticket text

Built on the server, like the receipt, by the same layout code or a sibling of it.
`docs/API-CONTRACT.md` section 15 explains why: one server layout can be snapshot tested, and a browser and a printer doing their own layout will disagree on paper.

Contents, top to bottom:

1. Station name, large: the line in capitals.
2. `KOT {kotNumber}` and the time fired in India time, 12-hour.
3. For dine-in: the table name and the guest count. For takeaway: TAKEAWAY. Delivery arrives in P06, so leave a clear place for it.
4. The captain's name, meaning who fired it.
5. A rule line.
6. Each line: quantity, then the item name, then the variant on its own indented line, each add-on on its own indented line starting with "+", and the note on its own indented line starting with "Note:".
7. A rule line, and `REPRINT` when asked for.

No prices on a KOT.
A long name wraps onto an indented continuation line and is never cut off, exactly like the receipt.

---

## 10. The client

### 10a. Printing from the browser

Create one small piece of printing code under `client/src/features/printing/`, used for both bills and KOTs.

1. It takes a block of plain text and a paper width, 58 or 80 mm.
2. It writes the text into a hidden iframe as a `<pre>` in a monospace font, with `@page { size: 58mm auto; margin: 0 }` or the 80mm equivalent, and a font size that fits 32 or 48 characters across the paper.
3. It calls `print()` on that iframe only, never on the whole page.
4. It removes the iframe afterwards.

When Chrome runs with `--kiosk-printing`, as `docs/DEPLOYMENT.md` section 10 sets up, this prints straight away with no dialog. Without the flag, the normal print dialog opens, which is fine on a developer's laptop.

**Device print settings.**
Paper width and KOT auto-print are properties of the device, not of the user or the restaurant: the cashier's computer has an 80mm printer whoever signs in.
Store them in the browser's `localStorage`, under one key, read through one small hook.
Add a "This device" panel reachable from the dashboard for every role, with: paper width, 58mm or 80mm, and for kitchen screens only, "Print new tickets automatically", on or off.

### 10b. Printing a bill

On `BillScreenPage.jsx`, add a "Print bill" button that fetches the receipt at this device's width and prints it.
It appears for every role that can read a bill.

### 10c. The kitchen screen

1. A station picker at the top: "All stations" plus each active station. It opens on the signed-in user's `stationId` when they have one, otherwise "All stations". The choice is remembered on the device.
2. The ticket list filters by the chosen station through the new `stationId` query parameter.
3. Each ticket shows its station name and has a "Reprint" button.
4. **Auto-print.** When the device has auto-print on, and a station other than "All" is chosen, every ticket that appears for the first time is printed once. Remember printed KOT ids on the device, keeping the most recent 500, so a page refresh or a re-poll never prints a ticket twice. On first load after switching auto-print on, mark every ticket already on screen as printed without printing them, so turning it on mid-service does not print a backlog.
5. If printing throws, show a small warning on the ticket, "Not printed", with the Reprint button. Never stop polling over a print failure.

### 10d. Settings screens

1. A Stations section on the settings page for OWNER and MANAGER: add, rename, reorder, set "prints tickets", deactivate.
2. On the category edit screen, a station picker.
3. On the user edit screen, a station picker that appears only for the KITCHEN role.

---

## 11. The spec, first

Before writing code, update and commit, as `add kitchen stations spec`:

1. `docs/API-CONTRACT.md`: a new section "M18 Kitchen Stations" after the existing module sections, with the endpoints in section 8, the routing rule in section 7, the ticket layout in section 9, and a permission summary table in the same style as the other modules. Note the category and user changes in their own sections too.
2. `docs/DB-SCHEMA.md`: a new section 19 `stations`, and the new fields on `categories`, `kots` and `users` in their sections.

---

## 12. Tests

**Routing**
1. With no stations, firing makes one KOT with a null station, exactly as before.
2. With Live Kitchen and Beverages, an order with a pasta and a latte fires two KOTs, numbered in station order, each with only its own lines and its frozen station name.
3. A line whose category has no station goes to the first station by `displayOrder`.
4. A line whose station was deactivated goes to the default station.
5. Firing again later, with only new lines, routes only the new lines.
6. Moving a category to another station after a KOT was printed does not change that KOT.
7. With inventory switched on, stock is still deducted exactly once per fired line when one fire makes two KOTs.

**Endpoints**
8. Station create, rename, duplicate name 409, deactivate, and every role in the permission table.
9. `PATCH /categories/:id` refuses a station from another restaurant and an inactive station.
10. `GET /kots?stationId=` returns only that station's tickets, and `stationId=none` returns only unrouted ones.
11. `stationId` on a non-KITCHEN user is refused.

**Ticket text**
12. Snapshot tests at width 32 and 48 for a dine-in KOT with a variant, two add-ons and a note.
13. A 60-character item name wraps under itself and every line stays within the width.
14. `?reprint=true` adds the REPRINT line. Any width other than 32 or 48 is 400.
15. No prices appear anywhere on the ticket.

Client code has no test runner in this repo. Keep the printing code small and plain enough to read in one sitting, and check it by hand in section 16.

Run the full suite at the end. Every test that passed before must still pass.

---

## 13. Non-negotiable rules that apply

"Every database record has a `restaurantId`. Every query filters by it." That includes the new `stations` queries and the category-to-station lookup during fire.
"Check permissions on the server for every endpoint. Hiding a button in React is not security."
"Store timestamps in UTC. Convert to India time only for display." The ticket shows India time.
"Printing happens from the browser on a device in the cafe. The server never talks to a printer."
"Schema changes are additive."

## 14. Checks and golden day

No money arithmetic changes, so no reconciliation check applies yet.
The golden day's menu in `docs/TEST-DATA.md` section 1 assigns each dish a station. Test 2 uses two of those dishes.

---

## 15. Docs to update

1. `docs/CAFFEZA-BUILD-PLAN.md` section 3: rename P05 to "Kitchen stations and printing".
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P06, delivery and platform orders."
   3. Module status: M18 becomes IN PROGRESS, with the note "Stations, routing, kitchen screen filter and printing built in P05."
   4. Decision log, dated today:
      "Lines are routed to stations through their category's current station when the order fires, one KOT per station. Unrouted lines go to the first active station. With no stations, firing works exactly as before. | Routing is about who cooks it today, not history. The KOT freezes the station it went to."
      "KOT tickets are laid out as text on the server, like receipts, and printed from the browser through a hidden iframe. Paper width and auto-print are stored per device. | One layout to test. The printer belongs to the device, not to whoever signs in."
   5. "What changed recently": a P05 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
3. `docs/prompts/README.md`: mark P05 as Done.

---

## 16. Out of scope

Talking to printers from the server, network printing, ESC/POS commands, or cash drawer kicks.
Kitchen users cancelling items. Still an open question.
Delivery orders on the ticket. P06 adds them.
Bumping, timers, or colour-coding by age on the kitchen screen.

---

## 17. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand, with the dev server running: create Live Kitchen and Beverages, route Italian Coffees to Beverages, fire an order with a pasta and a latte, and see two tickets, one on each station's screen.
4. By hand: print a bill and a KOT from the browser. Without the kiosk flag the print dialog opens, and the preview shows a narrow receipt, not the whole page.
5. By hand: turn auto-print on for a station tab, fire a new order, and see it print once. Refresh the page, and it does not print again.
6. Every doc in section 15 is updated.
7. Commits on `main`, one line each, for example:
   `add kitchen stations spec`
   `add stations and route kots by station`
   `add kot ticket text`
   `print bills and kots from the browser`
   `update docs for p05`
8. Push `main`.
9. Print a short summary: commits, files added and changed, test counts before and after, and a 48-wide sample ticket exactly as the API returns it.
