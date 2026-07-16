import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {
    colorToRgba,
    HISTORY,
    progressWidth,
    RANGES,
    USAGE,
} from './catalog-state.js';

function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL, properties = {}) {
    return new St.BoxLayout({
        style_class: styleClass,
        orientation,
        ...properties,
    });
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

function button({text, styleClass, accessibleName, name, onActivate,
    toggleMode = false, checked = false}) {
    const actor = new St.Button({
        name,
        style_class: styleClass,
        can_focus: true,
        reactive: true,
        track_hover: true,
        toggle_mode: toggleMode,
        checked,
        child: label(text, 'claudex-button-label'),
    });
    actor.set_accessible_name(accessibleName ?? text);
    actor.connect('clicked', onActivate);
    return actor;
}

function providerIcon(path, size, styleClass, accessibleName = null) {
    const actor = new St.Icon({
        style_class: styleClass,
        gicon: new Gio.FileIcon({file: Gio.File.new_for_path(path)}),
        icon_size: size,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (accessibleName)
        actor.set_accessible_name(accessibleName);
    return actor;
}

export function PopoverScaffold({view, children}) {
    const actor = column(`claudex-popover direction-selected selected-${view}`, {
        name: `claudex-${view}-popover`,
    });
    for (const child of children)
        actor.add_child(child);
    return actor;
}

export function ProviderGroup({provider, detail, iconPath, tokens}) {
    const actor = box('claudex-provider-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    actor.add_child(providerIcon(
        iconPath,
        tokens.size.providerIcon,
        'claudex-provider-icon',
        `${provider} mark`
    ));
    const copy = column('claudex-provider-copy', {x_expand: true});
    copy.add_child(label(provider, 'claudex-provider-name'));
    copy.add_child(label(detail, 'claudex-provider-detail'));
    actor.add_child(copy);
    return actor;
}

export function ProgressBar({usage, tokens}) {
    const width = tokens.size.progressWidth;
    const height = tokens.size.progressHeight;
    const actor = new St.Widget({
        name: `progress-${usage.id}`,
        style_class: 'claudex-progress-track',
        layout_manager: new Clutter.FixedLayout(),
        width,
        height,
        accessible_role: Atk.Role.PROGRESS_BAR,
    });
    actor.set_accessible_name(`${usage.percent}% of ${usage.window} used`);

    const fillWidth = progressWidth(usage.percent, width);
    if (fillWidth > 0) {
        actor.add_child(new St.Widget({
            name: `progress-fill-${usage.id}`,
            style_class: `claudex-progress-fill color-${usage.id}`,
            width: fillWidth,
            height,
            x: 0,
            y: 0,
        }));
    }
    return actor;
}

export function UsageMetric({usage, tokens}) {
    const actor = column('claudex-metric', {x_expand: true});
    const top = box('claudex-metric-top', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    top.add_child(label(usage.window, 'claudex-window', {x_expand: true}));
    top.add_child(label(`${usage.percent}%`, 'claudex-percent'));
    actor.add_child(top);
    actor.add_child(ProgressBar({usage, tokens}));
    actor.add_child(label(usage.reset, 'claudex-reset'));
    return actor;
}

export function ProviderCard({provider, detail, iconPath, usage, tokens}) {
    const actor = column('selected-provider-card', {
        name: `provider-${provider.toLowerCase()}`,
    });
    actor.add_child(ProviderGroup({provider, detail, iconPath, tokens}));
    for (const metric of usage)
        actor.add_child(UsageMetric({usage: metric, tokens}));
    return actor;
}

export function PanelIndicator({state, extensionPath, tokens, lightPanel = false}) {
    const actor = box('claudex-panel claudex-panel-selected',
        Clutter.Orientation.HORIZONTAL, {name: 'claudex-panel-indicator'});
    const groups = [];
    const claudeValues = [];
    if (state.showClaudeShort)
        claudeValues.push(`${USAGE.claudeShort.percent}%`);
    if (state.showClaudeWeekly)
        claudeValues.push(`${USAGE.claudeWeekly.percent}%`);

    if (claudeValues.length > 0) {
        const group = box('claudex-panel-provider');
        group.add_child(providerIcon(
            `${extensionPath}/icons/claude${lightPanel ? '-light' : ''}.svg`,
            tokens.size.panelProviderIcon,
            'claudex-panel-provider-icon',
            'Claude'
        ));
        group.add_child(label(claudeValues.join(' · '), 'claudex-panel-selected-value'));
        groups.push(group);
    }

    if (state.showCodexWeekly) {
        const group = box('claudex-panel-provider');
        group.add_child(providerIcon(
            `${extensionPath}/icons/codex${lightPanel ? '-light' : ''}.svg`,
            tokens.size.panelProviderIcon,
            'claudex-panel-provider-icon',
            'Codex'
        ));
        group.add_child(label(`${USAGE.codexWeekly.percent}%`,
            'claudex-panel-selected-value'));
        groups.push(group);
    }

    if (groups.length === 0) {
        for (const provider of ['claude', 'codex']) {
            actor.add_child(providerIcon(
                `${extensionPath}/icons/${provider}${lightPanel ? '-light' : ''}.svg`,
                tokens.size.panelProviderIcon,
                'claudex-panel-provider-icon muted',
                provider === 'claude' ? 'Claude hidden' : 'Codex hidden'
            ));
        }
        return actor;
    }

    groups.forEach((group, index) => {
        if (index > 0) {
            actor.add_child(new St.Widget({
                style_class: 'claudex-panel-provider-divider',
                width: 1,
                height: 12,
            }));
        }
        actor.add_child(group);
    });
    return actor;
}

export function HistoryChart({series, range, tokens}) {
    const frame = box('claudex-chart-frame', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const chart = new St.DrawingArea({
        name: 'history-chart',
        style_class: 'claudex-chart',
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        height: tokens.size.chartHeight,
        accessible_role: Atk.Role.CHART,
    });
    chart.set_accessible_name(
        `Usage history for ${range}, from zero to one hundred percent`);
    chart.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        const top = 5;
        const bottom = height - 5;
        const grid = colorToRgba(tokens.color.grid);

        cr.setLineWidth(tokens.stroke.grid);
        cr.setSourceRGBA(...grid);
        for (const value of [0, 25, 50, 75, 100]) {
            const y = bottom - value / 100 * (bottom - top);
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }
        cr.stroke();

        for (const name of series) {
            const values = HISTORY[name];
            const role = USAGE[name].dataRole;
            cr.setSourceRGBA(...colorToRgba(tokens.color[role]));
            cr.setLineWidth(name === 'claudeShort'
                ? tokens.stroke.claudeShort
                : tokens.stroke.weekly);
            values.forEach((value, index) => {
                const x = index * (width - 2) / (values.length - 1) + 1;
                const y = bottom - value / 100 * (bottom - top);
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

    const axis = column('claudex-chart-axis');
    for (const value of ['100%', '75%', '50%', '25%', '0%']) {
        axis.add_child(label(value, 'claudex-chart-axis-label', {
            y_expand: true,
        }));
    }
    frame.add_child(axis);
    return frame;
}

export function Legend({entries}) {
    const actor = box('claudex-legend');
    for (const [name, dataClass] of entries) {
        const item = box('claudex-legend-item');
        item.add_child(new St.Widget({
            style_class: `claudex-legend-dot ${dataClass}`,
            width: 8,
            height: 8,
        }));
        item.add_child(label(name, 'claudex-legend-label'));
        actor.add_child(item);
    }
    return actor;
}

export function RangeSelector({selected, onSelect}) {
    const actor = box('claudex-range-selector');
    for (const value of RANGES) {
        const active = value === selected;
        const rangeButton = button({
            text: value,
            name: `range-${value}`,
            styleClass: `claudex-range-button${active ? ' active' : ''}`,
            accessibleName: `${value} history range`,
            toggleMode: true,
            checked: active,
            onActivate: () => onSelect(value),
        });
        rangeButton.accessible_role = Atk.Role.RADIO_BUTTON;
        actor.add_child(rangeButton);
    }
    return actor;
}

export function IconButton({iconName, accessibleName, name, onActivate, tokens}) {
    const actor = new St.Button({
        name,
        style_class: 'selected-settings-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        child: new St.Icon({
            icon_name: iconName,
            icon_size: tokens.size.settingsIcon,
        }),
    });
    actor.set_accessible_name(accessibleName);
    actor.connect('clicked', onActivate);
    return actor;
}

export function Switch({active, tokens}) {
    const actor = new St.Widget({
        style_class: `selected-switch${active ? ' active' : ''}`,
        layout_manager: new Clutter.FixedLayout(),
        width: tokens.size.switchTrackWidth,
        height: tokens.size.switchTrackHeight,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        reactive: false,
    });
    actor.add_child(new St.Widget({
        style_class: 'selected-switch-knob',
        width: tokens.size.switchThumb,
        height: tokens.size.switchThumb,
        x: active
            ? tokens.size.switchTrackWidth - tokens.size.switchThumb -
                tokens.size.switchInset
            : tokens.size.switchInset,
        y: tokens.size.switchInset,
        reactive: false,
    }));
    return actor;
}

export function SettingsRow({key, title, description, active, onToggle, tokens}) {
    const row = box('selected-setting-row', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const copy = column('selected-setting-copy', {x_expand: true});
    copy.add_child(label(title, 'selected-setting-title'));
    copy.add_child(label(description, 'selected-setting-description'));
    row.add_child(copy);
    row.add_child(Switch({active, tokens}));

    const actor = new St.Button({
        name: `toggle-${key}`,
        style_class: 'selected-setting-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        toggle_mode: true,
        checked: active,
        child: row,
        accessible_role: Atk.Role.SWITCH,
    });
    actor.set_accessible_name(title);
    actor.connect('clicked', () => onToggle(key));
    return actor;
}

export function ChoiceRow({title, value, onActivate}) {
    const row = box('selected-choice-row', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    row.add_child(label(title, 'selected-setting-title', {x_expand: true}));
    row.add_child(label(`${value}  ›`, 'selected-choice-value'));
    const actor = new St.Button({
        name: 'refresh-interval-choice',
        style_class: 'selected-choice-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: row,
    });
    actor.set_accessible_name(`${title}, ${value}`);
    actor.connect('clicked', onActivate);
    return actor;
}

export function FooterStatus({onRefresh}) {
    const actor = box('claudex-footer', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    actor.add_child(label('Updated just now', 'claudex-updated', {x_expand: true}));
    actor.add_child(button({
        text: 'Refresh',
        name: 'refresh-button',
        styleClass: 'claudex-text-button',
        accessibleName: 'Refresh static usage sample',
        onActivate: onRefresh,
    }));
    return actor;
}

export function UsagePopover({state, extensionPath, tokens, actions}) {
    const header = box('selected-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    const copy = column('selected-title-copy', {x_expand: true});
    copy.add_child(label('USAGE', 'selected-kicker'));
    copy.add_child(label('Claude + Codex', 'selected-title'));
    header.add_child(copy);
    header.add_child(IconButton({
        iconName: 'preferences-system-symbolic',
        accessibleName: 'Open settings',
        name: 'settings-button',
        onActivate: actions.openSettings,
        tokens,
    }));

    const history = column('selected-history');
    const historyHeader = box('selected-history-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    historyHeader.add_child(label('Usage history', 'selected-section-title', {
        x_expand: true,
    }));
    historyHeader.add_child(RangeSelector({
        selected: state.activeRange,
        onSelect: actions.selectRange,
    }));
    history.add_child(historyHeader);
    history.add_child(HistoryChart({
        series: ['claudeShort', 'claudeWeekly', 'codexWeekly'],
        range: state.activeRange,
        tokens,
    }));
    history.add_child(Legend({entries: [
        ['Claude 5-hour', 'color-claudeShort'],
        ['Claude weekly', 'color-claudeWeekly'],
        ['Codex weekly', 'color-codexWeekly'],
    ]}));

    return PopoverScaffold({view: 'usage', children: [
        header,
        ProviderCard({
            provider: 'Claude',
            detail: 'Two usage windows',
            iconPath: `${extensionPath}/icons/claude.svg`,
            usage: [USAGE.claudeShort, USAGE.claudeWeekly],
            tokens,
        }),
        ProviderCard({
            provider: 'Codex',
            detail: 'Weekly usage window',
            iconPath: `${extensionPath}/icons/codex.svg`,
            usage: [USAGE.codexWeekly],
            tokens,
        }),
        history,
        FooterStatus({onRefresh: actions.refresh}),
    ]});
}

export function SettingsPopover({state, tokens, actions}) {
    const header = box('selected-settings-header', Clutter.Orientation.HORIZONTAL, {
        x_expand: true,
    });
    header.add_child(button({
        text: '← Usage',
        name: 'back-button',
        styleClass: 'selected-back-button',
        accessibleName: 'Back to usage',
        onActivate: actions.openUsage,
    }));
    header.add_child(label('Settings', 'selected-settings-title', {x_expand: true}));

    const panelSection = column('selected-settings-section');
    panelSection.add_child(label('PANEL', 'selected-settings-kicker'));
    for (const row of [
        ['showClaudeShort', 'Claude 5-hour', 'Show this limit in the top panel'],
        ['showClaudeWeekly', 'Claude weekly', 'Show this limit in the top panel'],
        ['showCodexWeekly', 'Codex weekly', 'Show this limit in the top panel'],
        ['presentOnly', 'Only while providers are present',
            'Hide each provider when its application is not running'],
    ]) {
        const [key, title, description] = row;
        panelSection.add_child(SettingsRow({
            key,
            title,
            description,
            active: state[key],
            onToggle: actions.toggle,
            tokens,
        }));
    }

    const updatesSection = column('selected-settings-section');
    updatesSection.add_child(label('UPDATES & HISTORY', 'selected-settings-kicker'));
    updatesSection.add_child(ChoiceRow({
        title: 'Refresh while visible',
        value: state.refreshInterval,
        onActivate: actions.cycleRefreshInterval,
    }));
    updatesSection.add_child(SettingsRow({
        key: 'localHistory',
        title: 'Keep local usage history',
        description: 'Store derived percentages for the merged chart',
        active: state.localHistory,
        onToggle: actions.toggle,
        tokens,
    }));

    return PopoverScaffold({view: 'settings', children: [
        header,
        panelSection,
        updatesSection,
    ]});
}
