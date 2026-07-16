import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {CatalogState, validateTokens} from './catalog-state.js';
import {
    PanelIndicator,
    SettingsPopover,
    UsagePopover,
} from './primitives.js';

function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/tokens.json`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded)
        throw new Error('Unable to load packaged design tokens');

    let tokens;
    try {
        tokens = JSON.parse(new TextDecoder().decode(contents));
    } catch (error) {
        throw new Error(`Unable to parse packaged design tokens: ${error.message}`);
    }
    return validateTokens(tokens);
}

export default class ClaudexUsageCatalogExtension extends Extension {
    enable() {
        this._tokens = loadTokens(this.path);
        this._state = new CatalogState();
        this._colorSchemeChangedId = St.Settings.get().connect(
            'notify::color-scheme', () => this._render());

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._indicator.add_style_class_name('claudex-indicator');
        this._indicator.set_accessible_name('Claudex Usage');

        this._panelHost = new St.Bin({name: 'claudex-panel-host'});
        this._indicator.add_child(this._panelHost);

        this._menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'claudex-menu-item',
        });
        this._popoverHost = new St.Bin({name: 'claudex-popover-host'});
        this._menuItem.add_child(this._popoverHost);
        this._indicator.menu.addMenuItem(this._menuItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._render();
    }

    disable() {
        if (this._colorSchemeChangedId) {
            St.Settings.get().disconnect(this._colorSchemeChangedId);
            this._colorSchemeChangedId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._panelHost = null;
        this._popoverHost = null;
        this._menuItem = null;
        this._state = null;
        this._tokens = null;
    }

    getCatalogSnapshot() {
        return this._state?.snapshot() ?? null;
    }

    getCatalogActors() {
        return {
            indicator: this._indicator,
            panel: this._panelHost?.get_child() ?? null,
            popover: this._popoverHost?.get_child() ?? null,
        };
    }

    _replaceChild(host, child) {
        host.get_child()?.destroy();
        host.set_child(child);
    }

    _render() {
        const snapshot = this._state.snapshot();
        this._replaceChild(this._panelHost, PanelIndicator({
            state: snapshot,
            extensionPath: this.path,
            tokens: this._tokens,
            lightPanel: Main.sessionMode.colorScheme === 'prefer-light',
        }));

        const actions = {
            openSettings: () => {
                this._state.setView('settings');
                this._render();
            },
            openUsage: () => {
                this._state.setView('usage');
                this._render();
            },
            selectRange: range => {
                this._state.selectRange(range);
                this._render();
            },
            toggle: key => {
                this._state.toggle(key);
                this._render();
            },
            cycleRefreshInterval: () => {
                this._state.cycleRefreshInterval();
                this._render();
            },
            refresh: () => this._render(),
        };

        const popover = snapshot.view === 'settings'
            ? SettingsPopover({state: snapshot, tokens: this._tokens, actions})
            : UsagePopover({
                state: snapshot,
                extensionPath: this.path,
                tokens: this._tokens,
                actions,
            });
        this._replaceChild(this._popoverHost, popover);
    }
}
