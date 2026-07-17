import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {CatalogState, HISTORY, RANGES, USAGE} from './catalog-state.js';
import {validateTokens} from './shared/token-geometry.js';
import {
    ChoiceRow,
    FooterStatus,
    HistoryChart,
    IconButton,
    Legend,
    PanelIndicator,
    PopoverScaffold,
    ProviderCard,
    RangeSelector,
    SettingsRow,
} from './shared/primitives.js';

function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL, properties = {}) {
    return new St.BoxLayout({style_class: styleClass, orientation, ...properties});
}

function column(styleClass, properties = {}) {
    return box(styleClass, Clutter.Orientation.VERTICAL, properties);
}

function label(text, styleClass, properties = {}) {
    return new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...properties,
    });
}

function metricModel(usage) {
    return {
        ...usage,
        label: usage.window,
        resetLabel: usage.reset,
        accessibleName: `${usage.percent}% of ${usage.window} used`,
    };
}

function providerModel(id, labelText, detail, iconPath) {
    return {
        id,
        label: labelText,
        detail,
        iconPath,
        iconAccessibleName: `${labelText} mark`,
    };
}

function buildPanel({state, extensionPath, tokens, lightPanel}) {
    const iconPath = provider =>
        `${extensionPath}/icons/${provider}${lightPanel ? '-light' : ''}.svg`;
    const groups = [
        {
            id: 'claude',
            iconPath: iconPath('claude'),
            accessibleName: 'Claude',
            values: [
                state.showClaudeShort && {
                    id: 'claudeShort',
                    percent: USAGE.claudeShort.percent,
                },
                state.showClaudeWeekly && {
                    id: 'claudeWeekly',
                    percent: USAGE.claudeWeekly.percent,
                },
            ].filter(Boolean),
        },
        {
            id: 'codex',
            iconPath: iconPath('codex'),
            accessibleName: 'Codex',
            values: state.showCodexWeekly
                ? [{
                    id: 'codexWeekly',
                    percent: USAGE.codexWeekly.percent,
                }]
                : [],
        },
    ];
    return PanelIndicator({
        id: 'claudex-panel-indicator',
        groups,
        emptyGroups: groups.map(group => ({
            ...group,
            accessibleName: `${group.accessibleName} hidden`,
        })),
        tokens,
    });
}

