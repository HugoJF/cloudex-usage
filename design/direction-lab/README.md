# Claudex Usage Primitive Catalog

Developer-only GNOME Shell extension containing the approved static Direction D
panel, usage popup, settings popup, and interaction states. It performs no
authentication, provider calls, polling, or persistence.

## Validate and review

Run the complete gate. It renders the token-backed stylesheet, packages the catalog,
installs it into an isolated GNOME Shell 50.1 devkit session, runs J-001, and verifies
temporary screenshots:

```bash
npm test
```

Regenerate the canonical evidence under [`design/captures`](../captures/):

```bash
npm run capture
```

The package includes `extension.js`, the pure process-local catalog state, the GJS
primitive module, both provider-mark contrast variants, and the canonical token
manifest. `gnome-shell-test-tool` installs the resulting ZIP into a disposable XDG
home, so development review does not alter the user's installed extensions.
