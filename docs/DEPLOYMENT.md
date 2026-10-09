# Deployment

How the system runs for Caffeza, and how to keep it running.
Decision: the Node server runs in the cloud, next to a separate Atlas cluster for Caffeza.
Prompt P12 does the code side of this. Everything else here is done by hand, once, and then kept up.

---

## 1. The shape

One Node service serves both the API and the built React screens, from one web address.
The database is a MongoDB Atlas cluster used only by Caffeza.
Every device in the cafe opens the same https address in Chrome.
Bills and KOTs print from the devices in the cafe, because a cloud server cannot reach a printer on the cafe's network.
The cafe has a backup internet line, because billing now needs the internet.

```
Captain phones ─┐
Station tablets ├─ cafe WiFi ─ router (broadband + 4G backup) ─ internet ─ https://caffeza.<domain> ─ Node service ─ Atlas cluster
Cashier PC ─────┘                                                                                       (same region)
   └─ bill printer (USB or network)
```

Why one address for both screens and API:
The login cookie only travels to the address that set it, and CORS allows exactly one origin.
One address removes both problems.
P12 makes Express serve `client/dist` in production to get there.

---

## 2. Choosing a host

P12 made the app ready for any host that runs a container or a Node service. Arya picks the host and records the choice in the decision log.
Any host is fine if it meets all of these:

| Need | Why |
|---|---|
| An always-on service, not serverless functions | The rate limiter keeps its counts in memory, the database connection stays open, and a till cannot wait for a cold start. Serverless platforms like Vercel functions do not fit this server as it is written. |
| The same region as the Atlas cluster, in India if possible | One bill can mean ten or more database queries. Distance between server and database is paid on every one. |
| A fixed outbound IP address | So Atlas network access can allow that one address and nothing else |
| https with a custom domain | The login cookie is `Secure`, so it only works over https |
| Automatic restart after a crash | Nobody is watching at 9 PM on a Saturday |
| Environment variables stored in the host's settings | Secrets never live in a file in the repo |
| Searchable logs kept for at least 7 days | To find out what happened last night |

If a host cannot give a fixed outbound address, stop and decide together before continuing.
Opening Atlas to every address is not an acceptable workaround.

Check each candidate's current regions, prices and outbound IP options on its own website before choosing.

**Fill this in once the host is chosen:**

| Item | Value |
|---|---|
| Host | |
| Region | |
| How a deploy happens | |
| How the release step (`npm run db:indexes`) runs before traffic moves | |
| Where the logs are | |
| Fixed outbound address, allowed in Atlas | |

---

## 3. Atlas setup, done once by hand

1. Create a new Atlas project called "Caffeza". Keep it separate from the project holding the demo restaurants.
2. Create the production cluster on a paid tier that includes automatic backups. Turn backups on.
3. Put it in the same region as the server.
4. Create one database user for the app, with read and write on the Caffeza database only. No admin rights.
5. Under Network Access, allow only the server's fixed outbound address.
6. Create a second, separate cluster for staging. A free tier is acceptable for staging only, because it holds no real bills.
7. Turn on two-factor sign-in for everyone with access to the Atlas account.
8. Set Atlas alerts for high connections, low disk and a replica set member going down, sent to both developers.
9. Write down the backup frequency and how long backups are kept, from the tier you chose. Put it in the decision log.

Never run `npm run seed:demo` against either Caffeza cluster.
The script already refuses to run unless `NODE_ENV` is development or test, and refuses any host but localhost unless it is listed in `SEED_DEMO_ALLOWED_HOSTS`.

---

## 4. Environments

| Environment | Server | Database | Used for |
|---|---|---|---|
| Local | Your laptop, `npm run dev` | A local MongoDB running as a single-node replica set, or the staging cluster | Building features. Tests use `mongodb-memory-server`. |
| Staging | The host | Atlas staging cluster | Checking a release, showing the client, training staff |
| Production | The host | Atlas production cluster | Real bills only |

Environment variables for staging and production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` in both |
| `PORT` | Whatever the host tells you |
| `MONGO_URI` | The cluster's connection string. A secret. |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48`. Different in every environment. |
| `JWT_REFRESH_SECRET` | A second, different value from the same command |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | As in `.env.example` |
| `BCRYPT_ROUNDS` | As in `.env.example` |
| `CLIENT_ORIGIN` | The exact https address, like `https://caffeza.<domain>`, with no trailing slash |
| `INTEGRATION_SECRETS_KEY` | P25. `openssl rand -base64 32`. Different in every environment. **Required**: the server refuses to start without it. Encrypts every partner credential (Pine Labs, Swiggy, Zomato). Losing this key makes every saved partner credential unreadable, and they must be entered again. |
| `PAYMENT_SECRETS_KEY` | P24. `openssl rand -base64 32`. Different in every environment. Encrypts each restaurant's Razorpay secrets. Optional: without it, connecting a gateway is refused. Losing it means every restaurant connects Razorpay again. |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES`, `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | As in `.env.example` |
| `DISPLAY_TIMEZONE` | `Asia/Kolkata` |
| `TRUST_PROXY` | Added by P01. Set to what the host's documentation says for its proxy. |
| `SEED_DEMO_ALLOWED_HOSTS`, `DEMO_PASSWORD` | Not set, ever, in staging or production |

