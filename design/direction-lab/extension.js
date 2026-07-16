import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const DIRECTIONS = [
    {id: 'native', shortName: 'A', name: 'Native Utility'},
    {id: 'signal', shortName: 'B', name: 'Signal Deck'},
    {id: 'quiet', shortName: 'C', name: 'Quiet Capacity'},
    {id: 'selected', shortName: 'D', name: 'Selected Blend'},
];

const USAGE = {
    claudeShort: {
        provider: 'Claude',
        window: '5-hour window',
        percent: 8,
        reset: 'Resets in 3 hr, 50 min',
    },
    claudeWeekly: {
        provider: 'Claude',
        window: 'Weekly window',
        percent: 68,
        reset: 'Resets in 1 day, 17 hr',
    },
    codexWeekly: {
        provider: 'Codex',
        window: 'Weekly window',
        percent: 42,
        reset: 'Resets in 4 days, 2 hr',
    },
};

const HISTORY = {
    claudeShort: [2, 2, 2, 7, 7, 7, 11, 11, 13, 13, 13, 16, 18, 21, 23, 24, 26,
        27, 29, 29, 31, 31, 34, 36, 4, 7, 8, 8, 8, 8],
    claudeWeekly: [61, 61, 62, 62, 62, 63, 63, 63, 63, 64, 64, 64, 64, 64, 65,
        65, 65, 65, 66, 66, 66, 66, 67, 67, 67, 68, 68, 68, 68, 68],
    codexWeekly: [27, 27, 28, 28, 29, 30, 30, 31, 31, 32, 33, 34, 34, 35, 36,
        36, 37, 37, 38, 38, 39, 39, 40, 40, 40, 41, 41, 41, 42, 42],
};

const CHART_COLORS = {
    claudeShort: [0.94, 0.61, 0.48],
    claudeWeekly: [0.72, 0.31, 0.20],
    codexWeekly: [0.38, 0.61, 0.49],
};

function makeBox(styleClass, vertical = false, properties = {}) {
    return new St.BoxLayout({
        style_class: styleClass,
        vertical,
        ...properties,
    });
}

function makeLabel(text, styleClass, properties = {}) {
    return new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...properties,
    });
}

function makeButton(text, styleClass, onClick) {
    const button = new St.Button({
        style_class: styleClass,
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: makeLabel(text, 'claudex-button-label'),
    });
    button.connect('clicked', onClick);
    return button;
}

function makeIconButton(iconName, styleClass, onClick, iconSize = 18) {
    const button = new St.Button({
        style_class: styleClass,
        can_focus: true,
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        child: new St.Icon({
            icon_name: iconName,
            icon_size: iconSize,
        }),
    });
    button.connect('clicked', onClick);
    return button;
}

function makeMark(text, styleClass = '') {
    return makeLabel(text, 'claudex-mark ' + styleClass);
}

