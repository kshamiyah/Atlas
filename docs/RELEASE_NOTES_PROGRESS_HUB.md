# Release notes — Progress hub & dashboard command centre

## Summary

- **Dashboard** (`/dashboard`) is the high-level command centre: next actions, ARCP prediction, entries, activity, sync status, and a **Progress overview** card with KPI chips from `/api/progress/summary`.
- **Progress** (`/dashboard/progress`) is the canonical place for CiP, key-skill, and descriptor coverage (tabs + scope bar + message centre).
- **Key skill review** honours **Progress deep links**: `focus_cip`, `focus_skill`, `focus_descriptor` (with banner and clear action).

## User-facing changes

- Removed duplicate per-CiP progress list from the dashboard; detailed curriculum breakdown lives under Progress.
- Added “Open Progress Hub” and tab deep links from the dashboard Progress card.
- Sidebar label **Home** → **Dashboard** (same route).

## Technical

- Progress metric modules under `lib/progress/` use relative imports for shared Node test compilation.
- Reconciliation tests assert summary KPIs match unfiltered CiP / key-skill / descriptor aggregations on synthetic fixtures (`tests/reconciliation/`).
