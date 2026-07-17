#!/bin/sh
set -eu

fixture_dir=${CLAUDEX_GSETTINGS_FIXTURE_DIR:?missing GSettings fixture directory}
keyfile="$XDG_CONFIG_HOME/glib-2.0/settings/keyfile"
saved_keyfile="$fixture_dir/keyfile"

if [ "${CLAUDEX_J003_PHASE:-write}" = restore ]; then
    mkdir -p "$(dirname "$keyfile")"
    cp "$saved_keyfile" "$keyfile"
fi

"$@"

if [ "${CLAUDEX_J003_PHASE:-write}" = write ]; then
    mkdir -p "$fixture_dir"
    cp "$keyfile" "$saved_keyfile"
fi
