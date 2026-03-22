# PortfolioIQ — Figma Design Handover
**Version:** March 2026
**Product:** PortfolioIQ — RCOG Obstetrics & Gynaecology training portfolio tracker
**Stack for reference:** Next.js 16, React 19, TypeScript, Tailwind v4, Geist Sans font

---

## 1. What is PortfolioIQ?

PortfolioIQ is a premium web app for RCOG (Royal College of Obstetricians and Gynaecologists) surgical trainees. It syncs with their NHS training portal (Kaizen/ePortfolio) and shows them:

- **ARCP Readiness** — How close they are to meeting their annual review targets (key skills confirmed)
- **CiP Progress** — Progress across each Capability in Practice (curriculum competency)
- **Evidence Review** — AI-assisted review of portfolio entries mapped to key skills
- **Recent Entries** — A live feed of synced portfolio entries

**Target user:** NHS RCOG surgical trainee, 25–40 years old, time-poor, used to clinical software + Apple devices. Premium feel is crucial — this replaces a clunky NHS portal.

---

## 2. Design Direction

### Inspiration
- **Apple.com / macOS System** — Clean surfaces, generous whitespace, hairline borders, SF Pro–style typography hierarchy
- **Linear.app** — Dark sidebar, focused single-column layouts, micro-animations on state changes
- **Vercel Dashboard** — Data-dense but not cluttered; clean stat cards; monospaced numbers

### Tone
Professional, calm, trustworthy. No loud gradients. The green accent is intentional — it signals "you're on track."

