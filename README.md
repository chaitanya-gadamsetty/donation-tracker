# Donation Tracker

Personal app for logging charity donations by voice or quick entry, and tracking them against a yearly giving budget. Works on iPhone and Mac as an installable web app (PWA). See [REQUIREMENTS.md](REQUIREMENTS.md) for scope and decisions.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/donation-tracker/
npm test           # parser, pledge, merge and backup tests
npm run build      # production build in dist/
```

## How it works

- **Data** is stored in the browser (IndexedDB via Dexie) on each device and synced through a hidden Google Drive app folder (`drive.appdata` scope only). See `src/sync/`. Zip backups remain available in Settings.
- **Voice entry** uses the browser's speech recognition and a rule-based parser (`src/lib/parser.ts`), with no AI service and no data sent anywhere except the browser's own speech-to-text. Anything unclear opens the quick-add form pre-filled.
- **Every record** has `updatedAt` and a `deleted` tombstone flag, so backups (and later Drive sync) merge record-by-record.

## Layout

| Path | What |
|---|---|
| `src/lib/parser.ts` | Voice/text sentence → amount, foundation, date, recurrence, reminder |
| `src/lib/fuzzy.ts` | Foundation name matching ("Pragathi" ≈ "Pragati") |
| `src/lib/pledges.ts` | Due list and roll-forward rules for recurring pledges |
| `src/lib/backup.ts` | Zip backup / merge restore, CSV export |
| `src/lib/snapshot.ts` | Whole-database snapshot + record-level merge (used by backup and sync) |
| `src/sync/*` | Google sign-in (redirect flow), Drive client, sync pass, React provider |
| `src/db.ts` | Database schema and all writes |
| `src/pages/*` | Home (dashboard), History, Foundations, Pledges, Settings |
