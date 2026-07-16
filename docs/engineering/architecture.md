# Architecture

The product constraints governing provider boundaries are canonical in the
[product pitch](../product/pitch.md).

## Primitive catalog topology

The first executable surface is a developer-only GNOME Shell 50.1 extension under
`design/direction-lab`. `extension.js` owns Shell lifecycle and composition;
`primitives.js` owns St/Clutter presentation; `catalog-state.js` owns disposable
static state and geometry with no GNOME imports.

The packaged token manifest drives runtime drawing and actor geometry. A generated
Shell stylesheet consumes the same manifest, with drift checked by the repository
gate. Provider marks are local attributed assets with unmodified dark- and
light-chrome variants.

The catalog has no provider boundary, credential access, network process, polling,
or durable storage. `gnome-shell-test-tool` installs each package into a disposable
XDG home and runs J-001 inside an isolated D-Bus GNOME devkit session.
