# Tally bridge

This small program lets the restaurant's software put each closed day's
vouchers straight into your Tally. It runs on the computer where Tally is
open. It does nothing else.

What it sends to Tally: only the vouchers and ledger lists the restaurant's
software prepared. What it sends back: only Tally's answers, such as "3
vouchers created" or "ledger not found", and your ledger and company names.
It never reads anything else on this computer.

## What you need

1. Tally open on this computer, with the restaurant's company open.
2. Node.js 20 or newer, from nodejs.org. Choose the LTS version and click
   Next through the installer.
3. A pairing code from the restaurant owner. They get it in Integrations,
   Tally, Pair a computer. It works once, for 10 minutes.

## Switch on Tally's connection

Tally has to accept requests from this program. Do this once.

**TallyPrime**

1. Press F1 (Help), then Settings, then Connectivity.
2. Open Client/Server configuration.
3. Set "TallyPrime acts as" to **Both**.
4. Set "Enable ODBC" to **Yes**.
5. Set "Port" to **9000**.
6. Save, then close and reopen TallyPrime.

**Tally.ERP 9**

1. At Gateway of Tally, press F12 (Configure), then Advanced Configuration.
2. Set "Tally.ERP 9 is acting as" to **Both**.
3. Set "Enable ODBC Server" to **Yes**.
4. Set "Port" to **9000**.
5. Save, then close and reopen Tally.ERP 9.

If the restaurant's software shows a different port, use that one instead.

## Set it up

Copy this folder to the computer, open a command window in it, and type:

```
node bridge.js pair ABCD2345 --server https://the-restaurant-address
```

Use the code and the address the owner gave you. You see "Paired with …".

Then check that it can reach Tally:

```
node bridge.js check
```

It lists the companies open in Tally. If it says Tally could not be reached,
Tally is closed or its connection is not switched on (see above).

## Run it

On Windows, double-click **start-bridge.cmd**. Elsewhere, type:

```
node bridge.js run
```

Leave the window open. Every 30 seconds it asks for work. When the owner or
manager presses Send to Tally, the vouchers arrive within a minute. The window
shows one line for each job, and the same lines are kept in `bridge.log` in
the bridge's own folder:

- Windows: `%APPDATA%\TallyBridge`
- Mac: `~/Library/Application Support/TallyBridge`

If Tally is on another computer or port, add `--tally 192.168.1.20:9000` to
`check` and `run`.

## Before the first day goes in

Ask the owner for the ledger list file (Integrations, Tally, Ledger list). Import
it in Tally to create any missing ledgers, then set the GST details on the tax
ledgers yourself. The software refuses to send a day while a ledger it uses is
missing from your company, and names the missing ledgers.

## If something goes wrong

- **"This bridge was switched off on the server"**: the owner revoked it. Ask
  for a new code and pair again.
- **A day shows Failed or Partly posted**: open the restaurant's software. It
  shows Tally's own message. Fix the cause in Tally (usually a missing ledger),
  delete any vouchers that did go in for that day, and ask the owner to redo
  the day.
- **Never** import the same day twice by hand as well as through the bridge.
  The software stops a day being sent twice. It cannot see a file you imported
  yourself.
