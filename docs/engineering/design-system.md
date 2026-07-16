# Design System

Direction D, **Selected Blend**, is the canonical Claudex Usage visual language. It
combines GNOME-native information hierarchy with neutral graphite surfaces, compact
technical typography, provider grouping, and a quiet top-panel footprint.

## Authority

- Token values: [`design/system/tokens.json`](../../design/system/tokens.json)
- Canonical composition: [`design/direction-lab/DIRECTION-BRIEF.md`](../../design/direction-lab/DIRECTION-BRIEF.md)
  — Direction D
- Executable reference: [`design/direction-lab`](../../design/direction-lab/)
- Provider-mark provenance: [`design/direction-lab/icons/README.md`](../../design/direction-lab/icons/README.md)

The token manifest is the value authority. GNOME Shell CSS lacks portable custom
properties, so generated or hand-authored styles may repeat literals but must remain
byte-equivalent to the manifest roles they consume.

## Tokens

### Color roles

| Role family | Meaning |
| --- | --- |
| `surface*` | Root popup, raised cards, controls, chart field, and hover surfaces |
| `foreground*` | Primary content, secondary actions, metadata, and subdued help text |
| `border*` | Low-contrast separation without card-heavy chrome |
| `focus` | Keyboard focus and selected range state; never a data-series color |
| `switch*` | Boolean-control track and thumb states |
| `dataClaudeShort` | Claude 5-hour bar, legend key, and 1 px history line |
| `dataClaudeWeekly` | Claude weekly bar, legend key, and 2.5 px history line |
| `dataCodexWeekly` | Codex weekly bar, legend key, and 2.5 px history line |
| `grid`, `separator`, `hoverOverlay` | Structural overlays that remain subordinate to data |

Provider data colors are reserved. They do not become accents for buttons, focus,
status, or decorative surfaces.

### Shape, spacing, and type

- Radii progress from an 8 px control to a 15 px popup; pills are reserved for tracks
  and switches.
- Spacing uses named intent from `micro` through `popoverInset`; new arbitrary gaps
  require a primitive-level reason.
- Type uses the Shell font. Kicker, supporting, legend, metadata, body, strong body,
  and title are the complete initial scale.
- The panel uses the strong-body scale with 14 px provider marks.
- The chart grid and Claude 5-hour series use 1 px strokes. Weekly series use 2.5 px.

## Primitive Inventory

| Primitive | Props / variants |
| --- | --- |
| `PopoverScaffold` | `view`, `title`, `kicker`, `trailingAction`, `children` |
| `PanelIndicator` | visible provider groups, per-window percentage visibility |
| `ProviderGroup` | `provider`, `icon`, `detail`, `children`; Claude / Codex |
| `ProviderCard` | `provider`, `metrics`; raised-surface variant only |
| `UsageMetric` | `window`, `percent`, `reset`, `dataRole` |
| `ProgressBar` | `percent`, `dataRole`; always zero-origin |
| `HistoryChart` | visible series, time range, Y-axis labels; continuous lines only |
| `Legend` | full series names and reserved data colors |
| `RangeSelector` | available ranges, selected range |
| `IconButton` | symbolic icon, accessible name; transparent / hover / focus states |
| `SettingsRow` | title, description, boolean state, activation callback |
| `Switch` | on / off; fixed 32 × 18 track and 14 px thumb |
| `ChoiceRow` | title, current value, disclosure affordance |
| `FooterStatus` | freshness text, refresh action |

The selected usage popup introduces no primitives beyond this inventory. A future
screen must list composed primitives and explicitly justify additions.

## Composition Rules

- Group limits by provider before grouping them by window duration.
- Show utilization as a zero-origin bar and an explicit percentage.
- Keep reset timing adjacent to its own limit.
- Merge visible series into one chart; do not split providers into separate graphs.
- Use unabbreviated legend labels even when the panel itself is compact.
- Give the graph the full content width, with Y-axis labels outside its plot field.
- Use provider SVGs in headers and the panel. Do not redraw, tint, or distort marks.
- Keep the settings entry point visually transparent until hover or keyboard focus.

## Interaction Idioms

- The indicator is a native `PanelMenu.Button`; Shell owns opening, closing, outside
  click dismissal, and popup placement.
- Every action is keyboard-focusable and exposes an accessible name.
- Hover and focus may reveal a restrained surface; resting icon actions stay flat.
- A settings row is one activation target. Its switch is a state indicator, not a
  second nested button.
- Boolean changes update the static panel preview immediately without closing the
  popup. Production persistence is outside the primitive contract.
- Range selection replaces the active state in place; chart transitions default to
  no animation until motion has a demonstrated comprehension benefit.
- Provider unavailability, staleness, and lifecycle visibility require feature-spec
  behavior before they may appear in production UI.

## Accessibility and Theme Review

- Preserve GNOME's native panel height and focus navigation order.
- Percentage remains textual; color never carries utilization or provider identity
  alone.
- SVG marks accompany provider names in the popup.
- Validate dark and light Shell themes, 100% and 200% scaling, keyboard-only use, and
  the selected/hover/focus states before accepting a primitive slice.
- Screenshot evidence must include the minimized panel, usage popup, settings popup,
  and every interactive state that changes geometry.

## Scope Boundary

This system defines presentation and interaction vocabulary. It does not authorize
provider access, polling, authentication, persistence, alerts, or history storage.
