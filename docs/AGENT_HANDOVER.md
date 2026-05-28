# Agent handover — Progress, OSATS matching & sync robustness

**Date:** 2026-05-23  
**User context:** Trainee (ST1 in DB); testing Progress at **ST2** year for forward-looking requirements. Uses **Chrome + extension** for real Kaizen sync. Local dev may use `DEV_BYPASS_AUTH` for Cursor browser testing.

**Companion extension repo:** `../portfolioiq-extension` (sibling folder)

---

## Executive summary

This session focused on:

1. **Progress hub** — year picker (ST1–ST7), correct **band vs year** scoping, priority queue with kind filters (CiPs / OSATS / Courses / Exams).
2. **OSATS counting bugs** — consultant text and procedure names from Kaizen were synced but not counted (e.g. Wong consultant, Romana summatives, basic caesarean 463).
3. **Sync robustness** — extension scrape fixes + Atlas ingest normalization + read-time resolution.
4. **Progress UX** — completed OSATS stay visible in the list; clicking an OSATS shows **matching Kaizen entries** on the right panel.

Most changes are **uncommitted** in both `portfolioiq` and `portfolioiq-extension`.

---

## Architecture: Band vs Year (critical)

| Dimension | Scope | Used for |
|-----------|--------|----------|
| **Curriculum band** (`stage_scope`) | ST1+ST2, ST3–ST5, ST6–ST7 | CiPs, key skills, descriptors, gap report |
| **Training year** (`year`) | Exact ST match | OSATS, courses, exams, ARCP checkpoint expectations |

**Key files:**

- `lib/progress/scope-dimensions.ts` — `curriculumBandScopeForYear()`, `resolveCheckpointStageForProgress()`
- `components/progress/ProgressYearBar.tsx` — ST1–ST7 picker
- `components/progress/ProgressHubClient.tsx` — sets `year` + auto `stage_scope` from band
- `components/progress/ProgressPrioritiesView.tsx` — gap report uses band; requirements use exact year; kind filters
- `app/api/progress/summary/route.ts`, `app/api/progress/cips/route.ts` — `year` param for checkpoint context
- `app/api/gap-report/route.ts` — supports `stage_id` and `stage_scope`

---

## OSATS matching — root cause & fix

### What was wrong

Requirements logic (`lib/requirements/osats-evidence.ts` + `app/api/requirements/route.ts`) only counted entries when:

- `detected_entry_type === "osats_summative"`
- Complete = **≥3 summative** + **≥1 consultant** where consultant = `assessor_role_id === 597` only
- Procedure linked via stored `kaizen_procedure_id` OR numeric `(463)` suffix — **not** procedure name text
- Assessor: numeric role codes only — **not** text like `"Consultant"`

**User’s basic caesarean (463) — before fix:**

| Entry | Issue |
|-------|--------|
| 13 Mar — Doctor sign-off | Counted as summative ✓ |
| 17 Mar — Wong, role `"Consultant"` | Summative ✓, consultant ✗ |
| 19 Mar — Romana, `"Caesarean section (basic)"` no `(463)` | Not linked |

**Extension issues (separate repo):**

- Bulk sync **dropped** `kaizenProcedureId` / `assessorRoleId` in `enrichEntriesWithDetail` even when scrape found them
- Loose digit parser matched **`16`** from `"< 16 weeks"` in SMM procedure name → wrong `kaizen_procedure_id=16`
- Kaizen view pages show labels, not numeric codes

### What we implemented

**Atlas (`lib/requirements/osats-evidence.ts`):**

- `KAIZEN_CONSULTANT_ROLE_ID = 597`
- `inferAssessorRoleFromText` — `"consultant"` in role text → 597
- `inferProcedureIdFromName` — match catalog by normalized procedure name
- `resolveOsatsStorageFields` — prefer field inference; keep stored IDs only if catalog-valid and consistent; **override invalid stored IDs** (e.g. 16 → 452)
- `groupOsatsEntriesByProcedure` — entries grouped for UI display
- `buildOsatsCountsByProcedure` uses `resolveOsatsStorageFields` at read time

**Atlas sync ingest:**

- `app/api/sync/entries/route.ts` — all summative rows normalized via `resolveOsatsStorageFields` (not only nulls)
- `app/api/sync/entry-refresh/route.ts` — same normalization on lightweight refresh

**Extension (`portfolioiq-extension`):**

- `content.js` — `parseKaizenEntityIdFromText` (trailing `(digits)` or pure numeric only); `inferAssessorRoleIdFromText`; `readAssessorRoleFromControl`
- `background.js` — pass `kaizenProcedureId` / `assessorRoleId` through `enrichEntriesWithDetail`

**Tests:** `tests/requirements/osats-evidence.test.ts` (6 tests — Wong/Romana/SMM scenarios)

### Verified on user data (DEV_BYPASS_USER_ID)

User ID: `88303542-98d2-4d1c-a009-72bf362a92bd`

After fix:

- **Basic CS (463):** COMPLETE — 3/3 summative, 1 consultant (Wong)
- **IUCD (451):** COMPLETE
- **SMM (452):** 1/3 (genuine gap, not extraction bug)
- **13 summative OSATS total;** 12 link to catalog procedures; 1 (Bartholin 1171) not in ST requirements catalog

Debug script: `scripts/debug/audit-st2-osats.ts`

---

## Progress Priorities UX changes

**File:** `components/progress/ProgressPrioritiesView.tsx` (new component, wired from Progress hub)

