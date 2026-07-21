import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {HISTORY, USAGE} from './catalog-state.js';
import {HistoryChart} from './shared/history-chart.js';
import {IconButton} from './shared/icon-button.js';
import {Legend} from './shared/legend.js';
import {PopoverScaffold} from './shared/popover-scaffold.js';
import {ProgressBar} from './shared/progress-bar.js';
import {progressWidth} from './shared/token-geometry.js';

function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL,
    properties = {}) {
    return new St.BoxLayout({style_class: styleClass, orientation, ...properties});
}

function column(styleClass, properties = {}) {
    return box(styleClass, Clutter.Orientation.VERTICAL, properties);
}

function label(text, styleClass, properties = {}) {
    return new St.Label({text, style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER, ...properties});
}

function rangeSelect({range, onActivate, tokens}) {
    const row = box('claudex-choice-row');
    row.add_child(label(range, 'claudex-choice-value'));
    row.add_child(new St.Icon({icon_name: 'pan-down-symbolic',
        icon_size: tokens.size.settingsIcon / 2}));
    const actor = new St.Button({name: 'refinement-range-select',
        style_class: 'claudex-choice-button', can_focus: true, reactive: true,
        track_hover: true, child: row, accessible_role: Atk.Role.COMBO_BOX});
    actor.set_accessible_name(`Usage history range, ${range}`);
    actor.connect('clicked', onActivate);
    return actor;
}

function providerIcon({path, accessibleName, tokens}) {
    const actor = new St.Icon({style_class: 'claudex-provider-icon',
        gicon: new Gio.FileIcon({file: Gio.File.new_for_path(path)}),
        icon_size: tokens.size.providerIcon, y_align: Clutter.ActorAlign.CENTER});
    actor.set_accessible_name(accessibleName);
    return actor;
}

function providerHeader({id, title, iconPath, tokens}) {
    const actor = box('claudex-provider-header', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    actor.add_child(providerIcon({path: iconPath,
        accessibleName: `${title} mark`, tokens}));
    actor.add_child(label(title, 'claudex-provider-name', {x_expand: true}));
    actor.set_name(`refinement-provider-${id}`);
    return actor;
}

function metricModel(usage, showTimePace) {
    return {id: usage.id, label: usage.window, percent: usage.percent,
        resetLabel: usage.reset, dataRole: usage.dataRole,
        accessibleName: `${usage.percent}% of ${usage.window} used` +
            (showTimePace ? `; Time pace ${usage.pacePercent}% used` : '')};
}

function paceMarker(usage, tokens) {
    const markerWidth = 2;
    return new St.Widget({name: `pace-${usage.id}`,
        style: `background-color: ${tokens.color.foregroundPrimary};`,
        width: markerWidth, height: tokens.size.progressHeight,
        x: Math.max(0, Math.min(tokens.size.progressWidth - markerWidth,
            progressWidth(usage.pacePercent, tokens.size.progressWidth) -
                markerWidth / 2)), y: 0});
}

function metric({usage, showTimePace, tokens}) {
    const actor = column('claudex-metric', {x_expand: true});
    const top = box('claudex-metric-top', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    top.add_child(label(usage.window, 'claudex-window', {x_expand: true}));
    top.add_child(label(`${usage.percent}%`, 'claudex-percent'));
    actor.add_child(top);
    const progress = ProgressBar({metric: metricModel(usage, showTimePace), tokens});
    if (showTimePace)
        {progress.add_child(paceMarker(usage, tokens));}
    actor.add_child(progress);
    actor.add_child(label(usage.reset, 'claudex-reset'));
    return actor;
}

function providerCard({id, title, metrics, showTimePace, extensionPath, tokens}) {
    const actor = column('claudex-provider-card', {name: `refinement-card-${id}`});
    actor.add_child(providerHeader({id, title,
        iconPath: `${extensionPath}/icons/${id}.svg`, tokens}));
    for (const usage of metrics)
        {actor.add_child(metric({usage, showTimePace, tokens}));}
    return actor;
}

function buildHeader(model) {
    const header = box('claudex-header', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    const copy = column('claudex-title-copy', {x_expand: true});
    copy.add_child(label('USAGE', 'claudex-kicker'));
    copy.add_child(label('Claude + Codex', 'claudex-title'));
    header.add_child(copy);
    header.add_child(IconButton({id: 'refinement-refresh-button',
        iconName: 'view-refresh-symbolic', accessibleName: 'Refresh usage',
        onActivate: model.actions.refresh, tokens: model.tokens, busy: false}));
    header.add_child(IconButton({id: 'settings-button',
        iconName: 'preferences-system-symbolic', accessibleName: 'Open settings',
        onActivate: model.actions.openSettings, tokens: model.tokens}));
    return header;
}

function buildHistory(model) {
    const history = column('claudex-history');
    const header = box('claudex-history-header', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    header.add_child(label('Usage history', 'claudex-section-title',
        {x_expand: true}));
    header.add_child(rangeSelect({range: model.state.activeRange,
        onActivate: model.actions.cycleRange, tokens: model.tokens}));
    history.add_child(header);
    history.add_child(HistoryChart({id: 'refinement-history-chart',
        accessibleName: `Usage history for ${model.state.activeRange}, ` +
            'from zero to one hundred percent',
        series: [
            {id: 'claudeShort', values: HISTORY.claudeShort,
                dataRole: USAGE.claudeShort.dataRole,
                strokeWidth: model.tokens.stroke.claudeShort},
            {id: 'claudeWeekly', values: HISTORY.claudeWeekly,
                dataRole: USAGE.claudeWeekly.dataRole,
                strokeWidth: model.tokens.stroke.weekly},
            {id: 'codexWeekly', values: HISTORY.codexWeekly,
                dataRole: USAGE.codexWeekly.dataRole,
                strokeWidth: model.tokens.stroke.weekly},
        ], tokens: model.tokens}));
    history.add_child(Legend({entries: [
        {id: 'claudeShort', label: 'Claude 5-hour',
            dataRole: USAGE.claudeShort.dataRole},
        {id: 'claudeWeekly', label: 'Claude weekly',
            dataRole: USAGE.claudeWeekly.dataRole},
        {id: 'codexWeekly', label: 'Codex weekly',
            dataRole: USAGE.codexWeekly.dataRole},
    ], tokens: model.tokens}));
    return history;
}

function footer() {
    const actor = box('claudex-footer', Clutter.Orientation.HORIZONTAL,
        {name: 'refinement-footer', x_expand: true});
    actor.add_child(label('Updated 3 min ago', 'claudex-updated', {x_expand: true}));
    return actor;
}

export function buildCatalogUsageView(model) {
    const children = [buildHeader(model), providerCard({id: 'claude',
        title: 'Claude', metrics: [USAGE.claudeShort, USAGE.claudeWeekly],
        showTimePace: model.state.timePace, extensionPath: model.extensionPath,
        tokens: model.tokens}), providerCard({id: 'codex', title: 'Codex',
        metrics: [USAGE.codexWeekly], showTimePace: model.state.timePace,
        extensionPath: model.extensionPath, tokens: model.tokens}),
    buildHistory(model), footer()];
    return PopoverScaffold({id: 'usage-catalog', view: 'usage', children});
}
