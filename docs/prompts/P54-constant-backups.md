# P54 Constant backups

> Written as "P44". This repo's P44 was already Rishi's day-end summary, so it is
> P54, at Arya's word ("manage number yourself"). The text below is as given;
> where it says P44 it means this prompt.

# P44 Constant backups

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Repository:** https://github.com/Aryapatel-007/Caffeza
**Depends on:** P43. Written against commit `52631ee`.

---

## 1. What to build, in one sentence

Back up the whole database all the time, at no cost, and keep it for good: a full encrypted copy every 6 hours and an encrypted diary of every change every 5 minutes, with every change ever made kept forever, both uploaded to Backblaze B2 with a key that can add files but never delete them, a restore tool that rebuilds the database as it was at any minute, a weekly practice restore on GitHub that proves the backups work, and a Backups section on the owner's Server card.

## 2. Module

Phase 2 operations, like P30 (keep awake). No restaurant-facing feature. It touches the server, the owner's Server card in Settings, and R1 Today's alerts.

## 3. Why

The live database is on Atlas. On Atlas's free tier, M0, backups cannot be turned on at all ("You can't enable backups on Free clusters", Atlas free cluster limits page). Atlas suggests `mongodump`.
`docs/DEPLOYMENT.md` section 8 asks for backups and a monthly restore drill. Neither exists.
Today, a wrong bulk edit, a bug that corrupts bills, or a locked Atlas account would lose Z Chaat's data for good.
The old Mumbai cluster from the move is not a backup: it stopped updating when the move finished.
The owner does not want a paid plan, so this must cost nothing.

---

## 4. You are a new session. Do this first

1. **Pull first.** If the repository is not on this machine, `git clone https://github.com/Aryapatel-007/Caffeza.git` and work inside it. If it is, `git checkout main` and `git pull`.
2. `git log --oneline -1` must show `52631ee` or later. If not, stop and tell me.
3. `npm ci` at the root.
4. If there is no `.env`, copy `.env.example` to `.env` and **stop and ask me for the values**. Never guess them, and never guess `MONGO_URI`.
5. If there is no `server/.env.test`, copy `server/.env.test.example` to it.
6. Save this entire prompt, exactly as given, to `docs/prompts/P44-constant-backups.md`, and add a P44 row to `docs/prompts/README.md`.
7. Run `npm test` once and record the count.
8. Add this progress table under a P44 entry in `docs/PROJECT-STATE.md`, and tick each part as it is committed, so a later session can carry on:

```
P44 progress
- [ ] A Spec
- [ ] B Encrypted files and the storage client
- [ ] C Full copies
- [ ] D The change diary
- [ ] E Restore and verify tools
- [ ] F The weekly practice restore
- [ ] G The owner's view and alerts
- [ ] H Runbook
- [ ] I Full check
- [ ] J Switched on in production (needs Arya)
```

## 5. Files to read first

1. `CLAUDE.md`, and `docs/DEPLOYMENT.md` sections 8, 14 and 15.
2. `server/config/env.js`, `.env.example`, `render.yaml`.
3. `server/server.js`: how the server starts, and where `services/integrations/jobRunner.js` and `serverStartService.js` are started.
4. `server/models/index.js`: `ALL_MODELS` and `SERVER_MODELS`. `server/models/ServerStart.js` as the pattern for a collection with no `restaurantId`.
5. `server/utils/secretBox.js`: how secrets are already encrypted with AES-256-GCM.
6. `server/scripts/copyDatabase.js`: it already reads every collection and copies documents with their own `_id`.
7. `server/scripts/buildIndexes.js` (`npm run db:indexes`).
8. `server/services/dayFiguresService.js` and `dayCloseService.js`, for the C12 check the practice restore runs.
9. `server/controllers/` and `routes/` for `GET /api/v1/system/starts`, and `client/src/features/settings/ServerCard.jsx`.
10. `server/services/reports/definitions/today.js`, the `alerts` section.
11. `.github/workflows/keep-awake.yml`, as the pattern for a scheduled workflow.
12. `docs/RECONCILIATION-RULES.md`, C12.

---

## 6. Non-negotiable rules that apply, quoted