1. **Kind filters:** All / CiPs / OSATS / Courses / Exams
2. **Completed OSATS stay in list** — green **Complete** badge, sorted below open items; hidden when **“Show priorities only”** is on (tone `low` filtered out)
3. **OSATS detail panel** — **“Counting entries”** section lists matched summative entries (title, date, role, Consultant/Summative badge, link to Kaizen `source_url`)

**API:** `app/api/requirements/route.ts` now returns `osats_entries[]` per procedure.

---

## Other bug fixes (earlier in session)

| Issue | Fix |
|-------|-----|
| Empty dashboard in Cursor browser | `DEV_BYPASS_AUTH` + `resolveRequestAuth()` |
| Hydration mismatch | `AppSidebar`, `ThemeProvider`, `GlobalAuditProgressBar` — defer `localStorage` to `useEffect` |
| ActivityHeatmap duplicate key | Local date formatting; keys `${week}-${day}` |
| Progress Priorities crash | `/api/requirements` 401 + defensive parsing when requirements undefined |

---

## Dev bypass (local testing)

**Files:** `lib/auth/request-auth.ts`, `lib/auth/dev-bypass.ts`, `lib/supabase/admin.ts`

**.env.local (example):**

```
DEV_BYPASS_AUTH=true
DEV_BYPASS_USER_ID=88303542-98d2-4d1c-a009-72bf362a92bd
```

Wired into dashboard layout, entries, activity, gap-report, progress APIs, requirements API.

User primarily uses **Chrome + real auth**; bypass useful for Cursor browser / local dev.

---

## Files changed (portfolioiq — notable)

### Core OSATS / requirements

- `lib/requirements/osats-evidence.ts`
- `app/api/requirements/route.ts`
- `app/api/sync/entries/route.ts`
- `app/api/sync/entry-refresh/route.ts`
- `tests/requirements/osats-evidence.test.ts`

### Progress hub

- `components/progress/ProgressPrioritiesView.tsx` *(new)*
- `components/progress/ProgressYearBar.tsx` *(new)*
- `components/progress/ProgressHubClient.tsx`
- `lib/progress/scope-dimensions.ts` *(new)*
- Various progress tab/API files for year + band params

### Auth / dev

- `lib/auth/request-auth.ts` *(new)*
- `lib/supabase/admin.ts` *(new)*
- `lib/auth/dev-bypass.ts`

### Debug (untracked)

- `scripts/debug/audit-st2-osats.ts`
- `scripts/debug/run-key-skill-audit.ts`
- `scripts/debug/list-audit-replaces.ts`

### Extension (sibling repo)

- `content.js` — OSATS extraction helpers
- `background.js` — pass procedure/role IDs in bulk sync

---

## What the user should do

1. **Reload Chrome extension** after extension changes
2. **Full sync from Kaizen** — persists corrected IDs in DB (optional but recommended for SMM `16` → `452`)
3. **Progress → ST2 → OSATS** — verify basic caesarean complete + entry list on right panel

---

## Not done / optional follow-ups

| Item | Notes |
|------|--------|
| **Backfill script** | Re-resolve all summative OSATS in DB without manual re-sync |
| **Requirements page year picker** | Still has separate YEAR/BAND toggles; not aligned with Progress year bar |
| **Count formative OSATS** | User has not asked; policy decision |
| **CI for `tests/requirements/`** | Not yet in `npm run test:ltft` include list |
| **Update `scripts/audit-osats-code-integrity.mjs`** | Still uses old numeric-only logic |
| **Extension Playwright smoke** | Scrape known OSATS edit URL, assert IDs sent |
| **Git commit** | User has not requested; large uncommitted diff |
| **Golden fixtures** | Export anonymised `extracted_fields` from real entries into tests |

---

## Verification commands

```bash
# Unit tests (OSATS matching)
npx tsc --outDir .tmp-tests --module commonjs --target es2022 --moduleResolution node \
  --strict --esModuleInterop --skipLibCheck \
  lib/requirements/osats-evidence.ts tests/requirements/osats-evidence.test.ts
node --test .tmp-tests/tests/requirements/osats-evidence.test.js

# ST2 procedure audit (needs .env.local + service role)
npx tsc --outDir .tmp-tests --module commonjs --target es2022 --moduleResolution node \
  --strict false --esModuleInterop --skipLibCheck \
  lib/requirements/osats-evidence.ts scripts/debug/audit-st2-osats.ts
node .tmp-tests/scripts/debug/audit-st2-osats.js
```

---

## Key code paths (quick reference)

```
ProgressPrioritiesView
  → fetchGapReport(stage_scope)     // CiPs — curriculum band
  → fetchRequirements()             // OSATS/courses/exams — exact selectedYear
  → scopeRequirements(selectedYear)

requirements/route.ts
  → buildOsatsCountsByProcedure(summative entries, catalog, 597)
  → groupOsatsEntriesByProcedure(...) → osats_entries per procedure

osats-evidence.ts
  → resolveOsatsStorageFields (sync + read + counting)
  → inferOsatsProcedureId / inferAssessorRoleId
```

---

## Conversation transcript

Full JSONL:  
`/Users/khalidshamiyah/.cursor/projects/Users-khalidshamiyah-Desktop-Projects-RCOG-Portfolio-portfolioiq/agent-transcripts/64ac781c-073d-44e1-a0c8-83e261b050c8/64ac781c-073d-44e1-a0c8-83e261b050c8.jsonl`

---

## Suggested next task for main agent

User workflow was **ST2 OSATS one-by-one review** after basic CS. Next procedures to review with user:

- Endometrial biopsy (formative-only in portfolio)
- SMM (1/3 summative)
- Instrumental delivery, perineal repair (formative-only)

Or: commit + PR the OSATS/sync/progress changes; add backfill script; wire OSATS tests into CI.
