# Donation Tracker — Requirements v0.2

_Last updated: 2026-10-11 · Status: v1 live on GitHub Pages with Google Drive sync_

## 1. Problem Statement
I donate frequently (30+ foundations, INR) via multiple channels. I can't quickly answer *"who have I paid, how much, and what's my total this year?"*, recurring pledges live in my head, and receipts are scattered.

## 2. User
Single user (me), on **iPhone and MacBook**. Data synced between both via my Google Drive. No other users.

## 3. Jobs to be Done
| When… | I want to… | So that… |
|---|---|---|
| I've just donated | say it once, or quick-add in <10s | it's captured before I forget |
| I'm deciding to give again | see YTD total vs budget, per foundation, plus its reliability flag | I give intentionally, and to trusted orgs |
| A yearly/monthly pledge is due | see it on a Due list | I don't miss or double-pay |
| I need proof / tax records | find the receipt + 80G details | records exist even if I don't claim (new regime) |

## 4. Success Metrics
- **Capture coverage:** ≥95% of donations logged within 24h (monthly self-check vs bank/UPI)
- **Voice success:** ≥80% of voice entries saved with no manual correction
- **Answer time:** "How much to X this year?" in <5s
- **Running cost:** ₹0/month

## 5. Requirements

### 5.1 Must-have (v1)

**Voice / text entry**
- Mic button uses browser speech-to-text. Fallback: a text box (works with iOS keyboard dictation) fed to the same parser.
- Rule-based parser — designed around these real phrasings:
  - "I donated 500 to Child Help Foundation today"
  - "I donated 1K to Yukta Charitable Trust yesterday"
  - "I donated 8K to Pragathi Charitable Trust on August 5th, 2026 and this is yearly, so create a reminder for me next July end 2027"
- Extracts:
  - **Amount:** 500, 1K, 1.5k, 8K, 1 lakh/1L, ₹5,000, "5000 rupees", "five thousand"
  - **Recipient:** text after "to", fuzzy-matched to existing foundations (e.g. "Pragathi" ≈ "Pragati"); if no match → offer to create new
  - **Date:** today, yesterday, day before yesterday, "on August 5th, 2026", "5 Aug", "last Sunday"; missing year → current year
  - **Recurrence:** monthly / quarterly / yearly / annual / every year
  - **Reminder date:** "reminder … July end 2027" → 31 Jul 2027; "July start" → 1 Jul; explicit dates
- Always shows a **confirmation card** before saving. If any field is missing/ambiguous → opens **Quick-add pre-filled**.

**Quick-add (manual)**
- Foundation (searchable dropdown **with free-text "add new"**), amount, date (default today), payment mode (UPI / Bank / Card / Cash / Cheque), note.

**Foundations**
- Name, category (**Education, Food, Health, Others**)
- **Reliability flag:** Not rated (default, grey) · Reliable (green) · Neutral (amber) · Non-reliable (red)
- **Reliability reason** — optional free text
- **Comments** — optional free text (general notes about the foundation)
- Optional tax fields: PAN, 80G registration no., 80G eligibility (50% / 100% / None)
- Colour chip shown everywhere the foundation appears (dropdown, history, dashboard). Logging to a **Non-reliable** foundation shows a warning on the confirmation card (does not block).

**Donations**
- Fields above + receipt status (Pending / Received / Not applicable), receipt attachment (photo/PDF, compressed images).
- History: search, filter (year, foundation, category, reliability), edit, delete.

**Dashboard (calendar year, Jan–Dec)**
- YTD total, annual budget progress bar, breakdown by foundation & category, monthly trend, year switcher.

**Recurring pledges & reminders**
- Pledge = foundation, amount, cadence, **next due date** (can be set explicitly, e.g. 31 Jul 2027 — not forced to date + 1 cadence).
- In-app **Due / Overdue** list (highlighted on home screen; items appear 14 days before due).
- Logging a donation to that foundation marks the pledge paid and rolls next due date forward by its cadence.

**Sync & backup**
- Works offline (local copy on each device). Syncs to a hidden app-only folder in Google Drive on open, after each save, and on reconnect.
- Record-level merge (per-record `updatedAt`), deletes kept as tombstones.
- Receipts stored as files in the same Drive folder.
- Export: JSON (full restore) and CSV (spreadsheet). Import from JSON.

### 5.2 Nice-to-have (v1.1+)
- Financial-year (Apr–Mar) 80G export
- Per-category budgets
- Optional LLM fallback for voice parsing
- Calendar (.ics) export for pledges
- CSV import of past donations

### 5.3 Out of scope
Other currencies, family members, in-kind donations, bank/UPI statement import, push notifications, native app.

## 6. Data Model (draft)
```
Foundation { id, name, category, reliability: unrated|reliable|neutral|unreliable,
             reliabilityReason?, comments?, pan?, reg80G?, eligibility80G?,
             updatedAt, deleted }
Donation   { id, foundationId, amount, date, mode, note?, receiptStatus,
             receiptFileId?, pledgeId?, source: voice|manual, updatedAt, deleted }
Pledge     { id, foundationId, amount, cadence: monthly|quarterly|yearly,
             nextDueDate, active, updatedAt, deleted }
Settings   { defaultBudget: 120000, budgets: { [year]: amount } }  // per-year override
```

## 7. Tech & Hosting
- React + TypeScript + Vite, PWA (installable on iPhone home screen and Mac), IndexedDB local store, Google Drive API (`drive.appdata` scope) for sync.
- No backend. Hosted free on **GitHub Pages** (account: `chaitanya-gadamsetty`, public repo `donation-tracker`, auto-deploy via GitHub Actions) → `https://chaitanya-gadamsetty.github.io/donation-tracker/`. Code holds no secrets (OAuth client ID is public by design); all data lives in your Drive.
- Folder: `~/Documents/Claude/donation-tracker`

## 8. Risks
| Risk | Mitigation |
|---|---|
| Speech recognition flaky in iPhone home-screen (PWA) mode | Text box + iOS keyboard dictation uses the same parser |
| Google sign-in token expires hourly | Silent refresh; occasional one-tap re-sign-in |
| Speech-to-text mishears foundation names | Fuzzy match + confirmation card |

## 9. Open Questions
1. ~~Hosting choice~~ → GitHub Pages (decided 2026-10-10)
2. ~~Annual giving budget~~ → ₹1,20,000/year, default for every year, editable in-app (decided 2026-10-10)
