// Interactive playground journey (scripts/live-play.sh). Keeps the
// gnome-shell-test-tool session open so you can click around the panel item, popup,
// history chart, range selector, and settings with real data. Refreshes once a minute
// so usage and history stay live. The session ends when you close its window.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'cloudex-usage@hugo.local';
export const METRICS = {};
export function init() {}

export async function run() {
    await Scripting.sleep(1000);
    // Keep the session alive; the extension polls on its own timer, and this nudges a
    // refresh every minute so live values and history update while you watch.
    for (let minute = 0; minute < 100000; minute++) {
        Main.extensionManager.lookup(UUID)?.stateObj?.refresh?.();
        await Scripting.sleep(60000);
    }
}
