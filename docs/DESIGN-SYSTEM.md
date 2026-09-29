# DESIGN SYSTEM

What every screen in this product looks like, and why. Decided once in M1 so
M2 through M6 inherit it instead of each inventing their own.

This file is to the frontend what CONVENTIONS.md is to the backend. Read it
before building any screen. If two modules end up looking different, it is
because this file was not followed.

Screens: https://claude.ai/code/artifact/a65ddd80-2a1a-42d3-84b7-2b26e6cb4040

The tokens and the stamp component also exist as Figma variables and styles at
https://www.figma.com/design/j2xBUgXllUGV9GSIlmLIgC, which is where they were
first built. The canvas above is the current set of screens.

Last updated: 2026-08-31 by Rishi

---

## 1. What this product is replacing

A laminated menu card, a kitchen order chit, a thermal bill roll, a stainless
counter. That is the visual reference, and it is the reason for every choice
below. This is a tool used standing up, in a hurry, on a shared tablet with
someone waiting.

It is not a dashboard, a SaaS marketing page, or a design portfolio piece.

---

## 2. Three looks this product deliberately is not

These are named because they are what an unconstrained "make it look good"
instinct produces, and all three are instantly recognisable as a template.

**Not** warm cream background (near `#F4F1EA`) with a high-contrast serif and a
terracotta accent (near `#D97757`).

**Not** near-black background with one bright acid-green or vermilion accent.

**Not** a broadsheet newspaper layout: hairline rules, zero border-radius,
dense justified columns.

**No glassmorphism anywhere.** No translucent frosted panels, no `backdrop-blur`
cards floating over a gradient mesh. Surfaces are flat and opaque, always. A
drop shadow to show that a panel sits above the page is fine; a see-through
panel is not.

If a screen you are building starts drifting toward any of these, stop and say
what you are changing before you carry on.

---

## 3. Colour

Six tokens. That is the whole palette. There is no seventh brand colour and no
tint scale, because a five-role palette that is actually obeyed reads better
than a twelve-step ramp that is not.

| Token | Hex | Used for |
|---|---|---|
| `paper` | `#FAFAF7` | Page background. The only surface colour. |
| `ink` | `#1C1B19` | Primary text. Primary borders. The stamp's 3px edge. |
| `steel` | `#56606B` | Secondary text, dividers, disabled state. |
| `chana` | `#C99A2E` | Primary actions only: add, save, confirm. |
| `mirch` | `#B23A2E` | Destructive and out-of-stock state only. |
| `patta` | `#3F7D58` | Available and success state only. |

Plus one derived value:

| Token | Hex | Used for |
|---|---|---|
| `patta-tint` | `#D5E1D7` | The available stamp's fill. `patta` over `paper`, flattened opaque. |

### chana, mirch and patta are functional colour, not brand colour

This is the rule most likely to be broken, so it gets its own heading.

Those three carry meaning. `mirch` means something is destructive or out of
stock. `patta` means something is available or succeeded. `chana` means this is
the button that commits the action.

If you reach for one of them to make an element pop, stop. That is decoration
wearing a function's colour, and every time it happens the real signals get
harder to read. A screen where six things are green is a screen where green
means nothing.

Anything that just needs to be visible uses `ink` or `steel`.

---

## 4. Type

Two roles, one deliberate pairing. Both are IBM Plex.

**IBM Plex Mono — every number.** Prices, tax rates, quantities, counts, the
availability stamp's label. This product is built around prices and stock
counts, and numbers deserve a distinct, printed-ticket voice instead of
blending into body text. Mono also makes a column of prices line up on the
decimal without any extra work.

**IBM Plex Sans — everything else.** Labels, buttons, item names, descriptions,
headings, prose of any kind.

The test is simple: is this thing a number? Then Mono. Otherwise Sans.

An item description is prose, so it is Sans, even though it sits next to a
price. `GST 5%` is a number, so it is Mono. A section heading like `MAINS` is
prose, so it is Sans, even when it is set in caps.

### The ramp

