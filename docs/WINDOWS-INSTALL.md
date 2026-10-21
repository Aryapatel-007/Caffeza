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

1. Make a new `CafePOS.zip` (section 1).
2. On the cafe PC, outside service: extract it over `C:\CafePOS`, replacing
   files. Your `.env` and `data` folder are not in the zip and stay as they are.
3. Double-click **Install Cafe POS** again. It skips what is done, installs the
   new packages and restarts the server.

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
