# P19 Floor plan

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P18.

---

## 1. What to build, in one sentence

Let a manager lay out each section's tables on a grid that matches the real room, show every table's live state on that plan with its guests, time open and amount, ask for the guest count when a table is opened, and show a billing strip of tables waiting to pay, like Caffeza's current screen.

## 2. Module

M20 Floor Plan and Look, the floor plan part. The look is P20.
It touches M2: tables, opening an order, and the floor screen.

## 3. Why

Caffeza's captains find tables by where they are in the room, not by number.
Their current screen shows each table's state in colour, its guest count, and a strip of tables whose bill is printed and waiting to be paid.
Ours shows tiles in number order, grouped by section, with only "free" or "taken".

And covers matter for the reports: average per cover is dine-in net sales over dine-in covers. A table opened without a guest count has no covers, which quietly pulls that figure up. Caffeza records guests on every table today.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P19-floor-plan.md`.
2. `git pull`. `git status` should show only that file.
3. `docs/prompts/README.md` must show P18 as Done. If not, stop.
4. Run `npm test` and record the count. It should match P18's "after" count. If anything fails, stop and tell me.

## 5. Files to read first

1. `docs/CAFFEZA-PROFILE.md` section 6, the floor.
2. `docs/DESIGN-SYSTEM.md`, all of it, especially tap targets and the availability colours.
3. `docs/API-CONTRACT.md`: the table endpoints and moving an order to a table in section 12, and the M7 settings section.
4. `docs/DB-SCHEMA.md`: the `tables` section and section 17 settings.
5. `server/models/Table.js`, `server/controllers/tableController.js`, especially `occupancyFor`, and the order creation path in `server/services/orderService.js`.
6. `client/src/features/orders/FloorViewPage.jsx` and `TableManagementPage.jsx`.
7. `setup/caffeza.json` from P11.

---

## 6. The data

All additive.

### 6a. Tables

| Field | Type | Notes |
|---|---|---|
| `layout` | Object or null | `{ x, y, w, h, shape }`. Null means the table has no place on a plan yet. |

`x` from 0 to 23 and `y` from 0 to 15: the section is a grid of 24 columns by 16 rows.
`w` and `h` from 1 to 4.
`shape`: `SQUARE`, `ROUND` or `LONG`. `LONG` needs `w` and `h` to differ.
The table must fit inside the grid: `x + w` at most 24, `y + h` at most 16.

### 6b. Settings

New group `settings.floor`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `sectionOrder` | [String] | `[]` | Section names in the order the floor screen shows them. Sections not listed come after, by name. |
| `longOpenMinutes` | Number | 90 | A table open longer than this is marked as running long. Integer 15 to 600. |
| `requireGuestCount` | Boolean | `false` | When true, a dine-in order cannot be opened without a guest count. |

`requireGuestCount` defaults to false so nothing changes for existing restaurants or tests.
Caffeza's setup file turns it on. See section 12.

Every change is audited through the existing settings audit code.

---

## 7. The server

### 7a. Saving a layout

`PATCH /api/v1/tables/layout`
Roles: OWNER, MANAGER, the same as managing tables today.
Body: `{ section, tables: [ { tableId, x, y, w, h, shape } ] }`, every table in that section with a place on the plan, saved together.

Rules:
1. Every table belongs to this restaurant and to the named section. 400 otherwise.
2. Every value is within the bounds in 6a. 400 otherwise.
3. No two tables in the request overlap. 422 `BUSINESS_RULE_VIOLATED`, naming each overlapping pair.
4. A table of that section not in the request keeps its existing `layout`. To take a table off the plan, send it with `layout: null`.
5. Saved in one write per table inside one transaction, so a refused save changes nothing.

### 7b. What the floor screen reads

`GET /tables` already returns `occupancy` for each table. Extend it, additively:

| Field | Meaning |
|---|---|
| `isOccupied`, `orderId` | As today |
| `state` | `FREE`, `OPEN`, `SERVED` when the order is `READY_TO_BILL`, or `BILL_PRINTED` when the order has a live unpaid bill |
| `guestCount` | From the order |
| `openedAt` | From the order |
| `isLong` | Open for more than `longOpenMinutes` |
| `captainName` | Who opened the order, from the user, read once per request for all tables together |
| `itemTotalInPaise` | The order's live line totals so far, before GST, from the frozen line values |
| `billTotalInPaise` | When `BILL_PRINTED`, the bill's total. Otherwise null. |

Build it with a fixed number of queries for the whole floor, never one query per table. Say in a comment how many.
Money is never read from the menu. `CLAUDE.md`: "Copy price, item name, and tax rate into the order when it is created."

### 7c. Requiring the guest count

When `settings.floor.requireGuestCount` is true, creating a `DINE_IN` order without a `guestCount` is refused with 400 VALIDATION_FAILED, message "How many guests? Enter the number before opening the table."
Read the setting through `settingsService`.
Delivery and takeaway orders never need one.

---

## 8. The client

### 8a. The floor screen

`FloorViewPage.jsx` gains a second view.

1. **Plan view**, for a section where at least one table has a layout. Tables are drawn at their grid positions, scaled to fit the screen width, square or round or long as set. Tables with no layout in that section are listed in a row under the plan, so none is ever hidden.
2. **Tile view**, the existing grid, for sections with no layout, and as a choice on any section. The choice is remembered on the device.
3. Sections in `sectionOrder`, then the rest.
4. Each table shows its name large, and when taken: guests, minutes open, and the item total, or the bill total when the bill is printed.
5. Each state has its own look, from the existing design tokens, with a word as well as a colour, so it never depends on colour alone: Free, Open, Served, Bill printed. A long-running table adds a clear marker. P20 may restyle these. Do not invent new colours here.
6. Tap a free table: open it. Tap a taken table: go to its order. A menu on each taken table offers "Move to another table", using the existing endpoint, and "View bill" when there is one.
7. Refresh every 15 seconds, as today.

### 8b. The billing strip

Above the sections, when any table is `BILL_PRINTED`: one compact row per table with its name, guests and bill total, newest first. Tapping one opens the bill. This is the "Billing" row on Caffeza's current screen.

### 8c. Asking for guests

Opening a dine-in table shows a guest picker: large buttons 1 to 8, and "More" for a number field.
When `requireGuestCount` is off, it also shows "Skip".
The order screen shows the guest count, and lets a captain change it, using the existing order update if one exists. If no endpoint can change `guestCount` on an open order, say so in your summary and do not add one.

### 8d. The layout editor

A new page for OWNER and MANAGER, reached from table management: "Arrange tables".

1. Pick a section. Its grid is shown with grid lines.
2. Tables with a layout sit on the grid. Tables without one sit in a tray beside it.
3. Drag a table from the tray onto the grid, or move it on the grid. It snaps to whole cells. Use pointer events, so mouse and touch both work. No new package for dragging.
4. Choose a selected table's size from presets, 1 by 1, 2 by 1, 2 by 2, 3 by 1, 4 by 2, and its shape.
5. Overlaps are shown in red as you drag, and "Save" stays disabled while any exist.
6. "Remove from plan" moves a table back to the tray.
7. "Save" sends the whole section. The server's overlap message, if any, is shown as it came.
8. Section order is set on the same page, by moving sections up and down.

Follow `docs/DESIGN-SYSTEM.md` for every control. The editor must work on a tablet held in two hands.

---

## 9. The spec, first

Before writing code, update and commit, as `add floor plan spec`:

1. `docs/API-CONTRACT.md`: the layout endpoint, the extended occupancy block, and the guest count rule, in the table and order sections, and the `floor` settings group in the M7 section. Add a short "M20 Floor Plan" section that points at each.
2. `docs/DB-SCHEMA.md`: `layout` on tables, and the settings group.

---

## 10. Tests

1. Saving a layout for a section stores every table's position. Saving again with one table moved changes only that table.
2. Out-of-grid values, a `LONG` table with equal sides, a table from another section, and a table from another restaurant are each refused.
3. Two overlapping tables are refused with both names in the message, and nothing is saved.
4. Taking a table off the plan with `layout: null` works.
5. `GET /tables` states: a free table is `FREE`. An open order is `OPEN` with its guests, captain and item total. An order with every line served is `SERVED`. An order with an unpaid bill is `BILL_PRINTED` with the bill total. After payment, the table is `FREE`.
6. With the clock moved 91 minutes past opening and `longOpenMinutes` at 90, `isLong` is true.
7. The item total is the frozen line totals: change the menu price after ordering and the floor still shows the old amount.
8. The number of database queries for `GET /tables` does not grow with the number of tables. Check it with 5 tables and with 40, by counting queries through a Mongoose debug hook in the test.
9. With `requireGuestCount` on, a dine-in order without guests is refused, and a takeaway or delivery order without guests is accepted. With it off, everything works as before.
10. Every role in the permission rules.

Run the full suite at the end. Every test that passed before must still pass.

---

## 11. Non-negotiable rules that apply

"Every database record has a `restaurantId`. Every query filters by it."
"Copy price, item name, and tax rate into the order when it is created. Never read them live from the menu." The floor's amounts come from frozen lines.
"Check permissions on the server for every endpoint."
"Schema changes are additive."

## 12. Checks and golden day

No money arithmetic changes.
In `setup/caffeza.json`, add `"floor": { "requireGuestCount": true, "longOpenMinutes": 90 }` under `settings`, so Caffeza records covers on every table, as they do today. Run the setup script's dry run on it to confirm the file still validates.
The golden day fixture already opens every dine-in order with its guest count, so turning the setting on in the fixture changes nothing. Turn it on there too, so the fixture matches Caffeza.

---

## 13. Docs to update

1. `docs/CAFFEZA-PROFILE.md` section 6: the physical layout is still `TO CONFIRM`, and the floor plan editor is ready for it.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P20, look, themes and customisation. It needs `docs/DESIGN-SYSTEM-V2.md` first."
   3. Module status: M20 becomes IN PROGRESS, "Floor plan built in P19."
   4. Decision log, dated today:
      "Each section is a 24 by 16 grid. Tables have an optional position, size and shape on it, saved per section, with overlaps refused. | Captains find tables by where they are in the room."
      "The floor shows four table states, Free, Open, Served and Bill printed, plus a long-running marker, and a strip of tables waiting to pay. | Caffeza's current screen works this way and their staff know it."
      "`settings.floor.requireGuestCount`, off by default and on for Caffeza, makes the guest count required on dine-in orders. | Average per cover is wrong when tables open without guests."
   5. "What changed recently": a P19 entry at the top, and the oldest moved to the archive.
3. `docs/prompts/README.md`: mark P19 as Done.

---

## 14. Out of scope

New colours, fonts or themes. That is P20.
Merging two tables into one order, or splitting a bill. Not asked for.
Reservations.
Drawing walls, counters or decorations on the plan.

---

## 15. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. By hand: arrange six tables in the "Cafe" section on a tablet-sized window, save, open the floor, and see them in place. Open one with 3 guests, fire, bill it, and see it in the billing strip with its total. Pay it and see it go free.
4. By hand: with the setting on, opening a table without choosing guests is not possible.
5. Every doc in section 13 is updated.
6. Commits on `main`, one line each, for example:
   `add floor plan spec`
   `add table layout and floor states`
   `require guest count by setting`
   `add plan view billing strip and layout editor`
   `update docs for p19`
7. Push `main`.
8. Print a short summary: commits, files changed, test counts before and after, the query count from test 8, and anything that surprised you.
