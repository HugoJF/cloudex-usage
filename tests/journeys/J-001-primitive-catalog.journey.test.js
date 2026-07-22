import Atk from 'gi://Atk';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import {captureActor as capture} from './capture-actor.js';

const UUID = 'cloudex-usage-design@hugo.local';
const EXPECTED_CAPTURES = [
    'catalog-panel-dark-100.png',
    'catalog-popup-dark-100.png',
    'catalog-settings-dark-100.png',
    'catalog-panel-disabled.png',
    'catalog-panel-light-100.png',
    'catalog-panel-dark-200.png',
];

export const METRICS = {};

export function init() {
    console.log('J-001: automation module loaded');
}

function assert(condition, message) {
    if (!condition)
        {throw new Error(`J-001 failed: ${message}`);}
}

function findActor(root, name) {
    if (!root)
        {return null;}
    if (root.get_name?.() === name)
        {return root;}
    for (const child of root.get_children?.() ?? []) {
        const found = findActor(child, name);
        if (found)
            {return found;}
    }
    return null;
}

function collectLabelText(root, result = []) {
    if (!root)
        {return result;}
    if (root instanceof St.Label)
        {result.push(root.text);}
    for (const child of root.get_children?.() ?? [])
        {collectLabelText(child, result);}
    return result;
}

async function settle() {
    await Scripting.sleep(180);
}

const captureActor = (target, filename, padding = 8, useAllocation = false) =>
    capture({target, filename, padding, useAllocation, assert});

function click(actor, description) {
    assert(actor, `${description} actor exists`);
    actor.emit('clicked', 1);
}

function setShellColorScheme(scheme) {
    Main.sessionMode.colorScheme = scheme;
    St.Settings.get().notify('color-scheme');
}

export async function run() {
    console.log('J-001: journey started');
    await settle();

    const extension = Main.extensionManager.lookup(UUID);
    assert(extension?.stateObj, 'catalog extension is installed and enabled');
    const catalog = extension.stateObj;
    {
        let actors = catalog.getCatalogActors();
        assert(actors.panel.height <= Main.panel.height,
            'Quiet Utility stays within native panel height');
        assert(collectLabelText(actors.panel).join(' ').includes('8% · 68%'),
            'Quiet Utility shows compact Claude percentages');
        await captureActor(() => catalog.getCatalogActors().panel,
            EXPECTED_CAPTURES[0], 6, true);
        await settle();

        actors.indicator.menu.open();
        await settle();
        actors = catalog.getCatalogActors();
        const refresh = findActor(actors.popover, 'refinement-refresh-button');
        assert(refresh?.get_accessible_name() === 'Refresh usage',
            'Quiet Utility exposes accessible refresh');
        assert(findActor(actors.popover, 'refinement-range-select')
            ?.accessible_role === Atk.Role.COMBO_BOX,
        'Quiet Utility exposes one compact range control');
        refresh.add_style_pseudo_class('hover');
        refresh.grab_key_focus();
        await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[1]);
        refresh.remove_style_pseudo_class('hover');

        click(findActor(actors.popover, 'settings-button'), 'settings');
        await settle();
        actors = catalog.getCatalogActors();
        const pace = findActor(actors.popover, 'toggle-timePace');
        assert(pace?.checked, 'Time pace is enabled by default');
        pace.add_style_pseudo_class('hover');
        pace.grab_key_focus();
        await captureActor(actors.indicator.menu.actor, EXPECTED_CAPTURES[2]);
        click(findActor(actors.popover, 'toggle-showClaudeShort'),
            'Claude short visibility');
        await settle();
        await captureActor(() => catalog.getCatalogActors().panel,
            EXPECTED_CAPTURES[3], 6, true);

        const originalScheme = Main.sessionMode.colorScheme;
        setShellColorScheme('prefer-light');
        await settle();
        await captureActor(() => catalog.getCatalogActors().panel,
            EXPECTED_CAPTURES[4], 6, true);
        setShellColorScheme(originalScheme);
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const originalScale = themeContext.scale_factor;
        themeContext.set_scale_factor(2);
        await settle();
        await captureActor(() => catalog.getCatalogActors().panel,
            EXPECTED_CAPTURES[5], 6, true);
        themeContext.set_scale_factor(originalScale);
        catalog.disable();
        await settle();
        assert(!Main.panel.statusArea[UUID], 'disable removes Quiet Utility');
        catalog.enable();
        await settle();
        assert(Main.panel.statusArea[UUID], 'Quiet Utility enables again');
    }
}