"Every database record has a `restaurantId`. Every query filters by it. No exceptions." The two new collections are about the server, not a restaurant, exactly like `serverstarts`, and join `SERVER_MODELS` with a comment saying why.
"Check permissions on the server for every endpoint. Hiding a button in React is not security." The new endpoint is OWNER only.
"Never hard delete a bill, order, or stock entry." Nothing here deletes anything in the live database. The restore tool only ever writes into an empty database that is not the live one.
"Bill numbers are generated on the server, are sequential, and are never reused." A restore must bring back `counters` exactly, and the practice restore checks the invoice series has no gaps.
"Secrets live in `.env`. `.env` is in `.gitignore`. Never commit a real secret." The repository is public. No key, no bucket secret, no backup file, ever goes into git.
"Store timestamps in UTC. Convert to India time only for display."
"Schema changes are additive."
"Never create a bill in production to test something."

---

## 7. Part A. Spec first

Before any code, commit `spec constant backups`:
1. DB-SCHEMA: a new section for `backupruns` and `backupstate` (section 7a below), both with no `restaurantId` and why.
2. API-CONTRACT: `GET /api/v1/system/backups` (section 10), beside `GET /api/v1/system/starts`.
3. GLOSSARY: a short "Backup words" section: Backup, Full copy, Change diary, Restore, Practice restore, Backed up (time ago). Plain meanings, like section 21.
4. `.env.example`: the new variables in section 7b, with fake values.

### 7a. Two new collections

**`backupruns`**, one document per attempt, kept 90 days by a TTL index on `startedAt`.

| Field | Type | Notes |
|---|---|---|
| `kind` | String | `SNAPSHOT` or `JOURNAL` |
| `status` | String | `RUNNING`, `OK` or `FAILED` |
| `startedAt`, `finishedAt` | Date | UTC |
| `objectKey` | String | Where the file went in the bucket, for example `snapshots/daily/2026/10/14/2026-10-14T00-00-00Z.snap.gz.enc` |
| `bytes` | Number | Size of the uploaded file |
| `sha256` | String | Of the uploaded, encrypted file |
| `fromClusterTime`, `toClusterTime` | Timestamp | A snapshot's start time, or the first and last change in a diary file |
| `eventCount` | Number | Diary files only |
| `collections` | Array | Snapshots only: `{ name, count }` for every collection |
| `databaseBytes` | Number | Snapshots only: data plus index size from `dbStats` |
| `error` | String | Plain words, never a secret, never a document |

**`backupstate`**, one document, `_id: 'journal'`: `resumeToken`, `lastFlushAt`, `lastEventClusterTime`, `gapSince` (null unless the diary lost its place, see Part D).

Both are left out of the change diary itself, so the diary does not record its own writing.

### 7b. Environment variables

| Variable | Meaning |
|---|---|
| `BACKUP_ENABLED` | `on` or `off`. Default `off`. Always off under `NODE_ENV=test`, where tests call the functions directly. |
| `BACKUP_ENCRYPTION_KEY` | 32 random bytes, base64. Required when backups are on. Refused if it is the `.env.example` placeholder. |
| `BACKUP_OLD_KEYS` | Optional. Retired keys, comma-separated, used only to read old files during a restore. Empty until a key is ever changed. |
| `BACKUP_S3_ENDPOINT` | For B2, like `https://s3.us-west-004.backblazeb2.com` |
| `BACKUP_S3_REGION` | For B2, the region in the endpoint, like `us-west-004` |
| `BACKUP_S3_BUCKET` | The bucket name |
| `BACKUP_S3_KEY_ID`, `BACKUP_S3_SECRET` | The **server key**: write files only, this bucket only |

The server refuses to start in production with `BACKUP_ENABLED=on` and any of these missing, with a message naming which, following the existing `env.js` style.
Add them to `render.yaml` with `sync: false`, so they are typed into Render by hand and never in a file.
Add `npm run backup:key`, which prints a new random key once, for Arya to save.

---

## 8. Part B. Encrypted files and the storage client

