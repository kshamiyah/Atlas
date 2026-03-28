# Support runbook — Progress APIs & dashboard

## Progress API `400` responses

| Symptom | Typical cause | Fix |
|--------|----------------|-----|
| Invalid `stage_scope` | Value not `BAND_ST1_2`, `BAND_ST3_5`, or `BAND_ST6_7` | Use exact enum strings from the scope bar or docs. |
| Invalid `stage_group` | Not `Stage One`, `Stage Two`, or `Stage Three` | Match UI labels exactly (case-sensitive). |
| Invalid `cip` | Not an integer 1–14 | Correct query param. |
| Invalid dates | `date_from` / `date_to` not `YYYY-MM-DD` or `date_from` &gt; `date_to` | Normalize dates. |
| Invalid `stage_id` | UUID not in `stages` table | Pick a valid stage from profile or clear `stage_id`. |
| Key skills filters | `gaps_only` and `confirmed_only` both truthy | Only one may be set. |
| Descriptor filters | `descriptor_gaps_only` and `descriptor_covered_only` both truthy | Only one may be set. |
| Invalid `sort` / `descriptor_sort` | Unknown mode | Use allowed values from API error text. |

## Reconciliation troubleshooting

Automated checks (`npm run test:ltft`, includes `tests/reconciliation/`) verify that **for the same synthetic inputs**, `computeProgressKpis` matches:

- CiP row rollups (`computeProgressCipRows`),
- Unfiltered key-skill groups,
- Unfiltered descriptor groups.

If **production** numbers disagree:

1. Confirm **scope** is identical (stage, dates, `cip`) between Summary and the tab API calls.
2. Confirm **list filters** are off (`gaps_only`, `descriptor_gaps_only`, etc.) when comparing to summary KPIs.
3. Check for **stale client cache** — hard refresh; Progress hub refetches on scope change.

## Key skill review deep links

- Params: `focus_cip`, `focus_skill` (UUID), `focus_descriptor` (UUID, requires skill).
- **Clear focus** removes only those three params; other query keys (e.g. scope) are kept.
- If the banner says the link could not be matched: entries may not be synced, or the skill/descriptor is not on any queue row.

## Rollback

- Revert the merge commit or deploy the previous release artifact.
- No feature flag is required; behaviour is routing/UI only (no schema migrations for this track).

## Telemetry (non-prod verification)

- In **development**, events log as `[telemetry]` in the browser console.
- A `CustomEvent` `portfolioiq-telemetry` is dispatched on `window` for optional listeners.
- Wired events include: `dashboard_open_progress_hub`, `dashboard_progress_deeplink`, `progress_tab_change`.

## Accessibility checks (Progress hub)

- Progress tabs expose `role="tablist"` / `role="tab"` / `aria-selected` and a `tabpanel` linked with `aria-labelledby`.
- **Tooling:** no automated axe job in CI yet; spot-check with keyboard (Tab / Enter) on `/dashboard/progress` and a screen reader smoke on tab changes.

## Known limitations

- E2E setup uses seeded Supabase data + Playwright `storageState` via magic-link auth; it no longer depends on `DEV_BYPASS_AUTH`.
- Full “sync → progress → CTA → review” journey needs extension/fixtures not included in CI smoke.