function buildUsagePopover({state, extensionPath, tokens, actions}) {
    const header = box('selected-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const copy = column('selected-title-copy', {x_expand: true});
    copy.add_child(label('USAGE', 'selected-kicker'));
    copy.add_child(label('Claude + Codex', 'selected-title'));
    header.add_child(copy);
    header.add_child(IconButton({
        id: 'settings-button',
        iconName: 'preferences-system-symbolic',
        accessibleName: 'Open settings',
        onActivate: actions.openSettings,
        tokens,
    }));

    const history = column('selected-history');
    const historyHeader = box('selected-history-header',
        Clutter.Orientation.HORIZONTAL, {x_expand: true});
    historyHeader.add_child(label('Usage history', 'selected-section-title', {
        x_expand: true,
    }));
    historyHeader.add_child(RangeSelector({
        choices: RANGES.map(id => ({
            id,
            label: id,
            accessibleName: `${id} history range`,
        })),
        selected: state.activeRange,
        onSelect: actions.selectRange,
    }));
    history.add_child(historyHeader);
    history.add_child(HistoryChart({
        id: 'history-chart',
        accessibleName: `Usage history for ${state.activeRange}, ` +
            'from zero to one hundred percent',
        axisLabels: ['100%', '75%', '50%', '25%', '0%'],
        series: [
            {
                id: 'claudeShort',
                values: HISTORY.claudeShort,
                dataRole: USAGE.claudeShort.dataRole,
                strokeWidth: tokens.stroke.claudeShort,
            },
            {
                id: 'claudeWeekly',
                values: HISTORY.claudeWeekly,
                dataRole: USAGE.claudeWeekly.dataRole,
                strokeWidth: tokens.stroke.weekly,
            },
            {
                id: 'codexWeekly',
                values: HISTORY.codexWeekly,
                dataRole: USAGE.codexWeekly.dataRole,
                strokeWidth: tokens.stroke.weekly,
            },
        ],
        tokens,
    }));
    history.add_child(Legend({
        entries: [
            {id: 'claudeShort', label: 'Claude 5-hour',
                dataRole: USAGE.claudeShort.dataRole},
            {id: 'claudeWeekly', label: 'Claude weekly',
                dataRole: USAGE.claudeWeekly.dataRole},
            {id: 'codexWeekly', label: 'Codex weekly',
                dataRole: USAGE.codexWeekly.dataRole},
        ],
        tokens,
    }));

    return PopoverScaffold({
        id: 'claudex-usage-popover',
        view: 'usage',
        children: [
            header,
            ProviderCard({
                id: 'provider-claude',
                provider: providerModel('claude', 'Claude', 'Two usage windows',
                    `${extensionPath}/icons/claude.svg`),
                metrics: [
                    metricModel(USAGE.claudeShort),
                    metricModel(USAGE.claudeWeekly),
                ],
                tokens,
            }),
            ProviderCard({
                id: 'provider-codex',
                provider: providerModel('codex', 'Codex', 'Weekly usage window',
                    `${extensionPath}/icons/codex.svg`),
                metrics: [metricModel(USAGE.codexWeekly)],
                tokens,
            }),
            history,
            FooterStatus({
                status: 'Updated just now',
                action: {
                    id: 'refresh-button',
                    label: 'Refresh',
                    accessibleName: 'Refresh static usage sample',
                    onActivate: actions.refresh,
                },
            }),
        ],
    });
}

function buildSettingsPopover({state, tokens, actions}) {
    const header = box('selected-settings-header',
        Clutter.Orientation.HORIZONTAL, {x_expand: true});
    const back = new St.Button({
        name: 'back-button',
        style_class: 'selected-back-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: label('← Usage', 'claudex-button-label'),
    });
    back.set_accessible_name('Back to usage');
    back.connect('clicked', actions.openUsage);
    header.add_child(back);
    header.add_child(label('Settings', 'selected-settings-title', {x_expand: true}));

    const panelSection = column('selected-settings-section');
    panelSection.add_child(label('PANEL', 'selected-settings-kicker'));
    for (const [id, title, description] of [
        ['showClaudeShort', 'Claude 5-hour', 'Show this limit in the top panel'],
        ['showClaudeWeekly', 'Claude weekly', 'Show this limit in the top panel'],
        ['showCodexWeekly', 'Codex weekly', 'Show this limit in the top panel'],
        ['presentOnly', 'Only while providers are present',
            'Hide each provider when its application is not running'],
    ]) {
        panelSection.add_child(SettingsRow({
            id,
            title,
            description,
            accessibleName: title,
            active: state[id],
            onToggle: actions.toggle,
            tokens,
        }));
    }

    const updatesSection = column('selected-settings-section');
    updatesSection.add_child(label('UPDATES & HISTORY', 'selected-settings-kicker'));
    updatesSection.add_child(ChoiceRow({
        id: 'refresh-interval-choice',
        title: 'Refresh while visible',
        value: `${state.refreshInterval}  ›`,
        accessibleName: `Refresh while visible, ${state.refreshInterval}`,
        onActivate: actions.cycleRefreshInterval,
    }));
    updatesSection.add_child(SettingsRow({
        id: 'localHistory',
        title: 'Keep local usage history',
        description: 'Store derived percentages for the merged chart',
        accessibleName: 'Keep local usage history',
        active: state.localHistory,
        onToggle: actions.toggle,
        tokens,
    }));
    return PopoverScaffold({
        id: 'claudex-settings-popover',
        view: 'settings',
        children: [header, panelSection, updatesSection],
    });
}

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
        this._replaceChild(this._panelHost, buildPanel({
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
            ? buildSettingsPopover({state: snapshot, tokens: this._tokens, actions})
            : buildUsagePopover({
                state: snapshot,
                extensionPath: this.path,
                tokens: this._tokens,
                actions,
            });
        this._replaceChild(this._popoverHost, popover);
    }
}