1. `server/services/backup/crypto.js`: streaming AES-256-GCM with `node:crypto`. A file is a short header (format version, key id, random 12-byte IV), then the ciphertext, then the 16-byte tag. Decrypting fails loudly on a wrong key or any changed byte. The key id is the first 8 hex characters of the SHA-256 of the key, so a restore can say "this file was made with a different key" instead of a vague error.
2. `server/services/backup/storage.js`: upload a stream to the bucket through the S3 API (`@aws-sdk/client-s3`, plus `@aws-sdk/lib-storage` for multipart if needed; check the current package names and versions on npm first). Upload only, with the server key. List and download live in a separate `readStorage.js`, used only by the restore and practice restore tools, with the drill key. The running server never imports `readStorage.js`. Add a test that fails if it does.
3. The bucket has Object Lock on with a default retention, so B2 may insist on an integrity checksum with each upload, and newer AWS SDK versions send checksum headers that some S3-compatible services do not accept. Read Backblaze's current S3-compatible API notes for the AWS SDK for JavaScript v3, set the client's checksum options the way they say, and prove it with one real upload in Part J, not only against the fake.
4. Never buffer a whole snapshot in memory. Render's free instance has 512 MB, and it is also serving the restaurant. Stream from the database, through gzip, through encryption, into the upload.
5. Every upload records its SHA-256 and byte count in `backupruns`.

Tests use a fake S3 server or an injected fake client, in the style of `tests/helpers/fakeRazorpay.js`. No test ever reaches a real bucket.

Commit: `add encrypted backup files and the storage client`.

---

## 9. Part C. Full copies

`server/services/backup/snapshotService.js`:

1. Read the cluster time first (`operationTime` from a `ping` or `hello`), and store it as `fromClusterTime`.
2. For every collection in the database except `refreshtokens`, `backupruns` and `backupstate`, stream every document as one line of canonical Extended JSON (EJSON), so ObjectIds, Dates, Decimals and Timestamps come back exactly. Leave out `refreshtokens` on purpose: after a restore everyone signs in again, and old sessions must never come back.
3. End the file with a manifest line: every collection's name and count, `fromClusterTime`, the app's release, and the format version.
4. gzip, encrypt, upload, into one of three folders:
   1. The 5:30 AM copy on the 1st of each month (India time) goes to `snapshots/monthly/YYYY/MM/<UTC time>.snap.gz.enc`. **Kept forever.**
   2. Every other 5:30 AM copy goes to `snapshots/daily/YYYY/MM/DD/<UTC time>.snap.gz.enc`. Kept 90 days.
   3. Every other copy, including one taken at start or after a gap, goes to `snapshots/6h/YYYY/MM/DD/<UTC time>.snap.gz.enc`. Kept 10 days.
   The bucket's own rules remove old files (Part H); the server never deletes anything.

**Nothing is ever lost by this.** The change diary (Part D) is kept forever, and so are the monthly copies. Any moment since backups began can be rebuilt: the monthly copy before it, plus the diary up to that minute. The daily and 6-hour copies are only shortcuts that make a recent restore faster; every one of them is the whole database again, so keeping them all forever would store the same data thousands of times without saving anything more.
5. Record the run in `backupruns`, with `databaseBytes` from `dbStats` (data plus indexes).

When:
1. Every 6 hours, at 5:30 AM, 11:30 AM, 5:30 PM and 11:30 PM India time. The 5:30 AM one comes just after a business day ends, and is the daily keeper.
2. Once at start, if the last successful snapshot is older than 6 hours or there is none.
3. Immediately when the diary loses its place (Part D).

Only one snapshot at a time: claim it with a status-filtered write on a `RUNNING` row, the way the job runner claims jobs. A `RUNNING` row older than 30 minutes is marked `FAILED` with "Interrupted" and the next one may run.

Mind Atlas M0's limits: 100 operations a second, and 10 GB of data read out per rolling week, shared with every screen the restaurant uses. Over that, Atlas slows the database down for everyone. So:
1. Read in batches of 500.
2. **Slow down by itself when the database grows.** Before each scheduled copy, work out the week's reading: the last `databaseBytes` times the copies a week. If that passes 4 GB, take only the daily 5:30 AM copy and skip the other three. Go back to every 6 hours when it falls under 3 GB. The change diary keeps running every 5 minutes either way, so nothing is less safe, only the restore replays a longer diary. Record each switch in `backupruns` with a plain `error`-style note, and show it on the card (Part G).

Commit: `add full copies every 6 hours`.

---

## 10. Part D. The change diary

`server/services/backup/journalService.js`:

