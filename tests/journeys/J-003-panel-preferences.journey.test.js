import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area',
    'screenshot_area_finish');

const UUID = 'claudex-usage@hugo.local';
const CAPTURES = [
    'surface-settings-dark-100.png',
    'surface-settings-toggle-off-focus-hover.png',
    'surface-settings-cadence-focus-hover.png',
    'surface-settings-light-100.png',
];

export const METRICS = {};
export function init() {}

function assert(condition, message) {
    if (!condition)
        throw new Error(`J-003 failed: ${message}`);
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

function findClass(root, fragment) {
    if (!root)
        return null;
    if ((root.style_class ?? '').includes(fragment))
        return root;
    for (const child of root.get_children?.() ?? []) {
        const found = findClass(child, fragment);
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
    return Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent()
        .get_child('design').get_child('captures');
}

async function captureActor(actor, filename) {
    const directory = captureDirectory();
    if (!directory.query_exists(null))
        directory.make_directory_with_parents(null);
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const stream = directory.get_child(filename).replace(null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    await screenshot.screenshot_area(Math.max(0, Math.floor(x - 8)),
        Math.max(0, Math.floor(y - 8)), Math.ceil(width + 16), Math.ceil(height + 16), stream);
    stream.close(null);
}

async function settle() {
    await Scripting.sleep(260);
}

function provider({id, order, label, detail, windows, readings}) {
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
        windows,
        isEligible: () => true,
        subscribeEligibility: callback => {
            listener = callback;
            return () => {
                listener = null;
            };
        },
        refresh: async () => ({status: 'available', readings}),
    };
}

function registerFixtures(extension) {
    return [
        extension.registerProvider(provider({
            id: 'claude', order: 0, label: 'Claude', detail: 'Two usage windows',
            windows: [
                {id: 'short', label: '5-hour window', dataRole: 'dataClaudeShort'},
                {id: 'weekly', label: 'Weekly window', dataRole: 'dataClaudeWeekly'},
            ],
            readings: [
                {id: 'short', percent: 8, resetAtMs: Date.now() + 3 * 3600000},
                {id: 'weekly', percent: 68, resetAtMs: Date.now() + 4 * 86400000},
            ],
        })),
        extension.registerProvider(provider({
            id: 'codex', order: 1, label: 'Codex', detail: 'Weekly usage window',
            windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
            readings: [{id: 'weekly', percent: 42, resetAtMs: Date.now() + 4 * 86400000}],
        })),
    ];
}

function preferences(snapshot) {
    return snapshot.preferences;
}

async function writePhase(extension, indicator) {
    indicator.menu.open();
    await settle();
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    let popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(popover?.is_mapped() && collectLabelText(popover).includes('Settings'),
        'gear opens the in-place settings view');
    assert(!findActor(popover, 'history-chart') &&
        !collectLabelText(popover).includes('Keep local usage history'),
        'settings omits deferred history controls');
    await captureActor(indicator.menu.actor, CAPTURES[0]);
    findActor(popover, 'back-button').emit('clicked', 1);
    await settle();
    assert(indicator.menu.isOpen && collectLabelText(indicator.menu.actor).includes('USAGE'),
        'back returns to usage without closing the same popup');
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');

    findActor(popover, 'toggle-showClaudeShort').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    findActor(popover, 'toggle-showClaudeWeekly').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const panel = findActor(indicator, 'claudex-live-panel');
    assert(indicator.menu.isOpen && !collectLabelText(panel).join(' ').includes('8%') &&
        !collectLabelText(panel).join(' ').includes('68%') &&
        collectLabelText(panel).join(' ').includes('42%') && findClass(panel, 'muted'),
    'visibility updates panel immediately and preserves a muted Claude mark');
    findActor(popover, 'toggle-showCodexWeekly').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(!collectLabelText(findActor(indicator, 'claudex-live-panel')).join(' ').match(/\d+%/) &&
        findClass(findActor(indicator, 'claudex-live-panel'), 'muted'),
    'all hidden limits retain muted eligible-provider marks without metrics');
    findActor(popover, 'toggle-showCodexWeekly').emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    const toggle = findActor(popover, 'toggle-showClaudeWeekly');
    toggle.add_style_pseudo_class('hover');
    toggle.grab_key_focus();
    await captureActor(indicator.menu.actor, CAPTURES[1]);
    toggle.remove_style_pseudo_class('hover');

    const choice = findActor(popover, 'refresh-interval-choice');
    choice.emit('clicked', 1);
    await settle();
    popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(preferences(extension.getSurfaceSnapshot()).refreshInterval.ms === 600000 &&
        collectLabelText(popover).some(text => text.includes('10 min')),
    'cadence choice persists and applies to the live controller');
    const focusedChoice = findActor(popover, 'refresh-interval-choice');
    focusedChoice.add_style_pseudo_class('hover');
    focusedChoice.grab_key_focus();
    await captureActor(indicator.menu.actor, CAPTURES[2]);
    focusedChoice.remove_style_pseudo_class('hover');

    const scheme = Main.sessionMode.colorScheme;
    Main.sessionMode.colorScheme = 'prefer-light';
    St.Settings.get().notify('color-scheme');
    await settle();
    await captureActor(indicator.menu.actor, CAPTURES[3]);
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}

async function readPhase(extension, indicator) {
    const snapshot = extension.getSurfaceSnapshot();
    assert(preferences(snapshot).visibility.dataClaudeShort === false &&
        preferences(snapshot).visibility.dataClaudeWeekly === false &&
        preferences(snapshot).visibility.dataCodexWeekly === true &&
        preferences(snapshot).refreshInterval.ms === 600000,
    'fresh Shell restores every persisted preference');
    const panel = findActor(indicator, 'claudex-live-panel');
    assert(!collectLabelText(panel).join(' ').includes('8%') &&
        !collectLabelText(panel).join(' ').includes('68%') && findClass(panel, 'muted'),
    'restored settings control the new session panel');
    indicator.menu.open();
    await settle();
    findActor(indicator.menu.actor, 'settings-button').emit('clicked', 1);
    await settle();
    const popover = findActor(indicator.menu.actor, 'claudex-live-popover');
    assert(collectLabelText(popover).some(text => text.includes('10 min')) &&
        findActor(popover, 'toggle-showClaudeShort').checked === false &&
        findActor(popover, 'toggle-showClaudeWeekly').checked === false,
    'restored settings are rendered in the fresh popup');
}

export async function run() {
    await settle();
    const extension = Main.extensionManager.lookup(UUID)?.stateObj;
    assert(extension, 'production extension is enabled');
    const removers = registerFixtures(extension);
    await settle();
    const indicator = Main.panel.statusArea[UUID];
    assert(indicator, 'eligible providers create the surface');
    if (GLib.getenv('CLAUDEX_J003_PHASE') === 'restore')
        await readPhase(extension, indicator);
    else
        await writePhase(extension, indicator);
    removers.forEach(remove => remove());
}
