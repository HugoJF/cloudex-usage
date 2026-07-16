# Primitive catalog captures

These images are deterministic actor-level captures produced by the J-001 GNOME
Shell journey. They cover the selected Direction D panel, usage and settings states,
including range focus/hover, an off visibility switch, light Shell chrome, and 200%
panel scaling.

Regenerate the evidence from an isolated GNOME Shell 50.1 session:

```bash
npm run capture
```

The ordinary `npm test` gate runs the same journey into a temporary directory so
validation does not dirty the worktree.