1. Watch the whole database with a change stream, `fullDocument: 'updateLookup'`. Leave out `refreshtokens`, `backupruns` and `backupstate`. On M0, filter by collection name; a database-name filter there may use only strings or regular expressions.
2. Keep each event as one EJSON line: `op` (insert, update, replace, delete), `coll`, `_id`, `doc` (the full document, or null for a delete), `clusterTime`, `wallTime`, and the transaction's `lsid` and `txnNumber` when present.
3. Every 5 minutes, and sooner whenever 5,000 events or 5 MB are waiting, gzip, encrypt and upload the waiting events to `journal/YYYY/MM/DD/<first UTC time>_<last UTC time>.jrn.gz.enc`. Only after the upload succeeds, save the last event's resume token in `backupstate`. A crash before that means the same events are uploaded again next time, which is safe, because replaying is idempotent (Part E).
4. Five minutes with no changes uploads nothing. A quiet night costs nothing.
5. On start, resume from the saved token.
6. **Losing its place.** If the token cannot be resumed (the oplog has moved on, or there is no token), set `gapSince` to the last known change time, take a full copy at once, then start watching from now and clear `gapSince` once that copy is `OK`. Record the gap in `backupruns` as a `FAILED` journal run with the words "The change diary lost its place between X and Y; a full copy was taken". A gap is never silent.
7. A flush that fails is retried after 30 seconds, 2 minutes and 10 minutes, keeping the events in memory, up to **20 MB** of waiting events, measured in bytes, not counted in events. Render's free instance has 512 MB and is serving the restaurant at the same time, so the diary must never grow past that. Past 20 MB, stop watching, drop the waiting events, set `gapSince`, and let item 6 recover with a full copy once storage works again.
8. Never split a transaction across two diary files: all events with the same `lsid` and `txnNumber` go in the same file.

Commit: `add the change diary every 5 minutes`.

---

## 11. Part E. Restore and verify tools

Scripts, run by a developer, never by the server:

**`npm run backup:list`** with the drill key: snapshots and diary files in the bucket, newest first, with times in India time, sizes, and any gap.

**`npm run backup:restore -- --at "2026-10-14 15:30" --to <TARGET_MONGO_URI>`** (India time in `--at`; `--at latest` for the newest moment backed up):
1. Picks the newest snapshot that started before `--at`.
2. Restores it into the target, every document with its own `_id`.
3. Replays the diary from the snapshot's `fromClusterTime` up to `--at`, in cluster time order: insert, update and replace become `replaceOne` with `upsert: true` using the full document; delete becomes `deleteOne`. Overlap with the snapshot is harmless because each step is idempotent.
4. Stops at a whole transaction: if `--at` falls inside one, the whole transaction is left out, and the tool says so.
5. Refuses when a `gapSince` window from `backupruns` covers the time asked, and names the nearest times it can restore to.
6. Runs the index build from `npm run db:indexes` against the target.
7. Prints the counts per collection, the time it restored to, and how long it took.

Safety, each a refusal with a plain message:
1. The target must be empty. Refuses if any collection has a document.
2. The target must not be the live database: refuses if its host and database match `MONGO_URI`'s.
3. Refuses without `--to`. There is no default target.
4. Unknown arguments are refused, not ignored.

**`npm run backup:verify -- --uri <URI>`**, used by the restore and the practice restore, against a restored database:
1. Every collection's count matches the snapshot manifest, adjusted by the diary's inserts and deletes.
2. The invoice series has no gaps: for every restaurant and series, bill numbers run without a missing number, voided ones included, and `counters` is at or above the highest number used.
3. C12 for the last 7 closed days: each Day Close snapshot equals today's figures for that day, through `dayCloseService`, exactly as Day Close checks it.
4. Prints a short report and exits non-zero on any failure.

Commit: `add the restore, list and verify tools`.

---

## 12. Part F. The weekly practice restore

`.github/workflows/backup-drill.yml`:

1. On a schedule, Sunday 6:00 AM India time (Sunday 00:30 UTC, `30 0 * * 0`), and by hand with `workflow_dispatch`. **Never** on `pull_request` or `push`, so the secrets are never handed to code from a fork.
2. Secrets: `BACKUP_DRILL_KEY_ID`, `BACKUP_DRILL_SECRET` (the drill key: list and read files only), `BACKUP_ENCRYPTION_KEY`, and the bucket, endpoint and region as variables.
3. One job: `npm ci`, then `npm run backup:drill`, which starts an in-memory MongoDB (`mongodb-memory-server`, as the tests use), runs `backup:restore --at latest` into it, then `backup:verify`.
4. A failure fails the run, so GitHub emails the repository owner.
5. A comment at the top says, in plain words, what each secret is, that the drill key can only read, and that GitHub turns off scheduled workflows in a public repository after 60 days with no commits.