| Style | Family / weight | Size / line | For |
|---|---|---|---|
| `sans/heading` | Sans SemiBold | 20 / 28 | Screen titles |
| `sans/body` | Sans Regular | 15 / 22 | Item names, general copy |
| `sans/label` | Sans Medium | 13 / 18 | Form labels, rail entries, inline actions |
| `sans/button` | Sans SemiBold | 15 / 20 | Button text |
| `sans/caption` | Sans Regular | 13 / 18 | Item descriptions, secondary prose |
| `sans/section` | Sans Medium | 12 / 16, +6% | Uppercase section and rail headings |
| `mono/price` | Mono Medium | 15 / 20 | Prices in a dense row |
| `mono/price-lg` | Mono SemiBold | 18 / 24 | Price on a tap tile, read at arm's length |
| `mono/stamp` | Mono Bold | 12 / 12, +8% | The availability stamp label |
| `mono/meta` | Mono Regular | 12 / 16 | Tax badges, counts, numeric metadata |

Note for Figma work: IBM Plex's style string is `SemiBold`, not `Semi Bold`.
Inter uses the spaced form; Plex does not. Guessing this wrong throws
`Cannot write to node with unloaded font`.

---

## 5. The availability stamp

The one place this design takes a visible risk. Everything else stays quiet
around it, which is what makes it work.

A chunky oval badge, rotated **-6deg**, with a **3px `ink` border** and a flat
opaque fill. Label in Plex Mono Bold, uppercase, tracked out 8%.

| State | Fill | Label colour | Reads |
|---|---|---|---|
| Available | `patta-tint` | `ink` | `AVAILABLE` |
| Out of stock | `paper` | `mirch` | `OUT OF STOCK` |

Never translucent. Never a gradient. The rotation is the whole personality;
resist adding anything else to it.

On tap it presses down 2px and settles. Nothing more elaborate. Under
`prefers-reduced-motion` the press becomes an instant state change and nothing
is lost.

**One rendering, reused everywhere availability appears.** The dense builder row
and the big availability tile use the same component at different sizes, not two
different drawings of the same idea.

### On naming

Call it the "86 board" between yourselves and in code comments if you like.
It is accurate kitchen shorthand and it is a good name for the screen.

Do not put "86'd" on the actual screen. The people using this are Owners,
Managers, Cashiers, Waiters, Kitchen and Storekeepers in Ahmedabad, not line
cooks in a US kitchen who would recognise the slang. On screen the states read
exactly `AVAILABLE` and `OUT OF STOCK`, and nothing cleverer than that.

---

## 6. Layout

**Lists, not cards, for anything staff scan.** Restaurant staff read a dense
list faster than a grid of cards. Cards are for tap targets, not for reading.

**Slide-over, not modal, for editing one record.** A modal blocks the rest of
the screen, and someone editing a menu item frequently needs to glance back at
the category rail mid-edit. The panel comes in from the right and leaves the
rest of the screen readable.

**No nested navigation on a screen used during service.** The availability
board is one flat list behind a sticky filter bar. Anything that takes two taps
to reach will not be used at 8pm.

---

## 7. The hardware this actually runs on

A shared tablet on a counter, touched by someone in a hurry, and a desktop in
the back office. Design for the tablet.

- **Every tap target on a service screen is at least 48px.** The whole tile is
  tappable, not a small switch inside it.
- **Both screens work down to 375px** even though tablet is the primary target.
  Test at 375 and 768, not just desktop.
- **Visible keyboard focus everywhere.** Do not strip the outline for looks.
- **Respect `prefers-reduced-motion`.**
- **Colour is never the only signal.** The stamp's text carries the state;
  colour reinforces it. Someone who cannot separate red from green still reads
  `OUT OF STOCK`.

---

## 8. Words

Buttons say the action, not a generic verb. "Save item", not "Submit".
"Add category", not "Create". A success message uses the same verb as the
button that caused it: "Item saved", not "Success".

Never show a raw error code or an HTTP status to a user. Every server error
maps to a plain sentence. The mapping for M1 lives in
`client/src/features/menu/errorCopy.js`; extend it, do not scatter copies.

Never restate a server rule in the client. If the server says a category is
turned off, show what the server said. A second implementation of a rule in the
browser is a second implementation that can disagree with the first.

---

## 9. Where the tokens live in code

`client/src/index.css`, in the `@theme` block.

**Not `tailwind.config.js`.** This project is on Tailwind v4, which is
configured in CSS and has no config file and no PostCSS config. If you go
looking for `tailwind.config.js`, that is why there is not one.

```css
@theme {
  --color-paper: #FAFAF7;
  --color-ink: #1C1B19;
  /* ... */
}
```

