# Course matching & ahead-of-stage false positive — agent handover

**Date:** 2026-05-30  
**Extension version:** `0.3.30` (`portfolioiq-extension/manifest.json`)  
**Status:** **UNRESOLVED** — user still sees `Obstetric simulation course (ROBUST or equivalent) · Due ST3` under **Ahead of stage** after scan, despite fixes through v0.3.30.  
**User:** ST1 trainee (Dr Khalid Shamiyah). Real gap is CiP 11 only; courses should be 3/3.

---

## Repos

| Repo | Path | Role |
|------|------|------|
| **App** | `portfolioiq/` | Next.js dashboard, API routes, tests |
| **Extension** | `portfolioiq-extension/` | Atlas Chrome extension — smart scan, scoring, scan report HTML |

Tests live in **app repo**: `portfolioiq/tests/requirements/course-evidence.test.js`  
Extension logic lives in **extension repo**: `portfolioiq-extension/readiness/course-evidence.js`

---

## Original problem (conversation arc)

1. **CiP assessments 0/14 vs 14/14** — fixed v0.3.22–v0.3.24 (`resolveCipAssessmentTrainingYear`, CiP discovery). User now sees **13/14** (CiP 11 genuinely missing). ✅
2. **CBD pages visited during scan** — fixed v0.3.23 (`scrapeCipAssessmentLinks` / `isCipAssessmentListEntry`). ✅
3. **Ahead-of-stage false positives for courses:**
   - **Leadership (ST6/ST7)** from loose `"leadership"` keyword — fixed by course-type filter + variant matching. ✅ (no longer appears)
   - **ROBUST (ST3)** while user only has **PROMPT** log — **still appears** ❌
4. **Smart scan courses filter** — replaced broad `other_evidence` pass with grade-scoped **Courses** (`ST1 + Other evidence + Type: Courses / 1044`). ✅

---

## User’s PROMPT log (ground truth)

- **URL:** https://training.rcog.org.uk/log-entry/979919  
- **List title:** `PROMPT`  
- **Type:** Other evidence → Evidence type: **Courses**  
- **Event date:** 2025-08-08  
- **Description:** PROMPT (Practical Obstetric Multi-Professional Training) — no ROBUST in title  
- **Expected:** Counts toward ST1 `Obstetric simulation course (e.g. PROMPT/ALSO/other)` only  
- **Must NOT:** Appear as ahead-of-stage **ROBUST (ST3)**

User scan report (v0.3.29 / v0.3.30) shows:

- **Courses 3/3** — PROMPT correctly counted for ST1 requirement ✅  
- **Ahead of stage 3 items:** Caesarean OSATS (ST2) ✅ legitimate, **ROBUST (ST3)** ❌, key skills pace ✅  
- Footer: `45 entries · smart scan · 4 targeted filters · 27 enriched`

---

## Curriculum conflict (core design issue)

Two **variant** courses share the “obstetric simulation” family:

| Catalog row | Due stage | Variant |
|-------------|-----------|---------|
| `Obstetric simulation course (e.g. PROMPT/ALSO/other)` | ST1 | `prompt` |
| `Obstetric simulation course (ROBUST or equivalent)` | ST3 | `robust` |

Also repeated names at different stages: **SITM** (ST5/ST6/ST7), **Leadership** (ST6/ST7).

Metadata is in `portfolioiq-extension/readiness/curriculum-bundle.js` (`family`, `variant` fields on `COURSES`).

---

## Architecture: two pipelines (why grade filter ≠ matching)

```
Smart scan (grade-scoped)          Scoring (curriculum)
─────────────────────────          ────────────────────
Kaizen /search                     Static COURSES catalog
  f[0]=Grade ST1                     ├─ Requirements: stages ≤ current
  f[1]=Other evidence                └─ Ahead-of-stage: stages > current
  f[2]=Type Courses (1044)
        │
        ▼
  List rows: PROMPT, CTG, Basic practical
  (usually NOT detail-enriched)
```

- **Grade filter** limits **which log entries are scraped**, not which catalog rows they may match.
- **Requirement counting** (`3/3`) uses `relevantCourses` filtered to stages ≤ ST1 — ROBUST is excluded from the denominator.
- **Ahead-of-stage** iterates **all** `COURSES` with `required_by_stage > ST1` and asks whether any evidence counts as early completion.