`permissions: {}` at the top, like `keep-awake.yml`.

Commit: `add the weekly practice restore`.

---

## 13. Part G. The owner's view and alerts

### G1. `GET /api/v1/system/backups`

Roles: OWNER only. 403 for every other role.
Query: none.
Response:

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "lastSnapshot": { "at": "2026-10-14T06:00:12Z", "status": "OK", "bytes": 1840221 },
    "lastJournalFlush": { "at": "2026-10-14T09:55:03Z", "eventCount": 214 },
    "behindSeconds": 41,
    "gapSince": null,
    "failuresLast7Days": 0,
    "database": { "bytes": 18874368, "limitBytes": 536870912 },
    "fullCopies": "EVERY_6_HOURS",
    "storage": { "estimatedBytes": 126877696, "freeBytes": 10000000000 },
    "state": "OK"
  }
}
```

`state` is `OK`, `LATE` (no diary flush in 15 minutes while changes are waiting, or no snapshot in 7 hours, or 25 hours when `fullCopies` is `DAILY`), `FAILING` (the last run of either kind failed, or `gapSince` is set), or `OFF` (backups not enabled).
`limitBytes` is 512 MB, the M0 limit, from a named constant with a comment saying it changes if the cluster tier changes.
`fullCopies` is `EVERY_6_HOURS` or `DAILY`, from the slow-down rule in Part C.
`storage.estimatedBytes` is an estimate, because the server key cannot list the bucket: the sum of `bytes` of `OK` runs still inside each folder's keep time from Part H (11 days for `snapshots/6h/`, 91 for `snapshots/daily/`, and forever for `snapshots/monthly/` and `journal/`). `freeBytes` is Backblaze's free 10 GB, a named constant.
It reads one server-level collection, like `/system/starts`, and returns nothing about any restaurant.

### G2. The Server card

Add a Backups part to `ServerCard.jsx`, from that endpoint:
1. `OK`: "Backed up 3 minutes ago. Full copy at 11:30 AM. Database uses 18 MB of 512 MB."
2. `LATE` or `FAILING`: the same card in the alert state, with one plain sentence on what is wrong, and "See docs/DEPLOYMENT.md section 8".
3. `OFF`: "Backups are switched off."
4. Database at 70% of the limit or more: "The database is getting full: 370 MB of 512 MB. Plan a bigger Atlas tier or an archive before it reaches 512 MB."
5. Always, in small text: "Backup storage: about 121 MB of 10 GB free. At this rate, the free 10 GB lasts about N years." Work out N from the last 30 days of uploads. At 7 GB or more, in the alert state: "Backup storage is nearly full. See DEPLOYMENT.md section 8." The runbook says what to do then: Backblaze's price beyond 10 GB, which is very small for this much data, or keep fewer daily copies. Never shorten the diary or the monthly copies.
6. When `fullCopies` is `DAILY`: "Full copies once a day, to stay inside Atlas's free limits. Every change is still saved every 5 minutes."

Use `Money`-style shared formatting for sizes if one exists; otherwise add one small `formatBytes` helper beside `formatDate.js`. Words from the GLOSSARY section added in Part A.

### G3. Today's alert

When `state` is `LATE` or `FAILING`, R1 Today's alerts gain one line for the OWNER only, kind Backup: "Backups have stopped since 9:55 AM." with a link to Settings. Nothing for other roles. The figures and checks of R1 do not change.

### G4. Tests

1. The endpoint refuses every role but OWNER.
2. `state` is worked out right from made-up `backupruns` rows, for each of the four states.
3. The Today alert appears for the owner only, and only when `LATE` or `FAILING`.

Commit: `show backups on the server card and alert when they stop`.

---

## 14. Part H. Runbook

Rewrite `docs/DEPLOYMENT.md` section 8, "Backups and the restore drill", for what now exists:

1. **What is backed up, and for how long**: every collection but sessions. The change diary every 5 minutes, kept forever. A full copy on the 1st of each month, kept forever. Daily full copies kept 90 days and 6-hour ones 10 days, only to make recent restores faster. At most about 5 minutes lost, and any moment since backups began can be rebuilt.
2. **Backblaze, once**, step by step: sign up with no card; create a **private** bucket with **Object Lock enabled** (it can only be turned on when the bucket is created) and a default retention of **Governance, 10 days**; the **server key**: this bucket only, Type of Access "Write Only"; the **drill key**: this bucket only, "Read Only"; **lifecycle rules**, two custom rules and no others: prefix `snapshots/6h/`, hide after 10 days, delete 1 day after hiding; prefix `snapshots/daily/`, hide after 90 days, delete 1 day after hiding. **No rule** for `snapshots/monthly/` or `journal/`: a file with no rule is kept forever. Warn plainly never to add a rule for those two, and never a rule with an empty prefix, which would cover the whole bucket. Say why: the server key cannot delete, and Object Lock stops anyone, even with a stolen key, from deleting a backup in its first 10 days, which is longer than the weekly practice restore that would notice. No card on the account means Backblaze has nothing to charge.
3. **The limits, in a table**: Backblaze's free 10 GB (what fills it and the card's warning), Atlas M0's 10 GB read a week and 100 operations a second (the slow-down rule), Atlas M0's 512 MB (the card's warning), Render's 512 MB of memory (the 20 MB diary cap).
4. **The encryption key**: `npm run backup:key`, then save it in Render's environment **and** in a password manager. If it is lost, every backup is unreadable. If it ever leaks, make a new one and take a full copy at once. **Keep every old key for good**, with the date it was retired, because the diary and monthly copies made with it are kept forever. The key id in each file's header (Part B) tells the restore tool which key a file needs; `BACKUP_ENCRYPTION_KEY` holds the current key and an optional `BACKUP_OLD_KEYS` (comma-separated) holds retired ones, for restoring only.
5. **Render**: the variables from section 7b, then `BACKUP_ENABLED=on`, Save and deploy.
6. **GitHub**: the drill secrets and variables, then run the practice restore by hand once from the Actions tab.
7. **Restoring for real**, step by step: make a new empty cluster (on the free tier, one per Atlas project, so it may need a new project); allow it in Network Access; `backup:restore --at <time> --to <new URI>`; `backup:verify`; change `MONGO_URI` on Render; check `/api/v1/health`; open a closed day's report. Say plainly: never restore into the live database.
8. **The 512 MB limit** of M0 and what the card's warning means.
9. **What this does not cover**: a mistake inside the 5 minutes before the last diary flush; a lost encryption key.

Also update `docs/GO-LIVE-READINESS.md`, if it lists backups, with which steps are done.

Commit: `write the backup runbook`.

---

## 15. Part I. Full check

1. `npm test`, the whole suite. Every test that passed before must still pass. Record the counts before and after.
2. `npm run lint` and `npm run build`.
3. New tests, in `server/tests/backup*.test.js`, on the in-memory replica set:
   1. A full copy of the golden day, restored into an empty database, gives identical documents in every collection but `refreshtokens`, `_id`s, Dates and Timestamps included.
   2. After that restore, `computeDayFigures` for 26 September gives exactly the same figures as the original, and C12 passes.
   3. The diary: insert, update and delete a few documents, flush, then restore to a time between two of the changes: the state matches that moment exactly.
   4. A transaction's events land in one diary file, and a restore time inside a transaction leaves the whole transaction out.
   5. Replaying the same diary file twice gives the same result as once.
   6. A wrong key fails with "made with a different key". One changed byte fails. Nothing is written to the target in either case.
   7. The restore refuses a non-empty target, the live database, a missing `--to`, an unknown argument, and a time inside a gap.
   8. The slow-down rule: with a made-up `databaseBytes` large enough to pass 4 GB a week, only the 5:30 AM copy runs, and it goes back to every 6 hours under 3 GB.
   9. The diary's memory cap: with storage failing, waiting events stop at 20 MB, the diary sets `gapSince`, and nothing grows past the cap.
   10. `storage.estimatedBytes` counts only runs still inside each folder's keep time, and counts every monthly copy and diary file forever.
   11. The 5:30 AM copy on the 1st of the month goes to `snapshots/monthly/`, other 5:30 AM copies to `snapshots/daily/`, the rest to `snapshots/6h/`.
   12. A restore to a time 6 months back works from a monthly copy plus the diary alone, with no daily or 6-hour copy in the bucket.
   13. A file made with a retired key restores when that key is in `BACKUP_OLD_KEYS`, and fails with "made with a different key" when it is not.
   14. A resume token that cannot be resumed sets `gapSince`, starts a full copy, and records the gap in `backupruns`.
   15. A failed upload is retried, and the events are not lost.
   16. A second snapshot cannot start while one is `RUNNING`; a `RUNNING` row older than 30 minutes becomes `FAILED`.
   17. `backup:verify` fails when a bill number is missing from a series, and when a collection's count is off by one, each broken on purpose.
   18. The running server never imports `readStorage.js`.
   19. `env.js` refuses production with backups on and a variable missing, and refuses the placeholder key.
   20. No file under `server/` or `.github/` contains anything that looks like a real key: extend the existing secret guard if there is one.
4. By hand, locally: `BACKUP_ENABLED=on` against a local fake S3 or a scratch bucket, never the live database. Make an order and a bill on the local server, wait for a diary flush, restore to a minute before the bill into a fresh in-memory database, and see the bill is not there; restore to `latest` and see it is.
5. `npm run e2e` still passes.

---

## 16. Part J. Switching it on in production

Only after Part I passes and `main` is pushed.

1. **Stop and ask me** whether the Backblaze bucket, the two keys, the lifecycle rules and the encryption key are ready. Do not create any account or key yourself, and never ask me to paste a secret into this chat: I type them into Render and GitHub myself.
2. When I say they are in Render, check after the deploy: `GET /api/v1/system/backups` as the owner shows a first full copy `OK` within a few minutes, and a diary flush within 5 minutes of the next change.
3. When I say the GitHub secrets are in, I run the practice restore from the Actions tab and tell you the result.
4. Record each in `docs/PROJECT-STATE.md`.

If I am not there to answer, stop at step 1, and say clearly in the summary what is waiting for me.

---

## 17. Out of scope

1. Paying for any Atlas tier or storage.
2. Restoring one restaurant on its own. The restore is the whole database. A per-restaurant export is a later prompt.
3. Restoring from the app's screens. Restoring is a developer task with a runbook, on purpose.
4. Backing up anything outside the database: the code is in git, and photos and logos are already inside the database.
5. Changing the old Mumbai cluster. Leave it as it is.
6. Downloading backups from the server. The server key cannot read, on purpose.

## 18. How to know it is finished

1. The spec commit comes before any code.
2. Every test in Part I passes, and the whole suite passes, with counts before and after.
3. The check by hand in Part I item 4 is done.
4. `docs/DEPLOYMENT.md` section 8 is rewritten.
5. Part J is done, or stopped at step 1 with what is waiting for me listed.
6. `docs/PROJECT-STATE.md`: the date line, the P44 entry with its progress table, and decision log rows, dated today:
   "The database is backed up by the server itself: an encrypted full copy every 6 hours and an encrypted diary of every change every 5 minutes, to Backblaze B2. | Atlas's free tier has no backups, and the owner does not want a paid plan. The diary lets the data be rebuilt as it was at any minute, which a nightly copy alone cannot."
   "Every change ever made, and one full copy a month, are kept forever; daily copies 90 days and 6-hour copies 10 days. | Arya asked to keep everything. The diary and the monthly copies together can rebuild any moment, and the data is compressed text, so years fit in the free 10 GB. Keeping every full copy forever would store the same data again four times a day and add nothing."
   "The server's storage key can write but never delete; old files are removed by the bucket's own lifecycle rules. | Stolen server settings must not be enough to wipe the backups."
   "Sessions (`refreshtokens`) are never backed up. | After a restore everyone signs in again; old sessions must never come back to life."
   "A practice restore runs every Sunday on GitHub and checks counts, the invoice series and C12. | A backup nobody has restored is only a hope."
7. `docs/prompts/README.md`: P44 marked Done, or "Done, waiting for Arya to switch on" if Part J is waiting.
8. Push `main`.
9. Print a short summary: commits, test counts before and after, what you checked by hand, and the exact steps left for me in Backblaze, Render and GitHub.
