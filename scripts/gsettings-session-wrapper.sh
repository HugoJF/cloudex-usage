#!/bin/sh
set -eu

fixture_dir=${CLOUDEX_GSETTINGS_FIXTURE_DIR:?missing GSettings fixture directory}
keyfile="$XDG_CONFIG_HOME/glib-2.0/settings/keyfile"
saved_keyfile="$fixture_dir/keyfile"
phase=${CLOUDEX_J003_PHASE:-write}

if [ "$phase" = write ]; then
    legacy_keyfile="$fixture_dir/legacy-keyfile"
    if [ ! -f "$legacy_keyfile" ]; then
        echo "missing validated legacy GSettings seed: $legacy_keyfile" >&2
        exit 1
    fi
    mkdir -p "$(dirname "$keyfile")"
    if [ -f "$keyfile" ]; then
        printf '\n' >> "$keyfile"
        cat "$legacy_keyfile" >> "$keyfile"
    else
        cp "$legacy_keyfile" "$keyfile"
    fi
elif [ "$phase" = restore ]; then
    mkdir -p "$(dirname "$keyfile")"
    cp "$saved_keyfile" "$keyfile"
fi

"$@"

if [ "$phase" = write ]; then
    mkdir -p "$fixture_dir"
    cp "$keyfile" "$saved_keyfile"
fi
