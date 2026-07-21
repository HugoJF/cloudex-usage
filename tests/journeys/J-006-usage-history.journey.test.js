import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const UUID = 'claudex-usage@hugo.local', PORT = 19876;
const LEFT_CAPTURE = 'surface-left-popup-dark-100.png';
const RANGE_CAPTURES = {
    dark: 'surface-history-stepper-dark-100.png',
    light: 'surface-history-stepper-light-100.png',
    scaled: 'surface-history-stepper-dark-200.png',
};
const SCALED_POPUP_BOUNDS = {
    width: 856,
    height: 306,
    leftOffset: 4,
    topOffset: 24,
};
Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');
export const METRICS = {};
export function init() {}
function assert(value, message) {
    if (!value) {throw new Error(`J-006 failed: ${message}`);}
}
function findActor(root, name) {
    if (root?.get_name?.() === name)
        {return root;}
    for (const child of root?.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found)
            {return found;}
    }
    return null;
}
function labels(root, values = []) {
    if (root instanceof St.Label)
        {values.push(root.text);}
    for (const child of root?.get_children?.() ?? [])
        {labels(child, values);}
    return values;
}
function setShellColorScheme(scheme) {
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}
function captureDirectory() {
    const override = GLib.getenv('CLAUDEX_CAPTURE_DIR');
    if (override)
        {return Gio.File.new_for_path(override);}
    return Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent()
        .get_child('design').get_child('captures');
}
async function captureActor(target, filename, padding = 8,
    fixedTopRight = null) {
    let actor = null;
    let width = 0;
    let height = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
        actor = typeof target === 'function' ? target() : target;
        if (actor?.is_mapped())
            {[width, height] = actor.get_transformed_size();}
        if (width > 0 && height > 0)
            {break;}
        await Scripting.sleep(80);
    }
    assert(actor?.is_mapped(), `${filename} actor is not mapped`);
    assert(width > 0 && height > 0, `${filename} actor has no allocated geometry`);
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        {directory.make_directory_with_parents(null);}
    const [transformedX, transformedY] = actor.get_transformed_position();
    const actorX = fixedTopRight
        ? global.screen_width - fixedTopRight.width - padding -
            fixedTopRight.leftOffset
        : transformedX;
    const actorY = fixedTopRight
        ? padding + fixedTopRight.topOffset
        : transformedY;
    if (fixedTopRight)
        {[width, height] = [fixedTopRight.width, fixedTopRight.height];}
    const x = Math.max(0, Math.floor(actorX - padding));
    const y = Math.max(0, Math.floor(actorY - padding));
    const captureWidth = Math.min(global.screen_width - x,
        Math.ceil(width + padding * 2));
    const captureHeight = Math.min(global.screen_height - y,
        Math.ceil(height + padding * 2));
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(x, y, captureWidth, captureHeight, stream);
    stream.close(null);
}
async function waitFor(callback, message) {
    for (let attempt = 0; attempt < 120; attempt++) {
        if (callback())
            {return;}
        await Scripting.sleep(100);
    }
    throw new Error(`J-006 timed out: ${message}`);
}
function auth(token) {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDE_CONFIG_DIR'),
        '.credentials.json']);
    GLib.file_set_contents(path, JSON.stringify({claudeAiOauth: {accessToken: token}}));
}
function historyWindows() {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDEX_HISTORY_DIR'), 'history.json']);
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        {return {};}
    return JSON.parse(new TextDecoder('utf-8').decode(bytes)).windows ?? {};
}
function historyText() {
    const path = GLib.build_filenamev([GLib.getenv('CLAUDEX_HISTORY_DIR'), 'history.json']);
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, 'history file is readable');
    return new TextDecoder('utf-8').decode(bytes);
}
function startClaude() {
    const process = Gio.Subprocess.new([GLib.getenv('CLAUDEX_FAKE_CLAUDE'),
        '-c', 'import time; time.sleep(30)'], Gio.SubprocessFlags.NONE);
    process.fixturePid = process.get_identifier();
    const directory = GLib.build_filenamev(
        [GLib.getenv('CLAUDEX_PROC_ROOT'), process.fixturePid]);
    GLib.mkdir_with_parents(directory, 0o700);
    GLib.file_set_contents(GLib.build_filenamev([directory, 'comm']), 'claude\n');
    return process;
}
function stopClaude(process) {
    const directory = Gio.File.new_for_path(GLib.build_filenamev(
        [GLib.getenv('CLAUDEX_PROC_ROOT'), process.fixturePid]));
    process.force_exit(); directory.get_child('comm').delete(null);
    directory.delete(null);
}
export async function run() {
    const state = {short: 12, weekly: 37, hold: false, held: null, requests: 0};
    const server = new Soup.Server();
    const reply = message => {
        const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();
        const body = JSON.stringify({
            five_hour: {utilization: state.short, resets_at: iso(5 * 3600 * 1000)},
            seven_day: {utilization: state.weekly, resets_at: iso(7 * 86400 * 1000)},
        });
        message.set_status(Soup.Status.OK, null);
        message.set_response('application/json', Soup.MemoryUse.COPY,
            new TextEncoder().encode(body));
    };
    server.add_handler('/usage', (_server, message) => {
        state.requests++;
        if (state.hold) {
            state.hold = false;
            state.held = message;
            server.pause_message(message);
        } else {
            reply(message);
        }
    });
    server.listen_local(PORT, Soup.ServerListenOptions.IPV4_ONLY);
    await Scripting.sleep(300);
    const extension = Main.extensionManager.lookup(UUID)?.stateObj;
    assert(extension, 'production extension is enabled');
    auth('journey-token');
    const seeded = historyWindows()['claude:short']?.length ?? 0;
    assert(seeded > 0, 'harness seeded prior history');
    let process = null;
    let removeCompanion = null;
    try {
        process = startClaude();
        await waitFor(() => extension.getSurfaceSnapshot().providers[0]
            ?.metrics[0]?.percent === 12, 'live Claude usage');
        if (GLib.getenv('CLAUDEX_J006_PHASE') === 'restore') {
            const indicator = Main.panel.statusArea[UUID];
            indicator.menu.open();
            await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
                'fresh session renders persisted history');
            assert(seeded > 0,
                'fresh extension loaded history before its first provider result');
            indicator.menu.close();
            return;
        }
        await waitFor(() => (historyWindows()['claude:short']?.length ?? 0) > seeded,
            'the completed refresh records a durable sample');
        const afterInitial = historyWindows()['claude:short'].length;
        let companionListener = null;
        let companionEligible = false;
        const companion = {
            id: 'history-eligibility-companion',
            order: 99,
            label: 'Companion',
            detail: 'Journey-only eligible provider',
            marks: {
                darkPanel: 'icons/codex.svg',
                lightPanel: 'icons/codex-light.svg',
                popup: 'icons/codex.svg',
                accessibleName: 'History journey companion mark',
            },
            windows: [{
                id: 'weekly',
                label: 'Weekly window',
                dataRole: 'dataCodexWeekly',
                durationMs: 7 * 86400 * 1000,
            }],
            isEligible: () => companionEligible,
            subscribeEligibility: callback => {
                companionListener = callback;
                return () => companionListener = null;
            },
            refresh: async () => ({status: 'available', readings: [{
                id: 'weekly',
                percent: 45,
                resetAtMs: Date.now() + 86400 * 1000,
            }]}),
        };
        removeCompanion = extension.registerProvider(companion);
        state.short = 24;
        state.hold = true;
        extension.refresh();
        await waitFor(() => state.held !== null, 'first refresh is held');
        companionEligible = true;
        companionListener(true);
        const firstHeld = state.held;
        state.held = null;
        state.hold = true;
        reply(firstHeld);
        server.unpause_message(firstHeld);
        await waitFor(() => state.held !== null &&
            (historyWindows()['claude:short']?.length ?? 0) === afterInitial + 1,
        'first completion records before the queued refresh settles');
        let rows = historyWindows()['claude:short'];
        assert(rows.at(-1)[1] === 24,
            'the first completion records its exact Claude percentage');

        state.short = 31;
        const secondHeld = state.held;
        state.held = null;
        reply(secondHeld);
        server.unpause_message(secondHeld);
        await waitFor(() => (historyWindows()['claude:short']?.length ?? 0) ===
            afterInitial + 2, 'queued completion records a second sample');
        rows = historyWindows()['claude:short'];
        assert(rows.at(-2)[1] === 24 && rows.at(-1)[1] === 31 &&
            rows.at(-2)[0] < rows.at(-1)[0],
        'queued refresh samples preserve value and timestamp order');
        const indicator = Main.panel.statusArea[UUID];
        indicator.menu.open();
        await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
            'usage popup shows the history chart');
        const legend = labels(indicator.menu.actor, []);
        assert(legend.includes('Claude 5-hour') && legend.includes('Claude weekly'),
            'chart legend names both Claude series');
        let previousRange = findActor(indicator.menu.actor,
            'history-range-previous');
        let nextRange = findActor(indicator.menu.actor, 'history-range-next');
        assert(findActor(indicator.menu.actor, 'history-range-value').text === '6h' &&
            previousRange.get_accessible_name() === 'Previous history range' &&
            nextRange.get_accessible_name() === 'Next history range',
        'the default range uses two accessible arrow buttons around its value');

        const historyBeforeDisplayChange = historyText();
        const requestsBeforeDisplayChange = state.requests;
        findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'usage-display-choice'),
            'settings exposes the usage-display choice');
        const displayChoice = findActor(indicator.menu.actor, 'usage-display-choice');
        assert(displayChoice.get_accessible_name() === 'Usage display, Used',
            'history starts in the canonical Used presentation');
        displayChoice.emit('clicked', 1);
        await waitFor(() => extension.getSurfaceSnapshot().preferences.usageDisplay.id ===
            'left', 'Left preference applies');
        assert(state.requests === requestsBeforeDisplayChange,
            'changing display basis does not request provider data');
        findActor(indicator.menu.actor, 'back-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
            'Left history chart is visible');
        const rawClaude = extension.getSurfaceSnapshot().providers
            .find(provider => provider.id === 'claude');
        assert(rawClaude.metrics[0].percent === 31 &&
            rawClaude.metrics[1].percent === 37,
        'the public snapshot remains canonical Used data');
        const leftLabels = labels(indicator.menu.actor, []).join(' ');
        const shortProgress = findActor(indicator.menu.actor, 'progress-claude--short');
        assert(leftLabels.includes('69%') && leftLabels.includes('63%') &&
            leftLabels.includes('55%'),
        'current cards show every Left complement');
        const shortFill = findActor(shortProgress, 'progress-fill-claude--short');
        const shortPace = findActor(shortProgress, 'pace-claude--short');
        assert(shortProgress.width === shortProgress.get_parent().width,
            'current progress track spans the full metric row');
        assert(shortFill.width === 246,
            'current progress geometry uses the Left complement');
        assert(shortPace?.x === 354 &&
            shortProgress.get_accessible_name() ===
                'Claude 5-hour window at 69 percent left; Time pace 100 percent left',
        'current progress accessibility and Time pace name the Left complement');
        assert(findActor(indicator.menu.actor, 'pace-claude--weekly') &&
            findActor(indicator.menu.actor,
                'pace-history-eligibility-companion--weekly'),
        'every current duration-bearing bar renders a Time pace marker');
        assert(findActor(indicator.menu.actor, 'history-chart').get_accessible_name() ===
            'Usage history for 6h, percentage left, from zero to one hundred percent',
        'the composed chart names its Left data basis');
        assert(historyText() === historyBeforeDisplayChange,
            'changing display basis leaves durable canonical history byte-identical');
        await captureActor(() => indicator.menu.actor, LEFT_CAPTURE);

        const historyBeforeRangeInteraction = historyText();
        const requestsBeforeRangeInteraction = state.requests;
        const rangeSettings = extension.getSettings();
        let rangeChanges = 0;
        const rangeChangedId = rangeSettings.connect(
            'changed::history-range', () => rangeChanges++);
        const reopenUsagePopup = async () => {
            indicator.menu.open();
            await waitFor(() => indicator.menu.isOpen &&
                findActor(indicator.menu.actor, 'history-range-stepper')?.is_mapped(),
            'usage popup reopens with its mapped range stepper');
            previousRange = findActor(indicator.menu.actor,
                'history-range-previous');
            nextRange = findActor(indicator.menu.actor, 'history-range-next');
        };

        await captureActor(() => indicator.menu.actor, RANGE_CAPTURES.dark);

        const originalScheme = Main.sessionMode.colorScheme;
        setShellColorScheme('prefer-light');
        await Scripting.sleep(150);
        await reopenUsagePopup();
        await captureActor(() => indicator.menu.actor, RANGE_CAPTURES.light);

        setShellColorScheme(originalScheme);
        await Scripting.sleep(150);
        await reopenUsagePopup();
        const historySection = findActor(indicator.menu.actor, 'history-section');
        const isolatedForScale = [
            findActor(indicator.menu.actor, 'provider-card-claude'),
            findActor(indicator.menu.actor,
                'provider-card-history-eligibility-companion'),
            ...historySection.get_children().slice(1),
        ].filter(Boolean);
        for (const actor of isolatedForScale)
            {actor.hide();}
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const originalScale = themeContext.scale_factor;
        themeContext.set_scale_factor(2);
        await Scripting.sleep(150);
        indicator.menu.close();
        await waitFor(() => !indicator.menu.isOpen,
            'usage popup closes before the scaled-state allocation');
        await reopenUsagePopup();
        await captureActor(() => indicator.menu.actor, RANGE_CAPTURES.scaled, 8,
            SCALED_POPUP_BOUNDS);
        themeContext.set_scale_factor(originalScale);
        for (const actor of isolatedForScale)
            {actor.show();}
        await Scripting.sleep(150);
        indicator.menu.close();
        await waitFor(() => !indicator.menu.isOpen,
            'scaled selector resets when the panel closes');

        await reopenUsagePopup();
        previousRange.emit('clicked', 1);
        await waitFor(() => extension.getSurfaceSnapshot().preferences
            .historyRange.id === '1h', 'previous arrow selects the 1-hour range');
        previousRange = findActor(indicator.menu.actor,
            'history-range-previous');
        assert(rangeSettings.get_enum('history-range') === 0 &&
            indicator.menu.isOpen && global.stage.get_key_focus() === previousRange &&
            findActor(indicator.menu.actor, 'history-chart'),
        'previous selection persists and restores focus without closing the popup');

        previousRange.emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'history-empty'),
            'wrapping to the uncovered 30-day range shows the empty state');
        nextRange = findActor(indicator.menu.actor, 'history-range-next');
        assert(rangeSettings.get_enum('history-range') === 4 &&
            extension.getSurfaceSnapshot().preferences.historyRange.id === '30d' &&
            !findActor(indicator.menu.actor, 'history-chart') &&
            nextRange,
        'the uncovered range persists and keeps both arrows available');

        nextRange.emit('clicked', 1);
        await waitFor(() => extension.getSurfaceSnapshot().preferences
            .historyRange.id === '1h', 'next arrow wraps to the 1-hour range');
        nextRange = findActor(indicator.menu.actor, 'history-range-next');
        nextRange.emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'history-chart'),
            'switching back to a covered range restores the chart');
        nextRange = findActor(indicator.menu.actor, 'history-range-next');
        assert(rangeSettings.get_enum('history-range') === 1 &&
            extension.getSurfaceSnapshot().preferences.historyRange.id === '6h' &&
            rangeChanges === 4 && indicator.menu.isOpen &&
            global.stage.get_key_focus() === nextRange,
        'restored range persists and preserves arrow focus ownership');
        assert(state.requests === requestsBeforeRangeInteraction &&
            historyText() === historyBeforeRangeInteraction,
        'all range interactions preserve provider requests and history bytes');
        rangeSettings.disconnect(rangeChangedId);

        findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'toggle-showUsageHistory'),
            'settings view exposes the local-history toggle');
        findActor(indicator.menu.actor, 'toggle-showUsageHistory').emit('clicked', 1);
        await Scripting.sleep(100);
        findActor(indicator.menu.actor, 'back-button').emit('clicked', 1);
        await waitFor(() => findActor(indicator.menu.actor, 'provider-card-claude'),
            'return to the usage view');
        assert(!findActor(indicator.menu.actor, 'history-chart'),
            'disabling local history removes the chart');
        assert(findActor(indicator.menu.actor, 'provider-card-claude'),
            'the current-value provider card stays live');
    } finally {
        if (process)
            {stopClaude(process);}
        if (state.held) {
            reply(state.held);
            server.unpause_message(state.held);
        }
        removeCompanion?.();
        server.disconnect();
    }
}
