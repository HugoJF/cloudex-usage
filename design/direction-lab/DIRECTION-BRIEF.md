# Design Direction Exploration — Claudex Usage

This is the durable record of the single divergent Phase-0 exploration required by
Aura. Direction D is the canonical outcome; the adjacent extension is its executable,
developer-only primitive catalog rather than a selectable direction gallery.

## Product essence

Claudex Usage makes Claude Code and Codex subscription limits visible from the
GNOME panel without opening separate provider views. It should feel trustworthy,
quiet, and glanceable while still carrying three differently shaped usage windows.

The defining moments are:

1. Reading the most important capacity signal directly from the top panel.
2. Opening one popup and comparing Claude 5-hour, Claude weekly, and Codex weekly
   utilization with their reset times.
3. Understanding recent movement without mistaking mock, unavailable, or stale data
   for a current provider value.

## Platform constraints

- Target GNOME Shell 50.1 on Wayland.
- Use GJS and Shell Toolkit actors rather than GTK widgets inside the Shell process.
- Fit the panel indicator within the native top-bar height.
- Respect keyboard focus and the Shell popup lifecycle.
- Evaluate both light and dark Shell themes.
- Use static data only during direction selection.

## Directions

### A — Native Utility

Theme-led, compact, and immediately at home in GNOME. It uses the Shell accent,
ordinary information hierarchy, restrained cards, and the smallest panel footprint.

### B — Signal Deck

Dense and instrument-like. It treats the popup as a compact monitor with explicit
provider colors, technical labels, tighter type, and stronger chart presence.

### C — Quiet Capacity

Calm and editorial. It uses warm surfaces, more whitespace, large utilization
figures, and a reduced chart so reset timing carries equal weight with percentages.

### D — Selected Blend

Selected from the first review: retain Native Utility's provider grouping, zero-origin
progress bars, merged three-series chart, and unabbreviated legend; apply Signal
Deck's palette and typography; use Quiet Capacity's compact text-only panel treatment.
The selected candidate adds the missing Claude 5-hour panel value, continuous graph
lines, Y-axis labels, and an in-popover settings view.

## Selected direction

Direction D is the approved canonical reference. Its neutral graphite surfaces frame
a compact SVG-and-percentage panel label, a lighter/darker Claude coral pair, and a
restrained Codex green. The merged chart consumes the full content width. Settings
expose each of the three current limits independently and contain no alert controls or
prototype warnings.

Claude and OpenAI marks remain unmodified monochrome SVGs in provider headers and the
minimized panel. OpenAI's Blossom represents Codex because the official Codex surface
does not publish a separate Codex glyph. Claude 5-hour uses a 1 px history stroke;
weekly series use 2.5 px.

Settings use a center-aligned 32 × 18 px switch with a 14 px thumb and 2 px inset.
The settings entry point is a 20 px GNOME `preferences-system-symbolic` glyph in a
transparent 32 px hit target with surface feedback only on hover or keyboard focus.

Tokens, primitive inventory, and interaction idioms are canonical in
[`docs/engineering/design-system.md`](../../docs/engineering/design-system.md).
