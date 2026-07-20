import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');

const UUID = 'claudex-usage@hugo.local';
const EXPECTED_CAPTURES = [
    'surface-panel-dark-100.png',
    'surface-popup-dark-100.png',
    'surface-refresh-focus-hover.png',
    'surface-unavailable-popup.png',
    'surface-panel-light-100.png',
    'surface-panel-dark-200.png',
];

export const METRICS = {};

export function init() {
    console.log('J-002: automation module loaded');
}

function assert(condition, message) {
    if (!condition)
        throw new Error(`J-002 failed: ${message}`);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

function findActor(root, name) {
    if (!root)
        return null;
    if (root.get_name?.() === name)
        return root;
    for (const child of root.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found)
            return found;
    }
    return null;
}

function collectLabelText(root, result = []) {
    if (!root)
        return result;
    if (root instanceof St.Label)
        result.push(root.text);
    for (const child of root.get_children?.() ?? [])
        collectLabelText(child, result);
    return result;
}

function captureDirectory() {
    const override = GLib.getenv('CLAUDEX_CAPTURE_DIR');
    if (override)
        return Gio.File.new_for_path(override);
    const repo = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent();
    return repo.get_child('design').get_child('captures');
}

async function captureActor(target, filename, padding = 8) {
    let actor = null;
    let actorWidth = 0;
    let actorHeight = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
        actor = typeof target === 'function' ? target() : target;
        if (actor?.is_mapped())
            [actorWidth, actorHeight] = actor.get_transformed_size();
        if (actorWidth > 0 && actorHeight > 0)
            break;
        await Scripting.sleep(50);
    }
    assert(actor?.is_mapped(), `${filename} actor is not mapped`);
    assert(actorWidth > 0 && actorHeight > 0,
        `${filename} actor has no allocated geometry`);
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        directory.make_directory_with_parents(null);
    const [actorX, actorY] = actor.get_transformed_position();
    const x = Math.max(0, Math.floor(actorX - padding));
    const y = Math.max(0, Math.floor(actorY - padding));
    const width = Math.min(global.screen_width - x, Math.ceil(actorWidth + padding * 2));
    const height = Math.min(global.screen_height - y, Math.ceil(actorHeight + padding * 2));
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(x, y, width, height, stream);
    stream.close(null);
}

async function settle() {
    await Scripting.sleep(260);
}

function setShellColorScheme(scheme) {
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}

function readFileText(file) {
    const [loaded, bytes] = file.load_contents(null);
    assert(loaded, `${file.get_path()} loads`);
    return new TextDecoder('utf-8').decode(bytes);
}

function usageProvider({id, order, label, detail, window, reading, refresh}) {
    let eligible = true;
    let listener = null;
    return {
        id,
        order,
        label,
        detail,
        marks: {
            darkPanel: `icons/${id}.svg`,
            lightPanel: `icons/${id}-light.svg`,
            popup: `icons/${id}.svg`,
            accessibleName: `${label} mark`,
        },
        windows: [window],
        isEligible: () => eligible,
        subscribeEligibility: callback => {
            listener = callback;
            return () => {
                listener = null;
            };
        },
        refresh: refresh ?? (async () => ({status: 'available', readings: [reading()]})),
        setEligible(value) {
            eligible = value;
            listener?.(value);
        },
    };
}