**Important:** Course logs are **not** in `buildSmartDetailCandidates()` — only summative OSATS and CiP assessments get detail enrichment (`scan.js`). Course entries typically have **list fields only** (`name`, `category`, `year`, `_scanFilter: "courses"`) unless something else merges data in.

---

## What we implemented (v0.3.25 → v0.3.30)

### v0.3.25 — Course evidence module + smart scan filter

- **New:** `portfolioiq-extension/readiness/course-evidence.js`
- Smart scan filter `other_evidence` → **`courses`** (`resolveCoursesFilterUrl` stacks grade + other evidence + type 1044)
- Replaced loose `courseMatched()` / `looksCourseRelatedEntry` with `courseMatchedByEntries`, `collectCourseEvidenceEntries`
- Tests: `tests/requirements/course-evidence.test.js`, updated `smart-search-scrape.test.js`

### v0.3.26 — Variant alignment (ROBUST false positive attempt #1)

- `obstetricSimulationVariantsAlign()` — PROMPT vs ROBUST mutual exclusion when entry contains “obstetric simulation” text
- **Regression:** entries titled only `"PROMPT"` failed ST1 matching (variant logic required full “obstetric simulation” phrase)

### v0.3.27 — Conflict-only rejection

- Variant logic changed to **reject clear conflicts only** (PROMPT title must not satisfy ROBUST), not require full phrase in entry
- PROMPT `3/3` restored ✅

### v0.3.28 — Stricter ROBUST token matching

- ROBUST matching requires `\brobust\b` in **entry identity** (title), not description/haystack
- `courseMatchedForAheadOfStage()` for ahead-of-stage
- Tighter `isCourseEvidenceEntry()` (exclude non–other_evidence detected types; drop loose JSON `"courses"` substring)

### v0.3.29 — Assignment system (Pass 1)

- **`assignCourseEntries()`** — each log assigned to at most one catalog row (greedy by score)
- **`isCourseRequirementMet()`** / **`isCourseAheadOfStage()`** — requirements and ahead-of-stage use assignments
- Course **families** in `curriculum-bundle.js`
- `compute-readiness.js` uses assignments for `coursesComplete`, `buildCourseBreakdown`, `buildAheadOfStageItems`
- App API: `app/api/arcp-readiness/route.ts` updated similarly

### v0.3.30 — Training year inference (attempt #2 on ROBUST)

- **Bug identified:** `canEntrySatisfyCourse()` treated **missing training year** as “can match any stage” (`if (!entryYear) return true`)
- **Fix:** `resolveEntryTrainingYear()` — if `_scanFilter === "courses"` and scan is grade-scoped, infer `currentStage` (ST1)
- Without year, only allow catalog rows with `required_by_stage <= currentStage` unless title explicitly names the course
- `assignCourseEntries(..., { currentStage })` threaded from `computeReadiness`
- `isCourseAheadOfStage()` for ROBUST: requires `\brobust\b` in identity regardless

---

## Key files

| File | Purpose |
|------|---------|
| `portfolioiq-extension/readiness/course-evidence.js` | Matching, assignment, ahead-of-stage gates |
| `portfolioiq-extension/readiness/compute-readiness.js` | `computeReadiness`, `buildAheadOfStageItems`, course scoring |
| `portfolioiq-extension/readiness/curriculum-bundle.js` | `COURSES` with `family` / `variant` |
| `portfolioiq-extension/readiness/smart-search-scrape.js` | `courses` filter, `resolveCoursesFilterUrl` |
| `portfolioiq-extension/scan.js` | Scan orchestration; courses **not** enriched |
| `portfolioiq-extension/content.js` | `scrapeSearchListPage` → entry shape (`name`, `year`, …) |
| `portfolioiq-extension/scan-results.js` | Renders `r.ahead_of_stage.items` (no recompute) |
| `app/api/arcp-readiness/route.ts` | Dashboard readiness (assignment, no ahead-of-stage UI) |
| `tests/requirements/course-evidence.test.js` | **40 tests pass** including assignment + ahead-of-stage |

---

## Current matching flow (v0.3.30)

```javascript
// computeReadiness (compute-readiness.js)
courseEvidenceEntries = collectCourseEvidenceEntries(input)
courseAssignments = assignCourseEntries(COURSES, courseEvidenceEntries, { currentStage })

// Requirements (ST1)
coursesComplete = relevantCourses.filter(c => isCourseRequirementMet(c, courseAssignments))

// Ahead-of-stage
buildAheadOfStageItems(currentStage, { courseAssignments, courseEntries, ... })
  → for each COURSES row with stage > ST1:
      isCourseAheadOfStage(course, courseAssignments, currentStage)
```

