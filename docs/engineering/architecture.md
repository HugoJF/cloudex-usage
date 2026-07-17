# Architecture

The product constraints governing provider boundaries are canonical in the
[product pitch](../product/pitch.md).

## Shared presentation topology

`extension/shared` is the neutral presentation source. `token-geometry.js` owns
token validation, strict CSS-color conversion, and percentage geometry;
`primitives.js` owns only the documented St/Clutter primitive inventory; and
`stylesheet.template.css` is the canonical Shell stylesheet contract. Both
JavaScript modules fail closed on invalid presentation input and import no catalog
fixtures or state.

The developer-only GNOME Shell 50.1 catalog remains under
`design/direction-lab`. Its `extension.js` adapts disposable `catalog-state.js`
snapshots and static fixtures into presentation models, composes the shared
primitives, and destroys the prior actor tree on every rerender. Provider marks
remain local attributed assets with unmodified dark- and light-chrome variants.

The packaged token manifest drives runtime drawing and actor geometry. The shared
template generates the catalog's root `stylesheet.css`, which GNOME loads, and the
gate rejects source or generated-file drift. Packaging includes the complete
`shared/` directory and tokens while forbidding stale root shared modules.

The catalog has no provider boundary, credential access, network process, polling,
or durable storage. The gate installs it and a generated, noncanonical temporary
second consumer into separate disposable GNOME devkit sessions. The persistent
production extension topology and UUID begin in `SURF-002`.
