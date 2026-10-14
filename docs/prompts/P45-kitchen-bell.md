# P45 A loud bell on the kitchen screen for a new KOT

**Asked for by:** Rishi, 2026-10-14: "also add the sound when kot is send to the kitchen loud one so the chef and waiters can heard those".
**Modules:** M18 (the kitchen screen). Client only: no endpoint, field or setting on the server.
**Depends on:** P23 (the chime and the tap that allows sound), P36 (rounds on one ticket), P42 (the kitchen login's own screen).

## The rule

The kitchen screen rings a loud bell when a ticket arrives that it has not shown before, or a new round is added to one (P36): three strong notes, played twice, about a second and a half, far louder than the online chime. Then it says the ticket aloud, "KOT 12, Table 5", when This device's spoken alerts are on. One bell for several tickets arriving together. Nothing loops: the bell rings once per arrival, as DESIGN-SYSTEM's rule on movement and sound asks.

Tickets already on the board when the screen opens do not ring. A station's screen rings only for its own dishes.

Browsers allow sound only after a tap on the page. Until there has been one, the kitchen screen shows "Tap anywhere to turn on the sound" at the top; the first tap anywhere turns it on.

The kitchen header has **Sound on / Sound off**, kept per device (`kitchenSound`, on by default). A captain's phone on the Kitchen tab rings too while it is open and the sound is on.

## Tests

The kitchen screen in the browser: a ticket sent after it opens rings once (counted through a test hook, as printing is), tickets there at opening do not, Sound off stays silent, and the banner disappears after the first tap.