### Assignment rules (summary)

- One entry → one catalog row max  
- `canEntrySatisfyCourse`: variant rules + training year ≥ due stage (or explicit title)  
- ROBUST catalog: requires `\brobust\b` in **identity** before assignment  
- Grade-scoped entries without `year`: infer `currentStage` from `_scanFilter: "courses"`

### Ahead-of-stage rules for ROBUST

- Must have assignment on `Obstetric simulation course (ROBUST or equivalent)|ST3` key  
- **`isCourseAheadOfStage`:** if `variant === "robust"`, return true **only** if identity contains `\brobust\b`

---

## The puzzle: tests pass, live scan fails

### What tests cover (all pass)

```bash
cd portfolioiq
node --test tests/requirements/course-evidence.test.js
node --test tests/requirements/*.test.js
```

Fixtures include:

- List-only entries: `PROMPT`, `CTG`, Basic practical with `_scanFilter: "courses"`, with/without `year`
- `assignCourseEntries(COURSES, entries, { currentStage: "ST1" })` → ROBUST **not** assigned, **not** ahead-of-stage
- `buildAheadOfStageItems("ST1", { courseAssignments, ... })` → no ROBUST line

### Simulated live data (also passes)

```javascript
// List-only, no year, ST1 grade-scoped
[
  { _scanFilter: "courses", name: "Basic practical skills in obstetrics and gynaecology" },
  { _scanFilter: "courses", name: "CTG training" },
  { _scanFilter: "courses", name: "PROMPT" },
]
// + assignCourseEntries(..., { currentStage: "ST1" })
// → ROBUST assigned? false, ahead? false
```

### Therefore the live bug likely involves data **not in unit tests**

Hypotheses ranked by likelihood:

1. **Extra course evidence entry in live `courseEvidenceEntries`**  
   - `collectCourseEvidenceEntries` merges `input.entries` (27 enriched) + `input.all_entries` (45 total).  
   - Something enriched or listed passes `isCourseEvidenceEntry` and matches/assigns to ROBUST.  
   - **Action:** Log `courseEvidenceEntries` and `courseAssignments` in scan meta / console during scoring.

2. **Fourth course log in portfolio**  
   - User may have another Courses log whose title or fields contain `robust` or full ROBUST catalog string.  
   - Would not affect 3/3 if it assigns to ROBUST only, but would show ahead-of-stage.  
   - **Action:** Inspect Kaizen search with same facets; count course rows.

3. **List scrape `name` differs from UI**  
   - User sees `PROMPT` in UI; scrape may capture longer text (row subtitle, hidden fields) containing ROBUST or full catalog string.  
   - **Action:** Dump raw `name`, `category`, `year`, `url` for each `_scanFilter: "courses"` entry in scan meta.

4. **Service worker / cache serving stale JS**  
   - Report footer shows correct version string from manifest, but module cache might be stale (rare).  
   - **Action:** Hard reload extension, verify `course-evidence.js` contains `resolveEntryTrainingYear` and `assignCourseEntries` with `currentStage`.

5. **Assignment assigns to ROBUST despite gates**  
   - If identity somehow includes `robust` (field key, merged enrichment, typo).  
   - **Action:** For each `assignmentsByCourse` entry keyed to ROBUST, log `courseEntryKey`, `name`, `title`, `entryIdentityText(entry)`.

6. **`isCourseAheadOfStage` bypass**  
   - Unlikely — `scan-results.js` only renders `report.ahead_of_stage.items` from `computeReadiness` output.  
   - **Action:** Grep scan pipeline for any other path that pushes course items into ahead-of-stage.

7. **Missing `currentStage` in assignment during scan**  
   - `computeReadiness` should pass `currentStage` from profile/dashboard. If null, inference falls back weakly.  
   - **Action:** Log `currentStage` and `courseAssignments.assignmentsByCourse` keys in scan stored meta.

---

## Recommended debug instrumentation

Add temporary logging in `computeReadiness` after assignment (remove before release):

```javascript
// compute-readiness.js — after courseAssignments built
console.log("[Atlas] courseEvidenceEntries", courseEvidenceEntries.map(e => ({
  key: courseEntryKey(e),
  name: e.name,
  title: e.title,
  year: e.year,
  _scanFilter: e._scanFilter,
  identity: entryIdentityText(e), // export if needed
})));
console.log("[Atlas] courseAssignments", {
  byCourse: [...courseAssignments.assignmentsByCourse.entries()].map(([k, e]) => [k, e?.name]),
  byEntry: [...courseAssignments.assignmentsByEntry.values()],
});
console.log("[Atlas] ahead courses", buildAheadOfStageItems(currentStage, { ... }).filter(i => i.category === "course"));
```

