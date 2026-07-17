// Read-only live-usage monitor for headless validation (scripts/live-check.sh).
// Runs inside a gnome-shell-test-tool session with the PRODUCTION extension loaded,
// prints the real surface snapshot over three refresh cycles, and reports how many
// history samples the durable store has recorded. Not part of `npm test`.
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'claudex-usage@hugo.local';
export const METRICS = {};
export function init() {}

function historyCounts() {
    const path = GLib.build_filenamev(
        [GLib.get_user_data_dir(), 'claudex-usage', 'history.json']);
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        return 'none yet';
    const windows = JSON.parse(new TextDecoder('utf-8').decode(bytes)).windows ?? {};
    return Object.entries(windows)
        .map(([key, rows]) => `${key}=${rows.length}`).join(' ') || 'empty';
}

async function waitSettled(extension) {
    for (let attempt = 0; attempt < 300; attempt++) {
        const snapshot = extension.getSurfaceSnapshot();
        if (snapshot.providers.length > 0 && !snapshot.refreshing &&
            snapshot.providers.every(provider => provider.availability !== 'pending'))
            return snapshot;
        await Scripting.sleep(100);
    }
    return extension.getSurfaceSnapshot();
}

function report(label, snapshot) {
    print(`LIVE: --- ${label} (footer="${snapshot.footer}") ---`);
    for (const provider of snapshot.providers) {
        for (const metric of provider.metrics)
            print(`LIVE:   ${provider.label} ${metric.label}: ${metric.percent}% ` +
                `(${metric.resetLabel})`);
        if (provider.availability !== 'available')
            print(`LIVE:   ${provider.label}: ${provider.availability}`);
    }
    print(`LIVE:   history samples: ${historyCounts()}`);
}

export async function run() {
    await Scripting.sleep(500);
    let extension = null;
    for (let attempt = 0; attempt < 100 && !extension; attempt++) {
        extension = Main.extensionManager.lookup(UUID)?.stateObj;
        if (!extension)
            await Scripting.sleep(100);
    }
    if (!extension) {
        print('LIVE: extension never enabled');
        return;
    }
    for (let cycle = 1; cycle <= 3; cycle++) {
        report(`cycle ${cycle}`, await waitSettled(extension));
        if (cycle < 3) {
            extension.refresh();
            await Scripting.sleep(1500);
        }
    }
    print('LIVE: monitor complete');
}