---

## 5. Domain and https

Buy one domain for the product.
Give each client a subdomain: `caffeza.<domain>` for production and `caffeza-staging.<domain>` for staging.
Point them at the host, and let the host issue the certificates.
`CLIENT_ORIGIN` must match the address exactly.

---

## 6. Every deploy

Deploy outside service hours only: after the last bill has been paid, or before 10:00 AM.
Never during service.

One service serves both the screens and the API from one address (P12). In
production it serves the built client from `client/dist`, and it refuses to
start if that build is missing or a declared index is missing.

1. On `main`: `npm ci`, then `npm test`, `npm run lint` and `npm run build` all pass.
2. Note the commit being deployed: `git rev-parse --short HEAD`. Set it on the host as `RELEASE_VERSION`.
3. Deploy to staging first. With the container, build it from this commit (section 13).
4. **Release step**, before traffic moves to the new version: `npm run db:indexes` against staging's database. Every deploy, not only the first. It only adds missing indexes and never drops one.
5. Start the new version. The server refuses to start if the client is not built or an index is missing, and the logs say which.
6. `npm run smoke -- --url https://caffeza-staging.<domain>`. Every line must pass, and the health line must show the commit from step 2.
7. On staging: sign in, open a table, send a KOT, bill it, pay it, open Day Close. Staging bills are fine.
   `npm run e2e:cloud` does the same through the screens. **It must only ever
   point at a separate staging database, never production**: it creates a real
   bill. It refuses to start unless `E2E_CLOUD_DATABASE` is set and is exactly
   the database name in `MONGO_URI`, and it refuses unless the owner login in
   `E2E_CLOUD_OWNER_PHONE` belongs to the restaurant named in
   `E2E_CLOUD_RESTAURANT`. Set these only on a developer machine, never on the
   host.
8. Deploy the same commit to production: the release step against production's database, then start.
9. `npm run smoke -- --url https://<production address>`. It only reads and never signs in, so it is safe against production.
10. On production: sign in, open the menu, open a report. **Do not create a bill in production to test.** Every production bill takes a real GST invoice number that can never be reused.
11. Add a line to `docs/PROJECT-STATE.md`: what was deployed, when, by whom.

**Rolling back:**
Redeploy the previous version.
This only works if the database change in the new version was additive, meaning new fields with defaults and nothing renamed or removed.
Every prompt that changes a schema must say whether its change is additive.
If it is not, the prompt must include its own rollback steps.

---

## 7. First production setup, done once

1. Atlas production cluster ready, section 3.
2. First deploy, section 6.
3. `npm run db:indexes`.
4. `npm run provision:restaurant` with Caffeza's details. The owner's password is prompted for, never typed into a file.
5. The Caffeza setup and menu import from P11, each as a dry run first, read in full, then with `--apply`. See `setup/README.md`.

   ```
   npm run setup:restaurant -- --config setup/zchaat.json --owner-phone <owner phone>
   npm run setup:restaurant -- --config setup/zchaat.json --owner-phone <owner phone> --apply
   npm run import:menu -- --file setup/zchaat-menu.csv --config setup/zchaat.json --owner-phone <owner phone>
   npm run import:menu -- --file setup/zchaat-menu.csv --config setup/zchaat.json --owner-phone <owner phone> --apply
   ```

   Each asks for the owner's password at the terminal. New staff passwords are printed once; hand them over privately. Fill in every `TO CONFIRM` value in `setup/zchaat.json` before the production run.
6. Settings: GSTIN, FSSAI number, receipt header lines, business day start.
7. The owner checks every menu item and price on staging before the same import runs on production.
8. On cutover day only: set the invoice prefix and starting number. See `docs/GO-LIVE.md`.

---

## 8. Backups and the restore drill

Atlas takes the backups, on the schedule of the tier you chose.
As a second line of defence, once a week export the database with `mongodump`, encrypt it, and store it somewhere the business owns, outside the Atlas account.
If the Atlas account is ever lost or locked, that export is the only copy.

**The restore drill.**
Do it once before go-live, then once a month.

1. Restore the latest Atlas backup into the staging cluster.
2. Point staging at it.
3. Open R2 Day Close for the last closed day. Every check must pass, and C12 must confirm the closed day did not change.
4. Write down how long it took, and put the date in `docs/PROJECT-STATE.md`.

A backup nobody has restored is only a hope.

---

## 9. Monitoring

1. An outside uptime monitor calls `/api/v1/health` every minute, and alerts both developers' phones when it fails twice in a row.
2. The host's logs are searched for errors every morning during the first month.
3. Atlas alerts from section 3.
4. Every morning: was yesterday closed? An unclosed day usually means something went wrong at the till.

---

## 10. In the cafe

**Internet.**
The main broadband line, plus a router with a 4G or 5G SIM that takes over on its own when the main line drops.
Test it during setup by unplugging the main line in the middle of a test bill.

**Power.**
A UPS for the router and the cashier computer.
Billing stops if either one loses power.