Persist in scan meta (`scan.js` stored object) so user can paste from extension storage without DevTools:

```javascript
meta: {
  course_debug: {
    entries: [...],
    assignments: [...],
    ahead_courses: [...],
  },
}
```

---

## Scan pipeline reference

```
runPortfolioScan (scan.js)
  → scrapeSmartScanSearch → entries tagged _scanFilter: courses | cip | osats | to2
  → enrichEntriesWithDetail → ONLY OSATS + CiP list candidates (NOT courses)
  → buildScanInput(scrapePayload)
  → computeReadiness(input)
       → collectCourseEvidenceEntries
       → assignCourseEntries(COURSES, entries, { currentStage })
       → buildAheadOfStageItems(..., { courseAssignments })
  → store report in chrome.storage → scan-results.html
```

Smart scan filters (`smart-search-scrape.js` `SMART_SCAN_FILTER_DEFS`):

1. `cip_assessments` (grade + ST1)  
2. `osats_summative`  
3. **`courses`** (grade + other evidence + type 1044)  
4. `to2` (grade + ST1)

---

## CiP / other fixes (for context, working)

| Issue | Fix location | Version |
|-------|--------------|---------|
| 0/14 CiP on scan report | `resolveCipAssessmentTrainingYear` | v0.3.24 |
| CBD `/assessment-type/` false CiP | `content.js` scrapeCipAssessmentLinks | v0.3.23 |
| CiP discovery fallback | `smart-search-scrape.js` | v0.3.22 |

User’s latest scan: **13/14 CiP**, **13 ES judgments**, CiP 11 incomplete — treated as real gap.

---

## Intended product behaviour (agreed with user)

1. **One log → one checklist line** (assignment).  
2. **Same family, different variants** (PROMPT vs ROBUST) — mutually exclusive unless title explicitly names variant.  
3. **Training year** — ST1-scoped scan entries default to ST1; cannot satisfy ST3 without explicit ROBUST in title.  
4. **Ahead-of-stage** — informational only; must not fire on PROMPT log for ROBUST.

---

## Suggested next steps for incoming agent

1. **Reproduce with live data** — add `course_debug` to scan meta; get user to re-scan on v0.3.30+ and paste debug blob.  
2. **Identify which entry assigns to** `Obstetric simulation course (ROBUST or equivalent)|ST3`.  
3. **If no assignment but ROBUST still shows** — trace `buildResult` / `ahead_of_stage` serialization (unlikely).  
4. **If assignment exists wrongly** — trace why `canEntrySatisfyCourse` / `entryMatchesCourse` allowed it for that entry’s raw fields.  
5. **Consider nuclear ahead-of-stage rule:** never show obstetric_simulation ROBUST unless **some** entry has `\brobust\b` in identity **independently of assignment** (defense in depth in `buildAheadOfStageItems`).  
6. **Consider enriching course logs** during scan (visit `/log-entry/{id}`) so `year` and `title` come from detail page, not list row.  
7. **Verify extension reload** — MV3 service worker module graph; bump version and add one-time `console.log` with unique string to confirm new code runs.

---

## Commands

```bash
# Tests (app repo)
cd portfolioiq
node --test tests/requirements/course-evidence.test.js
node --test tests/requirements/*.test.js

# Extension version
grep '"version"' portfolioiq-extension/manifest.json
```

---

## Related tests

- `tests/requirements/course-evidence.test.js` — assignment, variant, ahead-of-stage, PROMPT-only title  
- `tests/requirements/smart-search-scrape.test.js` — courses filter URL stacking  
- `tests/requirements/cip-outcome-scoring.test.js` — CiP training year (separate issue, fixed)  
- `tests/requirements/ahead-of-stage.test.js` — OSATS ahead-of-stage only

---

## Contact context

User has been iterating via scan report pastebacks. They understand the grade filter vs matching distinction. They approved assignment + training-year approach but **ROBUST line persists** in ahead-of-stage as of v0.3.29 and v0.3.30 scans while **Courses 3/3 and PROMPT Complete remain correct**.

**Do not regress:** PROMPT titled `"PROMPT"` only must still count for ST1 simulation course.
