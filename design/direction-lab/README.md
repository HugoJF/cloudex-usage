# Claudex Usage Direction Lab

Developer-only GNOME Shell extension containing four static-data visual directions.
It intentionally performs no authentication, provider calls, polling, or persistence.

After installation, click the Claudex indicator in the top panel. Use the direction
buttons at the bottom of the popup to switch among Native Utility, Signal Deck, Quiet
Capacity, and the selected synthesis.

## Package

    gnome-extensions pack --force --extra-source=icons design/direction-lab --out-dir /tmp

The generated ZIP can then be installed with GNOME Extensions for visual review.
