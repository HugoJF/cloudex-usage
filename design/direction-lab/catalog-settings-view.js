import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {ChoiceRow} from './shared/choice-row.js';
import {PopoverScaffold} from './shared/popover-scaffold.js';
import {SettingsRow} from './shared/settings-row.js';

function box(styleClass, orientation = Clutter.Orientation.HORIZONTAL,
    properties = {}) {
    return new St.BoxLayout({style_class: styleClass, orientation, ...properties});
}

function column(styleClass) {
    return box(styleClass, Clutter.Orientation.VERTICAL);
}

function label(text, styleClass, properties = {}) {
    return new St.Label({text, style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER, ...properties});
}

function section(title) {
    const actor = column('claudex-settings-section');
    actor.add_child(label(title, 'claudex-settings-kicker'));
    return actor;
}

function buildPanelSection(model) {
    const actor = section('PANEL');
    for (const [id, title] of [
        ['showClaudeShort', 'Claude 5-hour'],
        ['showClaudeWeekly', 'Claude weekly'],
        ['showCodexWeekly', 'Codex weekly'],
    ]) {
        actor.add_child(SettingsRow({id, title,
            description: 'Show this limit in the top panel', accessibleName: title,
            active: model.state[id], onToggle: model.actions.toggle,
            tokens: model.tokens}));
    }
    actor.add_child(ChoiceRow({id: 'usage-display-choice', title: 'Usage display',
        value: 'Used  ›', accessibleName: 'Usage display, Used',
        onActivate: () => {}}));
    return actor;
}

function buildDisplaySection(model) {
    const actor = section('DISPLAY');
    actor.add_child(SettingsRow({id: 'timePace', title: 'Time pace markers',
        description: 'Compare usage with elapsed window time',
        accessibleName: 'Time pace markers', active: model.state.timePace,
        onToggle: model.actions.toggle, tokens: model.tokens}));
    actor.add_child(ChoiceRow({id: 'weekly-pace-choice', title: 'Weekly pace',
        value: `${model.state.weeklyPace}  ›`,
        accessibleName: `Weekly pace, ${model.state.weeklyPace}`,
        onActivate: model.actions.cycleWeeklyPace}));
    return actor;
}

function buildHistorySection(model) {
    const actor = section('HISTORY');
    actor.add_child(SettingsRow({id: 'localHistory', title: 'Local usage history',
        description: 'Record and chart usage on this machine',
        accessibleName: 'Local usage history', active: model.state.localHistory,
        onToggle: model.actions.toggle, tokens: model.tokens}));
    return actor;
}

function buildUpdatesSection(model) {
    const actor = section('UPDATES');
    actor.add_child(ChoiceRow({id: 'refresh-interval-choice',
        title: 'Refresh while visible', value: `${model.state.refreshInterval}  ›`,
        accessibleName: `Refresh while visible, ${model.state.refreshInterval}`,
        onActivate: model.actions.cycleRefreshInterval}));
    return actor;
}

export function buildCatalogSettingsView(model) {
    const header = box('claudex-settings-header', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    const back = new St.Button({name: 'back-button',
        style_class: 'claudex-back-button', can_focus: true, reactive: true,
        track_hover: true, child: label('← Usage', 'claudex-button-label')});
    back.set_accessible_name('Back to usage');
    back.connect('clicked', model.actions.openUsage);
    header.add_child(back);
    header.add_child(label('Settings', 'claudex-settings-title', {x_expand: true}));
    return PopoverScaffold({id: 'usage-refinement-settings', view: 'settings',
        children: [header, buildPanelSection(model), buildDisplaySection(model),
            buildHistorySection(model), buildUpdatesSection(model)]});
}
