# Installing Cafe POS on the cafe's Windows PC

P62. For a Windows 10 or 11 PC that will be the cafe's server: the till, and
the computer every tablet and kitchen screen talks to over the WiFi. For a
dedicated Ubuntu mini PC, use `docs/DEPLOYMENT.md` section 17 instead.

---

## 1. Make the package (on your own computer)

```
bash box/windows/make-package.sh
```

It makes `release/CafePOS.zip` from the last commit: the code, the built
screens and the installer. No passwords or keys are inside it. Copy it to a pen
drive, or send it to yourself.

## 2. Install (on the cafe PC, once)

1. Copy `CafePOS.zip` to the PC and **extract it to `C:\`**, so you have
   `C:\CafePOS`.
2. The PC must be **on the internet** for this first setup (it downloads
   Node.js, MongoDB and the app's packages, about 400 MB).
3. Double-click **`Install Cafe POS`** in `C:\CafePOS`. Click **Yes** when
   Windows asks for permission.
4. Answer four questions: cafe name, owner name, owner mobile number, owner
   password. Use letters and numbers in the password, no quote marks.
   Then paste the update token if you have it (section 6), or press Enter.
5. Say **Y** to "Load the sample Z Chaat menu and 12 starter tables?" for a
   ready-to-try system, or **N** to start empty.
6. It ends with "All done" and the address for tablets, for example
   `http://192.168.1.20`.

Takes about 10 minutes. It is safe to run again if anything stops halfway.

## 3. Every day

- **On the cafe PC:** double-click **Cafe POS** on the desktop. If the server
  is not running yet it starts it, then it opens the screens.
- **The server starts by itself** whenever the PC is switched on, before anyone
  logs in, and restarts itself if it ever stops. Tablets work even if nobody
  clicks the icon.
- **Tablets and phones:** join the same WiFi as the PC and open the address.
  **Cafe POS - Connect a device** on the desktop opens the card with the QR
  codes; print it for the counter (`docs/STAFF-SETUP.md`).

## 4. What it set up

| What | Where |
|---|---|
| The app and its settings | `C:\CafePOS`, settings in `C:\CafePOS\.env` (private: it holds the keys) |
| MongoDB | Windows service "MongoDB", single-node replica set `rs0`, on this PC only (127.0.0.1) |
| The server | Task Scheduler, "CafePOS Server": at start-up, as SYSTEM, restarts every minute if it stops |
| Hourly snapshots | Task Scheduler, "CafePOS Snapshot": `C:\CafePOS\data\snapshots` (24 hourly, 31 daily, 12 monthly) |
| Updates | Task Scheduler, "CafePOS Update": every 15 minutes, acting only from 4 to 5 AM (section 6) |
| The database files | MongoDB's own data folder, by default `C:\Program Files\MongoDB\Server\<version>\data`. Not inside `C:\CafePOS` |
| Logs | `C:\CafePOS\data\logs\server.log` and `snapshot.log` |
| Firewall | Rule "Cafe POS": the app's port (80, or 8080 if 80 was taken) open to the network |
| Desktop | "Cafe POS" and "Cafe POS - Connect a device", for every user |

## 5. Keep the PC a good server

- **Power:** Settings, System, Power: **Sleep: Never** when plugged in. A
  sleeping PC is a server no tablet can reach. Put the PC and the router on the
  **UPS**.
- **After a power cut:** in the PC's BIOS, set "Restore on AC power loss" to
  **On**, so it starts by itself when power returns.
- **Windows Update:** set active hours to cover service, so it never restarts
  mid-rush.
- **The address:** on the router, reserve this PC's address (DHCP reservation),
  so the address on the card never changes. If the PC moves to another WiFi,
  the address is worked out again by itself; reprint the card from
  "Connect a device".

## 6. Updating to a new version

New versions install themselves at night. Nobody at the cafe does anything.

### How it works

1. A developer commits and pushes, then publishes a release:
   `bash box/windows/make-package.sh --publish`. That builds `CafePOS.zip`,
   signs a `manifest.json` (version, build time, the zip's checksum) with the
   release key, and puts both on a GitHub release of `riship-17/Cafezza-Offline`.
2. On the cafe PC, the **CafePOS Update** task runs every 15 minutes. It does
   anything only inside `UPDATE_WINDOW` (4 to 5 AM by default, the PC's own
   clock), and only when GitHub has a newer version than the one running.
3. It downloads the manifest and refuses it unless it is signed by the key in
   `box\windows\release-public-key.pem` of the version already on the PC. It
   refuses a version built earlier than the running one. Then it downloads the
   zip and refuses it unless it matches the signed checksum.
4. It takes a database snapshot, stops the server, moves the running version to
   `data\updates\previous`, puts the new one in place, runs `npm ci` and builds
   the indexes, starts the server, and waits up to 2 minutes for `/health` to
   say it is the new version with its database connected.
5. If anything fails after the server stopped, it puts the previous version
   back, with its own packages, and starts it again. The new one is kept in
   `data\updates\failed` to look at. The database is never touched: schema
   changes are additive, so the old version reads it.

`.env` and `data` (the snapshots, the logs, the network notes) never move. The
database is MongoDB's own and is not in `C:\CafePOS` at all.

### Setting it up

- **The token.** The repository is private, so the PC needs a read-only
  GitHub token: a fine-grained token for `riship-17/Cafezza-Offline` only, with
  Contents: Read-only. The installer asks for it; or put it in `.env` as
  `UPDATE_TOKEN=`. Without it, updates are off and nothing else changes.
- **The release key.** Made once with `node box/windows/release.mjs keygen`.
  The private half is `~/.cafepos/release-signing-key.pem` on the developer's
  computer. Back it up; a developer without it cannot publish. If it is lost, a
  new key needs every cafe PC updated once by hand (below).
- **Settings in `.env`:** `UPDATE_AUTO=off` stops it; `UPDATE_WINDOW=03:30-04:30`
  moves it (it may cross midnight, as in `23:30-01:00`).

### When a person has to do it

`make-package.sh --publish` marks a release **manual** when `install.ps1`
changed since the last release, because new scheduled tasks or settings need
the installer. Add `--manual "the reason"` for anything else the PC cannot do by
itself, like a one-off data migration (`npm run migrate:...`). The PCs see a
manual release, write why in `data\logs\update.log`, and leave it for a person.

By hand: copy the new `CafePOS.zip` over `C:\CafePOS` outside service, and
double-click **Install Cafe POS**. Your `.env` and `data` are not in the zip.

### Commands, in an Administrator PowerShell inside `C:\CafePOS`

```
node box\windows\update.mjs check      is there a newer version? changes nothing
node box\windows\update.mjs now        install it now, outside service
node box\windows\update.mjs rollback   back to the version before; run again to undo
```

What happened: `data\logs\update.log`, and `data\updates\status.json` for the
last attempt.

## 7. When something is wrong

- **The icon says the server did not start:** wait a minute after switching on
  and try again. Then open `C:\CafePOS\data\logs\server.log`; the last lines say
  why. "not a replica set": run Install Cafe POS again.
- **Tablets cannot open the address, the PC can:** the tablet is on another
  WiFi, or the address changed. Open "Cafe POS - Connect a device" on the PC
  for the current address.
- **"Saving paused: server clock is wrong":** set the PC's clock right
  (Settings, Time, Sync now). `docs/RUNBOOK.md` section 4.
- Everything else: `docs/RUNBOOK.md`. Its commands are the same on Windows,
  run in PowerShell inside `C:\CafePOS` (for example `npm run replication -- status`).