Tailwind generates `bg-paper`, `text-ink`, `border-steel` and so on from those
names automatically. Use the token classes. A raw hex in a component is a bug.

The same six names exist as Figma variables in the file linked at the top, each
carrying its functional description, so the two stay in step.

---

## 10. A screen someone operates during service, not one they read

M3 added this section, for the billing screens, and M4 inherits it rather than
re-deriving it: a stock adjustment is the same kind of moment as a payment, a
storekeeper mid-delivery instead of a cashier mid-queue.

**Numbers carry the meaning, words support it.** The single most important
figure on the screen — a bill's grand total, a payment amount — is the largest
thing on it, in Plex Mono, at minimum 40px in a keypad's own display and at
least 32px anywhere else it is the headline. Everything else on the screen is
quieter than that number.

**Every state gets an icon, a colour, and a word, together.** Section 7 already
says colour is never the only signal; on an operator screen this extends past
the availability stamp to every status a person has to tell apart at a glance.
A bill reads `UNPAID`, `PAID` or `VOIDED` with a distinct icon and a distinct
colour on each, not colour alone and not text alone; a stock row reads
`IN_STOCK`, `LOW` or `OUT` the same way.

Both go through `client/src/components/ui/StatusBadge.jsx`, one shared shell
for any field with three or more states, each module supplying its own words
and colours as a `faces` map. It exists because M3's bill status and M4's stock
state are the same shape of problem — `BillStatusBadge.jsx` is now a five-line
wrapper over it — and a second one-off component would have been the second
copy CONVENTIONS keeps warning against. `AvailabilityStamp` stays separate and
two-state on purpose: section 5 reserves its rotated look as the product's one
signature element, and this shell does not try to reproduce that.

**One primary action, and it can change with the screen's own state.** Exactly
one `chana` element at any moment — never two — but which action that is may
depend on what is true right now. An unpaid bill's primary action is collecting
payment; once it is paid, printing the receipt takes over as primary. The
button that is `chana` is whichever thing is actually next, not whichever was
chosen first.

**Confirmations state the consequence, not the question.** Not "Are you sure?".
"Bill 2026-27/000042 for ₹252.00 will be voided. The number stays used." — the
real numbers, spelled out, so a person who reads it has the information the
sentence needed to carry either way. See
`client/src/features/billing/VoidBillPanel.jsx`.

**No free-text field that anyone is required to fill in on a fast-moving
screen**, with one deliberate exception: a reason a manager writes for
discretionary money or stock movement (a discount, a void, a stock adjustment)
is real prose a person reasons through, not one of a small predictable set, and
gets a plain text field the way `CancelPanel.jsx` and `VoidBillPanel.jsx` both
ask for one. A quantity or an amount never does — that is what section 10.1
below is for.

### 10.1 The numeric keypad

`client/src/components/ui/NumericKeypad.jsx`. One shared component for every
money and quantity entry in this product, not a text input with the system
keyboard raised over it.

A large digit grid, a live display at the top showing exactly what has been
typed with the caller's prefix or suffix (`₹`, `%`, the ingredient's own unit),
and — unless the caller hides them for its own combined footer — a Cancel and a
Confirm action sized the same as everything else on a service screen, at least
56px tall.

It is deliberately generic. It does no unit conversion of its own: the caller
reads the typed string back through `onConfirm`, and `onChange` on every
keystroke for a caller that wants to show live derived text underneath, the way
M4's adjustment screen shows an ingredient's purchase-unit entry converting to
its base unit as the storekeeper types. `server/utils/units.js` is still the
only place that multiplies; the keypad only ever hands back what was typed.

Money goes through `parseRupeesToPaise` and nothing else converts it, matching
the money rule already in section 9's neighbourhood: `utils/formatMoney.js` is
the one place, front end, that turns a typed amount into the paise the API
takes.

### 10.2 A second language on one screen, on purpose

M5's clock screen carries English-primary, Hindi-secondary labels (decision
D6) because every one of the six roles touches it every day. M3's billing
screens now do the same with Gujarati, because Ahmedabad is where this product
is used and a cashier — the role that most needs this pairing — is not
guaranteed to read English quickly under a queue.