function makeProviderIcon(iconPath, iconSize = 20, styleClass = '') {
    return new St.Icon({
        style_class: styleClass,
        gicon: new Gio.FileIcon({
            file: Gio.File.new_for_path(iconPath),
        }),
        icon_size: iconSize,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

function makeProgress(percent, colorClass) {
    const track = new St.Widget({
        style_class: 'claudex-progress-track',
        layout_manager: new Clutter.FixedLayout(),
        width: 316,
        height: 8,
    });
    const fill = new St.Widget({
        style_class: 'claudex-progress-fill ' + colorClass,
        width: Math.max(8, Math.round(2.82 * percent)),
        height: 8,
        x: 0,
        y: 0,
    });
    track.add_child(fill);
    return track;
}

function makeMetric(usage, colorClass, options = {}) {
    const root = makeBox('claudex-metric ' + (options.styleClass ?? ''), true, {
        x_expand: true,
    });
    const top = makeBox('claudex-metric-top', false, {x_expand: true});
    top.add_child(makeLabel(usage.window, 'claudex-window', {x_expand: true}));
    top.add_child(makeLabel(String(usage.percent) + '%', 'claudex-percent'));
    root.add_child(top);
    root.add_child(makeProgress(usage.percent, colorClass));
    root.add_child(makeLabel(usage.reset, 'claudex-reset'));
    return root;
}

function makeLargeMetric(usage, colorClass) {
    const root = makeBox('claudex-large-metric', true, {x_expand: true});
    root.add_child(makeLabel(usage.window, 'claudex-window'));
    root.add_child(makeLabel(String(usage.percent) + '%', 'claudex-large-percent ' + colorClass));
    root.add_child(makeLabel('used', 'claudex-used-label'));
    root.add_child(makeLabel(usage.reset, 'claudex-reset'));
    return root;
}

function makeProviderHeader(name, mark, detail, iconPath = null) {
    const row = makeBox('claudex-provider-header', false, {x_expand: true});
    if (iconPath) {
        row.add_child(makeProviderIcon(
            iconPath,
            20,
            'claudex-provider-icon'
        ));
    } else {
        row.add_child(makeMark(mark, 'claudex-provider-mark'));
    }
    const copy = makeBox('claudex-provider-copy', true, {x_expand: true});
    copy.add_child(makeLabel(name, 'claudex-provider-name'));
    if (detail)
        copy.add_child(makeLabel(detail, 'claudex-provider-detail'));
    row.add_child(copy);
    return row;
}

function makeChart(seriesNames) {
    const frame = makeBox('claudex-chart-frame', false, {x_expand: true});
    const chart = new St.DrawingArea({
        style_class: 'claudex-chart',
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        height: 104,
    });
    chart.set_accessible_name('Usage history from zero to one hundred percent');
    chart.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        const top = 5;
        const bottom = height - 5;

        cr.setLineWidth(1);
        cr.setSourceRGBA(1, 1, 1, 0.10);
        for (const value of [0, 25, 50, 75, 100]) {
            const y = bottom - (value / 100) * (bottom - top);
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }
        cr.stroke();

        for (const name of seriesNames) {
            const values = HISTORY[name];
            const [red, green, blue] = CHART_COLORS[name];
            cr.setSourceRGBA(red, green, blue, 1);
            cr.setLineWidth(name === 'claudeShort' ? 1 : 2.5);
            values.forEach((value, index) => {
                const x = index * (width - 2) / (values.length - 1) + 1;
                const y = bottom - (value / 100) * (bottom - top);
                if (index === 0)
                    cr.moveTo(x, y);
                else
                    cr.lineTo(x, y);
            });
            cr.stroke();
        }

        cr.$dispose();
    });
    frame.add_child(chart);

    const axis = makeBox('claudex-chart-axis', true);
    for (const label of ['100%', '75%', '50%', '25%', '0%'])
        axis.add_child(makeLabel(label, 'claudex-chart-axis-label'));
    frame.add_child(axis);
    return frame;
}

function makeLegend(entries) {
    const row = makeBox('claudex-legend', false);
    for (const [label, colorClass] of entries) {
        const item = makeBox('claudex-legend-item', false);
        item.add_child(new St.Widget({
            style_class: 'claudex-legend-dot ' + colorClass,
            width: 8,
            height: 8,
        }));
        item.add_child(makeLabel(label, 'claudex-legend-label'));
        row.add_child(item);
    }
    return row;
}

function makeRangeSelector() {
    const row = makeBox('claudex-range-selector', false);
    for (const value of ['1h', '6h', '1d', '7d', '30d']) {
        const active = value === '6h' ? ' active' : '';
        row.add_child(makeButton(value, 'claudex-range-button' + active, () => {}));
    }
    return row;
}

function makeFooter() {
    const footer = makeBox('claudex-footer', false, {x_expand: true});
    footer.add_child(makeLabel('Updated just now', 'claudex-updated', {x_expand: true}));
    footer.add_child(makeButton('Refresh', 'claudex-text-button', () => {}));
    return footer;
}

function makePanelProgress(label, percent, colorClass) {
    const row = makeBox('claudex-panel-meter', false);
    row.add_child(makeLabel(label, 'claudex-panel-meter-label'));
    const track = new St.Widget({
        style_class: 'claudex-panel-track',
        layout_manager: new Clutter.FixedLayout(),
        width: 26,
        height: 3,
    });
    track.add_child(new St.Widget({
        style_class: 'claudex-panel-fill ' + colorClass,
        width: Math.max(4, Math.round(percent * 0.26)),
        height: 3,
        x: 0,
        y: 0,
    }));
    row.add_child(track);
    return row;
}

export default class ClaudexUsageDesignExtension extends Extension {
    enable() {
        this._directionIndex = 3;
        this._view = 'usage';
        this._mockSettings = {
            showClaudeShort: true,
            showClaudeWeekly: true,
            showCodexWeekly: true,
            presentOnly: true,
            localHistory: true,
        };
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._indicator.add_style_class_name('claudex-indicator');

        this._panelHost = new St.Bin();
        this._indicator.add_child(this._panelHost);

        this._menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'claudex-menu-item',
        });
        this._popoverHost = new St.Bin();
        this._menuItem.add_child(this._popoverHost);
        this._indicator.menu.addMenuItem(this._menuItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._render();
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._panelHost = null;
        this._popoverHost = null;
        this._menuItem = null;
    }

    _replaceChild(host, child) {
        host.get_child()?.destroy();
        host.set_child(child);
    }

    _render() {
        const direction = DIRECTIONS[this._directionIndex];
        this._replaceChild(this._panelHost, this._buildPanel(direction.id));
        this._replaceChild(this._popoverHost, this._buildPopover(direction.id));
        this._indicator.set_accessible_name('Claudex Usage — ' + direction.name);
    }

    _selectDirection(index) {
        this._directionIndex = index;
        this._view = 'usage';
        this._render();
    }

    _buildPanel(direction) {
        if (direction === 'selected') {
            const root = makeBox('claudex-panel claudex-panel-selected', false);
            const groups = [];
            const claudeValues = [];
            if (this._mockSettings.showClaudeShort)
                claudeValues.push(USAGE.claudeShort.percent + '%');
            if (this._mockSettings.showClaudeWeekly)
                claudeValues.push(USAGE.claudeWeekly.percent + '%');
            if (claudeValues.length > 0) {
                const group = makeBox('claudex-panel-provider', false);
                group.add_child(makeProviderIcon(
                    this.path + '/icons/claude.svg',
                    14,
                    'claudex-panel-provider-icon'
                ));
                group.add_child(makeLabel(
                    claudeValues.join(' · '),
                    'claudex-panel-selected-value'
                ));
                groups.push(group);
            }
            if (this._mockSettings.showCodexWeekly) {
                const group = makeBox('claudex-panel-provider', false);
                group.add_child(makeProviderIcon(
                    this.path + '/icons/codex.svg',
                    14,
                    'claudex-panel-provider-icon'
                ));
                group.add_child(makeLabel(
                    USAGE.codexWeekly.percent + '%',
                    'claudex-panel-selected-value'
                ));
                groups.push(group);
            }
            if (groups.length === 0) {
                root.add_child(makeProviderIcon(
                    this.path + '/icons/claude.svg',
                    14,
                    'claudex-panel-provider-icon muted'
                ));
                root.add_child(makeProviderIcon(
                    this.path + '/icons/codex.svg',
                    14,
                    'claudex-panel-provider-icon muted'
                ));
                return root;
            }
            groups.forEach((group, index) => {
                if (index > 0) {
                    root.add_child(new St.Widget({
                        style_class: 'claudex-panel-provider-divider',
                        width: 1,
                        height: 12,
                    }));
                }
                root.add_child(group);
            });
            return root;
        }

        if (direction === 'signal') {
            const root = makeBox('claudex-panel claudex-panel-signal', false);
            root.add_child(makeMark('CX', 'signal-mark'));
            const meters = makeBox('claudex-panel-meters', true);
            meters.add_child(makePanelProgress('C', USAGE.claudeWeekly.percent,
                'color-claude-weekly'));
            meters.add_child(makePanelProgress('X', USAGE.codexWeekly.percent,
                'color-codex-weekly'));
            root.add_child(meters);
            return root;
        }

        if (direction === 'quiet') {
            const root = makeBox('claudex-panel claudex-panel-quiet', false);
            root.add_child(makeLabel('C ' + USAGE.claudeWeekly.percent,
                'claudex-panel-quiet-value'));
            root.add_child(new St.Widget({
                style_class: 'claudex-panel-divider',
                width: 1,
                height: 12,
            }));
            root.add_child(makeLabel('X ' + USAGE.codexWeekly.percent,
                'claudex-panel-quiet-value'));
            return root;
        }

        const root = makeBox('claudex-panel claudex-panel-native', false);
        root.add_child(makeMark('CX', 'native-mark'));
        root.add_child(makeLabel(
            'C ' + USAGE.claudeWeekly.percent + '% · X ' +
            USAGE.codexWeekly.percent + '%',
            'claudex-panel-summary'
        ));
        return root;
    }

    _buildPopover(direction) {
        let root;
        if (direction === 'selected')
            root = this._view === 'settings'
                ? this._buildSettingsPopover()
                : this._buildSelectedPopover();
        else if (direction === 'signal')
            root = this._buildSignalPopover();
        else if (direction === 'quiet')
            root = this._buildQuietPopover();
        else
            root = this._buildNativePopover();

        root.add_child(this._buildDirectionSwitcher());
        return root;
    }

    _buildSelectedPopover() {
        const root = makeBox('claudex-popover direction-selected', true);
        const header = makeBox('selected-header', false, {x_expand: true});
        const copy = makeBox('selected-title-copy', true, {x_expand: true});
        copy.add_child(makeLabel('USAGE', 'selected-kicker'));
        copy.add_child(makeLabel('Claude + Codex', 'selected-title'));
        header.add_child(copy);
        header.add_child(makeIconButton(
            'preferences-system-symbolic',
            'selected-settings-button',
            () => {
            this._view = 'settings';
            this._render();
            },
            20
        ));
        root.add_child(header);

        const claude = makeBox('selected-provider-card', true);
        claude.add_child(makeProviderHeader(
            'Claude',
            'C',
            'Two usage windows',
            this.path + '/icons/claude.svg'
        ));
        claude.add_child(makeMetric(USAGE.claudeShort, 'color-claude-short'));
        claude.add_child(makeMetric(USAGE.claudeWeekly, 'color-claude-weekly'));
        root.add_child(claude);

        const codex = makeBox('selected-provider-card', true);
        codex.add_child(makeProviderHeader(
            'Codex',
            'X',
            'Weekly usage window',
            this.path + '/icons/codex.svg'
        ));
        codex.add_child(makeMetric(USAGE.codexWeekly, 'color-codex-weekly'));
        root.add_child(codex);

        const history = makeBox('selected-history', true);
        const historyHeader = makeBox('selected-history-header', false, {x_expand: true});
        historyHeader.add_child(makeLabel('Usage history', 'selected-section-title',
            {x_expand: true}));
        historyHeader.add_child(makeRangeSelector());
        history.add_child(historyHeader);
        history.add_child(makeChart(['claudeShort', 'claudeWeekly', 'codexWeekly']));
        history.add_child(makeLegend([
            ['Claude 5-hour', 'color-claude-short'],
            ['Claude weekly', 'color-claude-weekly'],
            ['Codex weekly', 'color-codex-weekly'],
        ]));
        root.add_child(history);
        root.add_child(makeFooter());
        return root;
    }

    _buildSettingToggle(key, title, description) {
        const row = makeBox('selected-setting-row', false, {x_expand: true});
        const copy = makeBox('selected-setting-copy', true, {x_expand: true});
        copy.add_child(makeLabel(title, 'selected-setting-title'));
        copy.add_child(makeLabel(description, 'selected-setting-description'));
        row.add_child(copy);

        const active = this._mockSettings[key];
        const switchTrack = new St.Widget({
            style_class: 'selected-switch' + (active ? ' active' : ''),
            layout_manager: new Clutter.FixedLayout(),
            width: 32,
            height: 18,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: false,
        });
        switchTrack.add_child(new St.Widget({
            style_class: 'selected-switch-knob',
            width: 14,
            height: 14,
            x: active ? 16 : 2,
            y: 2,
        }));
        row.add_child(switchTrack);

        const button = new St.Button({
            style_class: 'selected-setting-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
            child: row,
        });
        button.connect('clicked', () => {
            this._mockSettings[key] = !this._mockSettings[key];
            this._render();
        });
        return button;
    }

    _buildChoiceRow(title, value) {
        const row = makeBox('selected-choice-row', false, {x_expand: true});
        row.add_child(makeLabel(title, 'selected-setting-title', {x_expand: true}));
        row.add_child(makeLabel(value + '  ›', 'selected-choice-value'));
        return row;
    }

    _buildSettingsPopover() {
        const root = makeBox('claudex-popover direction-selected selected-settings', true);
        const header = makeBox('selected-settings-header', false, {x_expand: true});
        header.add_child(makeButton('← Usage', 'selected-back-button', () => {
            this._view = 'usage';
            this._render();
        }));
        header.add_child(makeLabel('Settings', 'selected-settings-title',
            {x_expand: true}));
        root.add_child(header);

        const panelSection = makeBox('selected-settings-section', true);
        panelSection.add_child(makeLabel('PANEL', 'selected-settings-kicker'));
        panelSection.add_child(this._buildSettingToggle(
            'showClaudeShort',
            'Claude 5-hour',
            'Show this limit in the top panel'
        ));
        panelSection.add_child(this._buildSettingToggle(
            'showClaudeWeekly',
            'Claude weekly',
            'Show this limit in the top panel'
        ));
        panelSection.add_child(this._buildSettingToggle(
            'showCodexWeekly',
            'Codex weekly',
            'Show this limit in the top panel'
        ));
        panelSection.add_child(this._buildSettingToggle(
            'presentOnly',
            'Only while providers are present',
            'Hide each provider when its application is not running'
        ));
        root.add_child(panelSection);

        const updatesSection = makeBox('selected-settings-section', true);
        updatesSection.add_child(makeLabel('UPDATES & HISTORY', 'selected-settings-kicker'));
        updatesSection.add_child(this._buildChoiceRow('Refresh while visible', '5 min'));
        updatesSection.add_child(this._buildSettingToggle(
            'localHistory',
            'Keep local usage history',
            'Store derived percentages for the merged chart'
        ));
        root.add_child(updatesSection);

        return root;
    }

    _buildNativePopover() {
        const root = makeBox('claudex-popover direction-native', true);
        const header = makeBox('claudex-header', false, {x_expand: true});
        const title = makeBox('claudex-title-copy', true, {x_expand: true});
        title.add_child(makeLabel('AI usage', 'claudex-title'));
        title.add_child(makeLabel('Claude + Codex', 'claudex-subtitle'));
        header.add_child(title);
        root.add_child(header);

        const claude = makeBox('claudex-card claudex-provider-card', true);
        claude.add_child(makeProviderHeader('Claude', 'C', 'Two active windows'));
        claude.add_child(makeMetric(USAGE.claudeShort, 'color-claude-short'));
        claude.add_child(makeMetric(USAGE.claudeWeekly, 'color-claude-weekly'));
        root.add_child(claude);

        const codex = makeBox('claudex-card claudex-provider-card', true);
        codex.add_child(makeProviderHeader('Codex', 'X', 'Weekly limit'));
        codex.add_child(makeMetric(USAGE.codexWeekly, 'color-codex-weekly'));
        root.add_child(codex);

        const history = makeBox('claudex-history', true);
        const historyHeader = makeBox('claudex-section-header', false, {x_expand: true});
        historyHeader.add_child(makeLabel('Recent movement', 'claudex-section-title',
            {x_expand: true}));
        historyHeader.add_child(makeLabel('6 hours', 'claudex-section-meta'));
        history.add_child(historyHeader);
        history.add_child(makeChart(['claudeShort', 'claudeWeekly', 'codexWeekly']));
        history.add_child(makeLegend([
            ['Claude 5h', 'color-claude-short'],
            ['Claude week', 'color-claude-weekly'],
            ['Codex week', 'color-codex-weekly'],
        ]));
        root.add_child(history);
        root.add_child(makeFooter());
        return root;
    }

    _buildSignalPopover() {
        const root = makeBox('claudex-popover direction-signal', true);
        const header = makeBox('signal-header', false, {x_expand: true});
        const copy = makeBox('signal-title-copy', true, {x_expand: true});
        copy.add_child(makeLabel('LIMIT MONITOR', 'signal-kicker'));
        copy.add_child(makeLabel('Claude + Codex', 'signal-title'));
        header.add_child(copy);
        root.add_child(header);

        const metrics = makeBox('signal-metrics', true);
        metrics.add_child(makeMetric(USAGE.claudeShort,
            'color-claude-short', {styleClass: 'signal-metric'}));
        metrics.add_child(makeMetric(USAGE.claudeWeekly,
            'color-claude-weekly', {styleClass: 'signal-metric'}));
        metrics.add_child(makeMetric(USAGE.codexWeekly,
            'color-codex-weekly', {styleClass: 'signal-metric'}));
        root.add_child(metrics);

        const history = makeBox('signal-history', true);
        const chartHeader = makeBox('signal-chart-header', false, {x_expand: true});
        chartHeader.add_child(makeLabel('UTILIZATION / 6H', 'signal-label',
            {x_expand: true}));
        chartHeader.add_child(makeLabel('0—100%', 'signal-axis'));
        history.add_child(chartHeader);
        history.add_child(makeChart(['claudeShort', 'claudeWeekly', 'codexWeekly']));
        history.add_child(makeRangeSelector());
        history.add_child(makeLegend([
            ['C·5H', 'color-claude-short'],
            ['C·WK', 'color-claude-weekly'],
            ['X·WK', 'color-codex-weekly'],
        ]));
        root.add_child(history);

        const footer = makeBox('signal-footer', false, {x_expand: true});
        footer.add_child(makeLabel('LAST SAMPLE 00:01 AGO', 'signal-footer-copy',
            {x_expand: true}));
        footer.add_child(makeButton('↻', 'signal-refresh', () => {}));
        root.add_child(footer);
        return root;
    }

    _buildQuietPopover() {
        const root = makeBox('claudex-popover direction-quiet', true);
        const header = makeBox('quiet-header', false, {x_expand: true});
        const copy = makeBox('quiet-title-copy', true, {x_expand: true});
        copy.add_child(makeLabel('Capacity', 'quiet-title'));
        copy.add_child(makeLabel('A calm view of what is already used', 'quiet-subtitle'));
        header.add_child(copy);
        header.add_child(makeLabel('now', 'quiet-now'));
        root.add_child(header);

        const claude = makeBox('quiet-provider-card', true);
        claude.add_child(makeProviderHeader('Claude', 'C', 'Short and weekly windows'));
        const claudeMetrics = makeBox('quiet-metric-grid', false, {x_expand: true});
        claudeMetrics.add_child(makeLargeMetric(
            USAGE.claudeShort, 'color-claude-short'));
        claudeMetrics.add_child(makeLargeMetric(
            USAGE.claudeWeekly, 'color-claude-weekly'));
        claude.add_child(claudeMetrics);
        root.add_child(claude);

        const codex = makeBox('quiet-provider-card', true);
        codex.add_child(makeProviderHeader('Codex', 'X', 'Weekly window'));
        codex.add_child(makeLargeMetric(
            USAGE.codexWeekly, 'color-codex-weekly'));
        root.add_child(codex);

        const movement = makeBox('quiet-movement', true);
        movement.add_child(makeLabel('Weekly movement', 'quiet-section-title'));
        movement.add_child(makeChart(['claudeWeekly', 'codexWeekly']));
        movement.add_child(makeLegend([
            ['Claude', 'color-claude-weekly'],
            ['Codex', 'color-codex-weekly'],
        ]));
        root.add_child(movement);
        root.add_child(makeFooter());
        return root;
    }

    _buildDirectionSwitcher() {
        const root = makeBox('claudex-direction-switcher', true);
        root.add_child(makeLabel(
            'DESIGN DIRECTION · ' + DIRECTIONS[this._directionIndex].name,
            'claudex-direction-label'
        ));
        const buttons = makeBox('claudex-direction-buttons', false);
        DIRECTIONS.forEach((direction, index) => {
            const active = index === this._directionIndex ? ' active' : '';
            buttons.add_child(makeButton(
                direction.shortName,
                'claudex-direction-button' + active,
                () => this._selectDirection(index)
            ));
        });
        root.add_child(buttons);
        return root;
    }
}