**Devices.**

| Device | Setup |
|---|---|
| Cashier computer | Chrome, opening the production address, with silent printing |
| Captain phones or tablets | Chrome, with the address added to the home screen |
| Station tablets | Chrome, left on the kitchen screen for their station |

**Silent printing on the cashier computer.**
Set the bill printer as the computer's default printer, with the right paper width.
Start Chrome with the `--kiosk-printing` flag, so a bill prints the moment it is sent, with no dialog.
On Windows, make a desktop shortcut whose target is:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://caffeza.<domain>
```

Staff open Chrome only through that shortcut.
Paper width, 80 mm or 58 mm: `TO CONFIRM` from their printer model.
If stations want paper KOTs, the station tablet gets the same setup with its own printer. P05 covers this.

**The thermal printer.**
On This device, choose the printer's roll: Thermal, 80 mm (a Rugtek RP326, for one) or Thermal, 58 mm. A bill is laid out at the width the print head reaches, 72 mm or 48 mm.

Paper length, also on This device, is "As long as the bill" by default: the page is exactly the bill, so Chrome's preview shows only the bill and the printer cuts after it. If a printer then prints blank paper above the bill, its driver has no paper of that size and centres the page; choose "The printer's roll" instead, and set the driver:

1. Paper size: the roll, for example "80 x 3276 mm" or "58 x 3276 mm", never A4. On Windows, Printers, the printer, Printing preferences; on a Mac, Printers & Scanners and the paper size in Chrome's print dialog.
2. Blank space at the end: compress or skip it, and cut after the document, where the driver offers it.
3. Print density or darkness: raise it if the bill prints light. Thermal paper also prints faint when it is old or kept in heat.

If the right-hand edge of the bill is cut off on paper, first check the driver's paper size is the 80 mm roll, not 58 mm or A4. If it is and the last letters are still cut, choose Edge margin, 2 mm each side, on This device. Bill text size, also there, makes the text smaller or larger without changing the layout.

---

## 11. When something breaks during service

| What staff see | First step | If that does not fix it |
|---|---|---|
| Nothing loads, and other websites do not load either | The router should already have switched to 4G. Restart the router. | A phone hotspot for the cashier computer. Then the paper fallback below. |
| Nothing loads, but other websites work | Call a developer. The uptime alert has probably already fired. | Paper fallback |
| One device keeps getting signed out | Check it is using the https address, and that its date and time are correct | Clear the site's data in Chrome and sign in again |
| The bill does not print | Check the paper and the default printer | Reprint from the bill's page |

**The paper fallback.**
Write orders on a numbered paper KOT pad.
Once the system is back, enter each table's order and bill it.
The bill carries the time it was entered, not the time the food was served, and its business date is still correct as long as it is entered before 5:00 AM.
`TO CONFIRM` this procedure with the owner before go-live.

**Support.**
A card at the counter with both developers' phone numbers, and who to call first on which days.
`TO CONFIRM` who is on call.

---

## 12. Security

1. Two-factor sign-in on the host, Atlas, the domain registrar and GitHub, for everyone.
2. Secrets live only in the host's environment settings. Every environment has its own.
3. If anyone with access leaves, rotate every secret they could have seen.
4. Only Arya and Rishi can deploy.

---

## 13. Deploying with the container

The `Dockerfile` at the repo root is the deploy unit for any host that runs
containers. It holds no secret: every variable comes from the host at run time.

**Build** (from the repo root, at the commit being deployed):

```
docker build -t caffeza:$(git rev-parse --short HEAD) .
```

The build stage runs `npm ci` and `npm run build`. The run stage is Node 20
slim with production dependencies only, the server, the setup files and
`client/dist`, running as the non-root `node` user, started with `npm start`.

**Environment variables to set on the host** (section 4 has the details):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | What the host routes to, default 5000 |
| `MONGO_URI` | The environment's own Atlas cluster |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two different values from `openssl rand -base64 48` |
| `CLIENT_ORIGIN` | Exactly the address people open, for example `https://caffeza-staging.<domain>` |
| `TRUST_PROXY` | Per the host's documentation, usually `1`. Never `true`. |
| `RELEASE_VERSION` | The commit being deployed |
| `INTEGRATION_SECRETS_KEY` | `openssl rand -base64 32`, kept with the other secrets. Required. Losing it means re-entering every partner credential. |
| `PAYMENT_SECRETS_KEY` | `openssl rand -base64 32`, kept with the other secrets. Never change it once restaurants have connected Razorpay. |
| `BCRYPT_ROUNDS`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `LOGIN_RATE_LIMIT_*`, `DISPLAY_TIMEZONE` | As in `.env.example` |

**Release step**, before traffic moves: run `npm run db:indexes` in a one-off
container from the same image with the same variables, for example
`docker run --rm --env-file <host env> caffeza:<commit> npm run db:indexes`.
The image does not run it on start: indexes are never built under live traffic.

**Health check:** the image declares one that calls `GET /api/v1/health` every
30 seconds. Point the host's own health check and the uptime monitor at the
same address.

Run one instance only. The rate limiter keeps its counts in memory.