Each module owns its own small labels file and its own `Bilingual` component —
`features/attendance/labels.js` plus `Bilingual.jsx` for Hindi,
`features/billing/labels.js` plus `Bilingual.jsx` for Gujarati — rather than
sharing one. The languages are genuinely different and the scope is
genuinely narrow: a handful of fixed action words on one screen each, never
item names, never a reason someone typed, never a general i18n layer. Do not
import one module's labels file from another, and do not reach for this
pattern anywhere the words are not looked at by someone standing up mid-queue.

---

## 11. Charts and report screens

Added by M6, which is the first module that plots anything. M13's finance
dashboard in Phase 1B is the next, and should inherit these rather than
re-deriving them.

**A report screen is back office on a desktop, not service on a tablet.** This
is the one place section 6's layout rules relax: a report may be dense, and a
table is the right form whenever a row carries several numbers at once. A tax
slab has a taxable value, CGST, SGST and a total, and no chart shows four
measures per category honestly. Everything else — the tokens, the type ramp,
the 48px targets on anything tappable — is unchanged.

**No charting library.** Every chart in this product so far is a single series
of magnitudes, which needs a `<div>` with a width and a background colour. The
four primitives in `client/src/components/charts/` are plain HTML and CSS.

Do not reach for SVG for a bar or column. The first version of `Columns.jsx`
positioned SVG rects using `min()` and `calc()` inside width attributes, which
browsers support unevenly: the bars rendered at the wrong width and sat left of
the labels they belonged to, and neither the test suite nor the palette
validator could see it — only opening the page did. Flexbox gives geometry the
browser is certain about, and centring a mark in its band becomes
`justify-center` rather than arithmetic.

### 11.1 Colour in a chart

**A single-series chart has no categorical palette and no legend.** With
nothing to tell apart, the mark carries no identity, so it uses `ink` — the
same rule as section 3, applied to a bar: `chana`, `mirch` and `patta` are
functional colour, and a data mark that means nothing in particular is not
allowed to borrow one. One series needs no legend either; the caption already
says what is plotted.

**Never darker-where-bigger on nominal categories.** Colouring each bar by its
own value double-encodes length as hue and spends the only free channel on
information the length already shows. One series, one colour, every bar.

**Status inside a report still obeys section 7.** A stock row reading
IN_STOCK / LOW / OUT gets an icon, a colour and a word together, through
`components/ui/StatusBadge.jsx` — the same shared shell M3's bill status uses.

### 11.2 Mark specs

Columns cap at **24px** wide, whatever the band's width; the leftover is air.
Ranked horizontal bars are **14px** tall — a near-black block running the full
width of a row reads loud at 20. Both get a **4px rounded data end, square at
the baseline**. Gridlines and axes are **hairline, solid, one step off the
surface**, never dashed. The surface does the separating; never draw a stroke
around a mark to hold it apart from its neighbour.

**Numbers in a chart are Plex Mono**, like every number in this product
(section 4). The usual advice for a hero figure is "the same sans as
everything else, never a display face", and the reason behind it is that a
decorative face reads as off-brand — which Plex Mono is not here. Switching to
Sans for report figures alone would be the inconsistency.

`tabular-nums` goes on **columns of numbers that align vertically** — table
cells, axis ticks — and **not** on a large standalone value, where equal-width
digits make a number like 121 look loose.

### 11.3 What every report screen owes the reader

**One filter row, above everything it scopes.** Never a filter inside a chart
card: two charts on one screen must not be able to show different ranges with
nothing on screen saying so.

**A table view for every chart.** `DataTable` behind a "Show the numbers"
details element. A tooltip enhances; it never gates. Every value has to be
reachable without hovering, for anyone who cannot.

**Label selectively.** Never a number on every column — the axis carries
orientation, the tooltip the exact figure, the table everything. A dense axis
shows every nth label, and the ones that print are allowed to overflow their
own band rather than truncate: an ellipsis in the middle of a date is worse
than no date.

**Hit targets bigger than the mark.** A column's hit area is its whole band at
full height, so a quiet day with a zero-height column is as hoverable as the
busiest one.

**Hold the previous render while refetching**, at reduced opacity. A skeleton
flash on a range change makes the numbers jump and reads as a reload.

**Zeros, not gaps.** A day with no sales is a row of zeros, not a missing row;
an unused payment method is `₹0.00`, not an absent line. A missing row reads as
"no data", a zero reads as "none happened", and those are different answers.