export async function run() {
    await settle();
    const record = Main.extensionManager.lookup(UUID);
    const extension = record?.stateObj;
    assert(extension, 'production extension is installed and enabled');
    assert(!Main.panel.statusArea[UUID], 'provider-free production package has no panel item');
    assert(extension.getSurfaceSnapshot().visible === false,
        'provider-free production package schedules no visible work');

    const productionClock = extension._now;
    let nowMs = Math.floor(Date.now() / 60000) * 60000 + 5000;
    extension._now = () => nowMs;
    try {
    let claudePercent = 8;
    let claudeReset = nowMs + 3 * 60 * 60 * 1000 + 50 * 60 * 1000;
    let claudeDeferred = null;
    let claudeCalls = 0;
    const claude = usageProvider({
        id: 'claude',
        order: 0,
        label: 'Claude',
        detail: '5-hour usage window',
        window: {
            id: 'short',
            label: '5-hour window',
            dataRole: 'dataClaudeShort',
            durationMs: 5 * 60 * 60 * 1000,
        },
        reading: () => ({id: 'short', percent: claudePercent, resetAtMs: claudeReset}),
        refresh: () => {
            claudeCalls++;
            return claudeDeferred?.promise ?? Promise.resolve({
                status: 'available',
                readings: [{id: 'short', percent: claudePercent, resetAtMs: claudeReset}],
            });
        },
    });
    claude.setEligible(false);
    let codexUnavailable = false;
    let codexPercent = 41;
    let codexCalls = 0;
    const codex = usageProvider({
        id: 'codex',
        order: 1,
        label: 'Codex',
        detail: 'Weekly usage window',
        window: {
            id: 'weekly',
            label: 'Weekly window',
            dataRole: 'dataCodexWeekly',
            durationMs: 7 * 24 * 60 * 60 * 1000,
        },
        reading: () => ({id: 'weekly', percent: codexPercent,
            resetAtMs: nowMs + 4 * 86400000}),
        refresh: () => {
            codexCalls++;
            return codexUnavailable
                ? Promise.reject(new Error('provider response deliberately hidden'))
                : Promise.resolve({status: 'available', readings: [{
                    id: 'weekly', percent: codexPercent,
                    resetAtMs: nowMs + 4 * 86400000,
                }]});
        },
    });
    const removeClaude = extension.registerProvider(claude);
    const removeCodex = extension.registerProvider(codex);
    await settle();
    assert(codexCalls === 1 && claudeCalls === 0,
        'the initially eligible provider settles before Claude appears');
    codexPercent = 42;
    claude.setEligible(true);
    await settle();

    let indicator = Main.panel.statusArea[UUID];
    assert(indicator, 'eligible stubs create one unified panel item');
    const snapshot = extension.getSurfaceSnapshot();
    assert(snapshot.providers.length === 2 && snapshot.providers.every(item =>
        item.availability === 'available'), 'both provider results settle independently');
    assert(claudeCalls === 1 && codexCalls === 2 &&
        snapshot.providers.find(item => item.id === 'codex')?.metrics[0]?.percent === 42,
    'new Claude eligibility immediately runs one full shared refresh cycle');
    const panel = findActor(indicator, 'claudex-live-panel');
    assert(panel.height <= Main.panel.height, 'unified panel stays at native height');
    assert(collectLabelText(panel).join(' ').includes('8%') &&
        collectLabelText(panel).join(' ').includes('42%'),
    'panel exposes both textual percentages');
    const shortPanelValue = findActor(panel, 'panel-value-claude--short');
    const weeklyPanelValue = findActor(panel, 'panel-value-codex--weekly');
    assert(shortPanelValue.has_style_class_name('muted') &&
        shortPanelValue.get_accessible_name() ===
            '5-hour window, 8 percent used' &&
        !weeklyPanelValue.has_style_class_name('muted') &&
        weeklyPanelValue.get_accessible_name() ===
            'Weekly window, 42 percent used',
    'panel mutes only the short window and names each window accessibly');
    await captureActor(panel, EXPECTED_CAPTURES[0], 6);

    indicator.menu.open();
    await settle();
    assert(indicator.menu.isOpen, 'Shell popup menu opens before capture');
    let popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(popover?.is_mapped(), 'usage popup maps before capture');
    let text = collectLabelText(popover);
    for (const expected of ['Claude', 'Codex', '5-hour window', 'Weekly window',
        '8%', '42%', 'Resets in']) {
        assert(text.some(value => value.includes(expected)), `popup includes ${expected}`);
    }
    assert(!text.includes('5-hour usage window') &&
        !text.includes('Weekly usage window'),
    'provider cards omit redundant provider detail');
    const fill = findActor(popover, 'progress-fill-claude--short');
    assert(fill.width === 25, 'percentage uses the canonical zero-origin bar geometry');
    assert(fill.get_parent().accessible_role === Atk.Role.PROGRESS_BAR,
        'usage bar has a progress accessibility role');
    const initialShortProgress = findActor(popover, 'progress-claude--short');
    const initialShortPace = findActor(popover, 'pace-claude--short');
    const initialCodexPace = findActor(popover, 'pace-codex--weekly');
    assert(initialShortPace.x === 73 && initialCodexPace.x === 134 &&
        initialShortProgress.get_accessible_name() ===
            'Claude 5-hour window at 8 percent used; Time pace 23 percent used',
    'every duration-bearing bar shows its neutral elapsed-time marker');
    const refresh = findActor(popover, 'refresh-button');
    const settings = findActor(popover, 'settings-button');
    const headerChildren = refresh.get_parent().get_children();
    assert(settings.get_parent() === refresh.get_parent() &&
        headerChildren.indexOf(refresh) + 1 === headerChildren.indexOf(settings),
    'refresh sits immediately before settings in the usage header');
    const footer = findActor(popover, 'footer-status');
    assert(footer && !findActor(footer.get_parent(), 'refresh-button'),
        'footer is status-only');
    const historyRoot = GLib.getenv('CLAUDEX_HISTORY_DIR');
    const defaultHistoryRoot = GLib.build_filenamev([
        GLib.get_user_data_dir(), 'claudex-usage',
    ]);
    assert(historyRoot && historyRoot !== defaultHistoryRoot &&
        findActor(popover, 'select-history-range') &&
        !findActor(popover, 'history-chart'),
    'surface fixture records uncovered history only inside its isolated store');
    const historyFile = Gio.File.new_for_path(historyRoot).get_child('history.json');
    let historyBeforeTick = readFileText(historyFile);
    await captureActor(indicator.menu.actor, EXPECTED_CAPTURES[1]);

    claudeDeferred = deferred();
    refresh.emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const refreshButton = findActor(popover, 'refresh-button');
    assert(refreshButton.get_child().icon_name === 'process-working-symbolic' &&
        refreshButton.get_accessible_name() === 'Refreshing usage' &&
        refreshButton.has_style_class_name('busy') &&
        refreshButton.get_accessible().ref_state_set()
            .contains_state(Atk.StateType.BUSY) &&
        findActor(popover, 'footer-status').text === 'Updated just now' &&
        !collectLabelText(popover).includes('Refreshing…'),
    'manual refresh swaps the header icon to its accessible busy state');
    refreshButton.add_style_pseudo_class('hover');
    refreshButton.grab_key_focus();
    await captureActor(indicator.menu.actor, EXPECTED_CAPTURES[2]);
    refreshButton.remove_style_pseudo_class('hover');
    claudePercent = 28;
    claudeReset = nowMs + 56 * 60 * 1000;
    claudeDeferred.resolve({status: 'available', readings: [
        {id: 'short', percent: claudePercent, resetAtMs: claudeReset},
    ]});
    claudeDeferred = null;
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(indicator.menu.isOpen && collectLabelText(popover).includes('Updated just now'),
        'manual refresh updates values and freshness without closing the popup');
    assert(collectLabelText(popover).includes('28%'), 'manual refresh changes visible values');
    const idleRefresh = findActor(popover, 'refresh-button');
    assert(idleRefresh.get_child().icon_name === 'view-refresh-symbolic' &&
        idleRefresh.get_accessible_name() === 'Refresh usage' &&
        !idleRefresh.has_style_class_name('busy') &&
        !idleRefresh.get_accessible().ref_state_set()
            .contains_state(Atk.StateType.BUSY),
    'refresh completion restores the idle icon state');
    const refreshedShortProgress = findActor(popover, 'progress-claude--short');
    const refreshedShortPace = findActor(popover, 'pace-claude--short');
    assert(refreshedShortPace.x === 256 &&
        refreshedShortProgress.get_accessible_name() ===
            'Claude 5-hour window at 28 percent used; Time pace 81 percent used',
    'fresh reset timing updates Time pace geometry and accessibility');

    const rangeTrigger = findActor(popover, 'select-history-range');
    rangeTrigger.emit('clicked', 1);
    const rangeOptions = findActor(popover, 'select-history-range-options');
    const selectedOption = findActor(popover, 'select-history-range-option-6h');
    assert(rangeOptions.visible && global.stage.get_key_focus() === selectedOption,
        'history select is open with its selected option focused before the tick');
    historyBeforeTick = readFileText(historyFile);
    const callsBeforeTick = [claudeCalls, codexCalls];
    const sourceBeforeTick = extension._presentationSourceId;
    assert(sourceBeforeTick !== null && GLib.Source.remove(sourceBeforeTick),
        'the real presentation source is owned before deterministic replacement');
    extension._presentationSourceId = null;
    nowMs += 61_000;
    assert(extension._runPresentationTick() === GLib.SOURCE_REMOVE,
        'the exact production presentation callback removes its fired source');
    const sourceAfterTick = extension._presentationSourceId;
    assert(sourceAfterTick !== null && sourceAfterTick !== sourceBeforeTick &&
        findActor(popover, 'footer-status').text === 'Updated 1 min ago' &&
        findActor(popover, 'reset-label-claude--short').text === 'Resets in 55 mins',
    'one realigned tick advances freshness and reset copy');
    assert(findActor(popover, 'pace-claude--short') === refreshedShortPace &&
        refreshedShortPace.x === 257 &&
        refreshedShortProgress.get_accessible_name() ===
            'Claude 5-hour window at 28 percent used; Time pace 82 percent used',
    'presentation tick moves the same Time pace actor and advances its accessibility');
    assert(findActor(popover, 'select-history-range') === rangeTrigger &&
        findActor(popover, 'select-history-range-options') === rangeOptions &&
        findActor(popover, 'select-history-range-option-6h') === selectedOption &&
        rangeOptions.visible && global.stage.get_key_focus() === selectedOption,
    'presentation tick preserves the open select actor tree and focused option');
    assert(JSON.stringify([claudeCalls, codexCalls]) === JSON.stringify(callsBeforeTick) &&
        readFileText(historyFile) === historyBeforeTick,
    'presentation tick requests no provider data and does not rewrite history');

    codexUnavailable = true;
    extension.refresh();
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const codexCard = findActor(popover, 'provider-card-codex');
    assert(collectLabelText(codexCard).includes('Usage unavailable'),
        'failed provider presents the unavailable treatment');
    assert(!collectLabelText(codexCard).some(value => value.includes('42%') ||
        value.startsWith('Resets')), 'unavailable card drops every stale metric');
    assert(!findActor(codexCard, 'pace-codex--weekly'),
        'unavailable provider drops its Time pace marker with the numeric bar');
    assert(collectLabelText(findActor(popover, 'provider-card-claude')).includes('28%'),
        'other provider remains live when one provider fails');
    await captureActor(indicator.menu.actor, EXPECTED_CAPTURES[3]);

    indicator.menu.close();
    assert(extension._presentationSourceId === null,
        'closing the usage popup removes the presentation source');
    const originalScheme = Main.sessionMode.colorScheme;
    setShellColorScheme('prefer-light');
    await settle();
    indicator = Main.panel.statusArea[UUID];
    await captureActor(findActor(indicator, 'claudex-live-panel'), EXPECTED_CAPTURES[4], 6);
    setShellColorScheme(originalScheme);
    await settle();
    const themeContext = St.ThemeContext.get_for_stage(global.stage);
    const originalScale = themeContext.scale_factor;
    themeContext.set_scale_factor(2);
    await settle();
    await captureActor(
        () => findActor(Main.panel.statusArea[UUID], 'claudex-live-panel'),
        EXPECTED_CAPTURES[5], 6);
    themeContext.set_scale_factor(originalScale);
    await settle();

    indicator.menu.open();
    await settle();
    assert(extension._presentationSourceId !== null,
        'reopening usage schedules one presentation source');
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    assert(extension._presentationSourceId === null,
        'settings view owns no presentation source');
    findActor(indicator.menu.actor, 'back-button').emit('clicked', 1);
    await settle();
    assert(extension._presentationSourceId !== null,
        'returning to visible usage restores one presentation source');
    indicator.menu.close();
    assert(extension._presentationSourceId === null,
        'closing the restored usage popup clears its source');

    claudeDeferred = deferred();
    extension.refresh();
    await settle();
    claude.setEligible(false);
    codex.setEligible(false);
    assert(!Main.panel.statusArea[UUID] && extension._presentationSourceId === null,
        'last provider ineligibility removes the item and presentation source');
    claudeDeferred.resolve({status: 'available', readings: [
        {id: 'short', percent: 99, resetAtMs: nowMs + 60000},
    ]});
    claudeDeferred = null;
    await settle();
    assert(!Main.panel.statusArea[UUID] && !extension.getSurfaceSnapshot().visible,
        'late completion cannot recreate an absent panel item');
    removeClaude();
    removeCodex();
    } finally {
        if (extension._presentationSourceId !== null) {
            GLib.Source.remove(extension._presentationSourceId);
            extension._presentationSourceId = null;
        }
        extension._now = productionClock;
    }
}