### Modes
- **Light mode (default):** Off-white page (#f5f5f7), pure white cards, subtle 7% black border
- **Dark mode:** Dark grey page (#161618 — NOT pitch black), layered grey cards (#1e1e21 → #28282b → #333336)

---

## 3. Design Tokens

### Color Palette

#### Surfaces (Light)
| Token | Hex | Usage |
|-------|-----|-------|
| `surface-1` | `#f5f5f7` | Page background |
| `surface-2` | `#ffffff` | Cards |
| `surface-3` | `#f0f0f3` | Elevated / input bg |
| `surface-4` | `#e5e5ea` | Hover fill |
| `surface-5` | `#d8d8dd` | Active / pressed |

#### Surfaces (Dark)
| Token | Hex | Usage |
|-------|-----|-------|
| `surface-1` | `#161618` | Page background |
| `surface-2` | `#1e1e21` | Cards |
| `surface-3` | `#28282b` | Elevated / input bg |
| `surface-4` | `#333336` | Hover fill |
| `surface-5` | `#404043` | Active / pressed |

#### Text
| Token | Light | Dark |
|-------|-------|------|
| `text-primary` | `#1d1d1f` | `#f5f5f7` |
| `text-secondary` | `#6e6e73` | `rgba(235,235,245,0.60)` |
| `text-muted` | `#86868b` | `rgba(235,235,245,0.30)` |

#### Accents (Apple System Colors)
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `accent-green` | `#28cd41` | `#30d158` | Primary CTA, positive status, confirmed |
| `accent-amber` | `#ff9f0a` | `#ff9f0a` | Warning, partial progress |
| `accent-red` | `#ff3b30` | `#ff453a` | Danger, rejected, gaps |
| `accent-blue` | `#007aff` | `#0a84ff` | Links, info |
| `accent-purple` | `#af52de` | `#bf5af2` | Special states |

#### Borders
| Token | Light | Dark |
|-------|-------|------|
| `border-subtle` | `rgba(0,0,0,0.07)` | `rgba(255,255,255,0.10)` |
| `border-emphasis` | `rgba(0,0,0,0.16)` | `rgba(255,255,255,0.22)` |

### Typography
**Font Family:** Geist Sans (display, UI) / Geist Mono (numbers, code)

| Token | Size | Usage |
|-------|------|-------|
| `micro` | 11px | Labels, table cells, tags |
| `small` | 13px | UI text, buttons, sidebar nav |
| `body` | 16px | Body copy, descriptions |
| `heading-3` | 18px | Card headings |
| `heading-2` | 24px | Section headings |
| `heading-1` | 32px | Page titles |
| `display` | 40px | Hero numbers (e.g., 74% ring center) |

**Font weights in use:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
**Tabular numbers:** Always use `font-variant-numeric: tabular-nums` for percentages, dates, counts.

### Border Radius
| Context | Radius |
|---------|--------|
| Cards | 12px (0.75rem) |
| Buttons | 8px (0.5rem) |
| Pills / tags | Full (9999px) |
| CiP tiles | 8px |
| Avatar / logo mark | 8px |
| Input fields | 8px |

### Shadows
| Context | Light | Dark |
|---------|-------|------|
| Card resting | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | None |
| Card hover | `0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)` | `0 0 0 1px border-emphasis` |
| Sidebar | `1px 0 0 0 border-subtle` (hairline right) | Same |

### Spacing Scale
Follows 4px base unit. Key values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64

---

## 4. Layout

### Shell
```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (256px fixed)  │  Main content (fluid, max     │
│                         │  960px centered, px-16 py-24) │
│  ─────────────────────  │                               │
│  Logo mark + wordmark   │  [Page content sections]      │
│  ─────────────────────  │                               │
│  MENU label             │                               │
│  Nav items × 4          │                               │
│                         │                               │
│  ─────────────────────  │                               │
│  User card (bottom)     │                               │
│  Sign out + theme tog.  │                               │
└─────────────────────────────────────────────────────────┘
```

### Page max-width
- Dashboard content: `max-w-5xl` (960px) centered
- Full-bleed page bg: `surface-1` + subtle radial green glow (top-right, 5% opacity light / 8% dark)

---

## 5. Current Components — Spec Sheets

---

### 5.1 App Sidebar

**Dimensions:** 256px wide, full viewport height, sticky
**Background:** `surface-1`
**Right border:** 1px hairline shadow `rgba(0,0,0,0.07)`

#### Logo area (top, p-16)
- Logo mark: 28×28px, `border-radius: 8px`, `bg: accent-green`, white "P" centered (font-size 14px, font-weight 700)
- Wordmark: "PortfolioIQ" — `text-small`, `font-weight 600`, `text-primary`
- Arranged horizontally with 8px gap

#### Nav section
- Section label "MENU" — `text-micro`, `font-weight 600`, `letter-spacing: 0.08em`, `text-muted`, `px-16 mb-4`
- Nav items: `px-12 py-8`, `border-radius: 8px`, `gap: 6px` horizontal, icon (16px) + label (`text-small`, `font-weight 500`)
- **Inactive:** `text-secondary`, icon `text-muted`
- **Active:** `bg: accent-green/10`, `text-primary`, `font-weight: 500`, icon `text-accent-green`
- Items: Home (house icon), Evidence Review (clipboard), Coverage Map (grid), Generate Entry (sparkle)

#### User footer (bottom, p-16, border-top)
- User card row: 32px circle avatar (initial letter, `bg: surface-3`, `text-primary`, `text-small font-weight 600`) + email (`text-micro`, `text-secondary`, truncated) + last sync time (`text-micro`, `text-muted`)
- Actions row (mt-8): Sign out button (`text-micro`, `text-secondary`, log-out icon) + Dark mode toggle (sun/moon icon, `text-secondary`, toggles `.dark` class on `<html>`)

---

### 5.2 ARCP Readiness Hero

**Purpose:** The main "health meter" of the dashboard. Shows how many key skills are confirmed across the user's curriculum.

**Layout:** Card, full width, padding 24px

#### Stage filter (segmented pill control)
- Container: `inline-flex`, `border-radius: 9999px`, `bg: surface-3`, `padding: 2px`
- Pills: "All" | "Stage One" | "Stage Two" | "Stage Three" (stage groups from DB)
- **Active pill:** `bg: surface-1`, `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`, `text-primary`, `font-weight 500`
- **Inactive pill:** Transparent bg, `text-secondary`
- Font: `text-micro`, padding `px-12 py-4`

#### Progress ring (SVG, 200×200px)
- Track circle: `stroke: surface-3`, `stroke-width: 12`, `r: 80`
- Fill arc: `stroke: accent-green`, `stroke-width: 12`, `stroke-linecap: round`, rotated -90°
- `strokeDasharray: 502.65` (circumference = 2π×80)
- `strokeDashoffset` animated via `requestAnimationFrame` on load + stage change (CSS transition 800ms ease)
- Center text: Large % number (`font-size: display / 40px`, `font-weight: 700`, `text-primary`) + "confirmed" label below (`text-micro`, `text-muted`)
- Below ring: "X of Y key skills confirmed" — `text-small`, `text-secondary`

#### CiP tile grid
- 7 tiles in a row (one per CiP 1–7)
- Each tile: 40×40px, `border-radius: 8px`, CiP number centered (`text-micro`, `font-weight 600`)
- Color coding by `coverage_pct`:
  - 0% → `bg: surface-3`, `text-muted`
  - 1–49% → `bg: accent-amber/20`, `text-accent-amber`
  - 50–79% → `bg: accent-blue/20`, `text-accent-blue`
  - ≥80% → `bg: accent-green/20`, `text-accent-green`

---

### 5.3 CiP Progress Section

**Layout:** Card, full width
**Header:** "CiP Progress" (`text-heading-3`, `font-weight 600`) + count badge (total CiPs, `text-micro`, `text-muted`)

#### Progress rows
- Outer: `flex items-center gap-12`, `py-10`, `border-bottom: 1px border-subtle` (last row no border)
- Left: CiP label ("CiP 1", etc.) — `text-small`, `text-secondary`
- Middle: Full-width progress bar track (`h: 6px`, `bg: surface-3`, `border-radius: 9999px`) with colored fill (`transition-all 600ms ease`)
- Right: Percentage (`text-small`, `font-weight 600`, `tabular-nums`, `text-primary`, `min-width: 36px`, text-right)
- Bar colors: Green (≥80%), Amber (≥50%), Red (<50%), Gray (no data)

#### Empty state
Centered message: "Sync your portfolio to see CiP progress" with extension CTA

---

### 5.4 Stage Selector

**Purpose:** Shows the current detected training stage (from Kaizen profile sync). Allows manual override.

**Layout:** Card, `display: flex`, `align-items: center`, `gap: 12px`, `padding: 16px 20px`

#### Synced state
- Green dot (`8px circle`, `bg: accent-green`, `animate-pulse-dot`)
- Stage pill: `bg: accent-green/10`, `text-accent-green`, `border-radius: 9999px`, `font-weight 600`, `text-small` — shows "ST1 · Stage One"
- Label: "synced from Kaizen" — `text-micro`, `text-muted`
- "override →" link: `text-micro`, `text-muted`, underline-dotted, right-aligned

#### Override picker (expanded)
- Border-top separator
- Stage pills grouped by stage group heading (`text-micro`, `font-weight 600`, `text-muted`, uppercase)
- Stage pill (inactive): `bg: surface-3`, `border-radius: 9999px`, `text-micro`, `text-secondary`
- Stage pill (active): `bg: accent-green/10`, `ring: 1px accent-green`, `text-accent-green`
- "Cancel" link: `text-micro`, `text-muted`

#### Unsynced state
- Amber dot + "Sync your portfolio to detect your training stage" — `text-small`, `text-secondary`

---

### 5.5 Recent Entries Section

**Layout:** Card, full width
**Header:** "Recent Entries" + count badge

#### Table
- `overflow-x: auto` wrapper
- Columns: Date | Type | Title | Category | Year | Status
- Header row: `text-micro`, `font-weight 600`, `text-muted`, `letter-spacing: 0.05em`, uppercase, `pb-8 border-bottom`
- Data rows: `text-micro`, `text-secondary`, `py-10 border-bottom border-subtle`
- Date column: `tabular-nums`, `text-muted`
- Title column: `max-width: 180px`, truncate with title tooltip
- Status badges: Pill-style (`border-radius: 9999px`, `px-8 py-2`, `text-micro`) — colors by status value

---

### 5.6 Sync Status Section

**Layout:** Card, full width (could be a smaller 2-column grid card)
**Header:** "Sync Status"

#### Status rows
- Row: sync type label (left, `text-small`, `text-secondary`) + time-ago (right, `text-small`, `text-muted`, `tabular-nums`)
- Types: Dashboard, CiP Detail, Entries
- Time format: "Just now" / "5m ago" / "2h ago" / "3d ago" / "Jan 15"

---

### 5.7 Buttons

#### Primary
- `bg: accent-green`, white text, `border-radius: 8px`, `height: 34px`, `px-14`
- Font: `text-small`, `font-weight 500`
- Shadow: `0 1px 2px rgba(0,0,0,0.12)` + inset top highlight `rgba(255,255,255,0.15)`
- Hover: `filter: brightness(1.08)`
- Active: `scale(0.97)`, no shadow

#### Secondary
- `bg: surface-3`, `border: 1px border-subtle`, `text-primary`, `border-radius: 8px`, `height: 34px`, `px-14`
- Hover: `bg: surface-4`
- Active: `scale(0.97)`

---

### 5.8 Login Page

**Current state:** Inconsistent with new dashboard — uses `bg-slate-950`, `sky-500` colors, doesn't use the design token system.

**Desired redesign:** Match the dashboard design language exactly.

#### Layout
- Full-height centered page
- Background: `surface-1` with the same radial green glow as dashboard
- Card: `surface-2`, `border-radius: 16px`, `border: 1px border-subtle`, `max-width: 400px`, `padding: 40px`
- Card shadow: `0 8px 32px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)`

#### Card content (top to bottom)
1. Logo mark (40px, centered, `bg: accent-green`, `border-radius: 10px`) + "PortfolioIQ" (`text-heading-2`, `font-weight 700`, centered)
2. Subtitle: "Your RCOG training portfolio, intelligently organised." — `text-body`, `text-secondary`, centered, `mt-8`
3. Divider `mt-24`
4. Label: "Email address" — `text-small`, `font-weight 500`, `text-primary`
5. Input: `bg: surface-3`, `border: 1px border-subtle`, `border-radius: 8px`, `h: 40px`, `px-12`, `text-body`, `text-primary`, focus ring `accent-green/40`
6. Submit button (`.btn-primary`, full width, `h: 40px`, `mt-12`): "Send magic link →"
7. Footer note: "We'll email you a secure, one-click login link." — `text-micro`, `text-muted`, centered

---

## 6. Animation Spec

| Animation | Trigger | Duration | Easing |
|-----------|---------|----------|--------|
| `fade-up` | Page/section mount | 400ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Stagger delay | nth-child 1–8 + (0–280ms in 40ms steps) | — | — |
| Card hover lift | `:hover` | 200ms | Same |
| Ring dashoffset | Stage change / data load | ~800ms | `requestAnimationFrame` linear step |
| Pulse dot | Always (sync indicator) | 1.4s | `ease-in-out infinite` |
| Theme transition | `.theme-ready` class added | 250ms | `cubic-bezier(0.4, 0, 0.2, 1)` |

---

## 7. Pages Inventory

| Page | Route | Status |
|------|-------|--------|
| Login | `/login` | Needs redesign (current: old dark slate style) |
| Dashboard | `/dashboard` | Implemented, needs polish |
| Evidence Review | `/dashboard/key-skill-review` | Needs token cleanup |
| Gap Report | `/dashboard/gap-report` | Stage filter implemented |
| Generate Entry | TBD | Not built yet |

---

## 8. What We Want to Build / Improve

### Priority 1 — Login Page Redesign
Bring login page to match dashboard tokens (see §5.8 above). Currently jarring contrast between the old dark-slate login and the clean new dashboard.

### Priority 2 — Dashboard Polish
- Better information hierarchy on the hero section
- The ARCP ring + CiP tiles could feel more "product-y" — see Linear/Vercel for inspiration
- Stage selector card could be more subtle — it dominates the page currently
- Consider a 2-column grid on wider screens (ring left, CiP tiles right, stats below)

### Priority 3 — Evidence Review Page
Currently uses old raw Tailwind classes, not the new token system. Needs:
- `ReviewCard` redesigned as a proper `.card` with consistent padding
- Filter bar redesigned as a clean horizontal segmented control
- Coverage summary as small stat pills at the top

### Priority 4 — Mobile Responsiveness
App currently desktop-first. Trainees may check on iPad between cases. Need:
- Sidebar collapses to bottom tab bar on mobile
- Cards stack single column below 768px
- Ring resizes gracefully

### Priority 5 — Empty / Loading States
Skeleton loaders for cards while data fetches. Currently shows nothing or "—" text.

---

## 9. Icon Library
Using **Lucide React** throughout. Key icons in use:
- Navigation: `Home`, `ClipboardList`, `LayoutGrid`, `Sparkles`
- Actions: `LogOut`, `Sun`, `Moon`, `RefreshCw`
- Status: `CheckCircle`, `AlertCircle`, `Clock`
- Misc: `ChevronRight`, `X`

All icons rendered at 16px for nav/UI, 14px for inline/buttons.

---

## 10. Assets Needed from Figma

1. **Login page frame** — light + dark variants
2. **Dashboard frame** — light + dark, with real data populated
3. **Sidebar component** — expanded state only (no mobile collapse yet)
4. **ARCPReadinessHero component** — 3 states: loading, loaded (all stages), loaded (stage filtered)
5. **CiP tile** — all 4 color states (gray, amber, blue, green)
6. **Evidence Review card** — suggested, confirmed, rejected states
7. **Button components** — primary, secondary, hover, active states
8. **Stage selector** — synced state + override expanded state
9. **Mobile dashboard** — single column layout

---

*This document was generated from the live codebase. All hex values, spacing, and component specs are exactly as implemented in production CSS.*
