import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {CatalogState} from './catalog-state.js';
import {buildCatalogPanel, updateCatalogPanelIcons} from './catalog-panel.js';
import {buildCatalogSettingsView} from './catalog-settings-view.js';
import {buildCatalogUsageView} from './catalog-usage-view.js';
import {HISTORY_RANGES} from './shared/history-ranges.js';
import {validateTokens} from './shared/token-geometry.js';

function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/tokens.json`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded) {
        throw new Error('Unable to load packaged design tokens');
    }
    try {
        return validateTokens(JSON.parse(new TextDecoder().decode(contents)));
    } catch (error) {
        throw new Error(`Unable to parse packaged design tokens: ${error.message}`);
    }
}

export default class CloudexUsageCatalogExtension extends Extension {
    enable() {
        this._tokens = loadTokens(this.path);
        this._state = new CatalogState(HISTORY_RANGES);
        this._panelSignature = null;
        this._colorSchemeChangedId = St.Settings.get().connect(
            'notify::color-scheme', () => this._render());

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._indicator.add_style_class_name('cloudex-indicator');
        this._indicator.set_accessible_name('Cloudex Usage');

        this._panelHost = new St.Bin({name: 'cloudex-panel-host'});
        this._indicator.add_child(this._panelHost);

        this._menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'cloudex-menu-item',
        });
        this._popoverHost = new St.Bin({name: 'cloudex-popover-host'});
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
        this._panelSignature = null;
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
        const lightPanel = Main.sessionMode.colorScheme === 'prefer-light';
        const panelSignature = ['quiet-utility', snapshot.showClaudeShort,
            snapshot.showClaudeWeekly, snapshot.showCodexWeekly, lightPanel].join(':');
        if (panelSignature !== this._panelSignature) {
            const panel = buildCatalogPanel({
                extensionPath: this.path,
                tokens: this._tokens,
                lightPanel,
            });
            this._replaceChild(this._panelHost, panel);
            panel.show();
            this._panelHost.queue_relayout();
            this._indicator.queue_relayout();
            Main.panel.queue_relayout();
            this._panelSignature = panelSignature;
        }
        updateCatalogPanelIcons(this._panelHost.get_child(), this.path, lightPanel);
        this._indicator.queue_relayout();
        Main.panel.queue_relayout();

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
            cycleRange: () => {
                this._state.cycleRange();
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
            cycleWeeklyPace: () => {
                this._state.cycleWeeklyPace();
                this._render();
            },
            refresh: () => this._render(),
        };

        const popover = snapshot.view === 'settings'
            ? buildCatalogSettingsView({state: snapshot, tokens: this._tokens,
                actions, showPreviewControls: false})
            : buildCatalogUsageView({state: snapshot, extensionPath: this.path,
                tokens: this._tokens, actions, showPreviewControls: false});
        this._replaceChild(this._popoverHost, popover);
    }
}
