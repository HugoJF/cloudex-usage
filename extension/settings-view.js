import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {ChoiceRow} from './shared/choice-row.js';
import {SettingsRow} from './shared/settings-row.js';
import {
    nextRefreshInterval,
    nextUsageDisplay,
    nextWeeklyPace,
    PANEL_LIMITS,
    TIME_PACE_KEY,
    USAGE_DISPLAY_KEY,
    WEEKLY_PACE_KEY,
} from './panel-preferences.js';

function column(styleClass) {
    return new St.BoxLayout({style_class: styleClass,
        orientation: Clutter.Orientation.VERTICAL, x_expand: true});
}

function section(title) {
    const actor = column('claudex-settings-section');
    actor.add_child(new St.Label({text: title,
        style_class: 'claudex-settings-kicker',
        y_align: Clutter.ActorAlign.CENTER}));
    return actor;
}

function panelSection(model) {
    const actor = section('PANEL');
    for (const limit of PANEL_LIMITS) {
        actor.add_child(SettingsRow({...limit, accessibleName: limit.title,
            active: model.preferences.visibility[limit.dataRole],
            onToggle: () => model.settings.set_boolean(limit.key,
                !model.preferences.visibility[limit.dataRole]),
            tokens: model.tokens}));
    }
    const display = model.preferences.usageDisplay;
    actor.add_child(ChoiceRow({id: 'usage-display-choice', title: 'Usage display',
        value: `${display.label}  ›`,
        accessibleName: `Usage display, ${display.label}`,
        onActivate: () => model.settings.set_enum(USAGE_DISPLAY_KEY,
            nextUsageDisplay(display.index).index)}));
    return actor;
}

function displaySection(model) {
    const actor = section('DISPLAY');
    actor.add_child(SettingsRow({id: 'showTimePace', title: 'Time pace markers',
        description: 'Compare usage with elapsed window time',
        accessibleName: 'Time pace markers', active: model.preferences.timePace,
        onToggle: () => model.settings.set_boolean(TIME_PACE_KEY,
            !model.preferences.timePace), tokens: model.tokens}));
    const pace = model.preferences.weeklyPace;
    actor.add_child(ChoiceRow({id: 'weekly-pace-choice', title: 'Weekly pace',
        value: `${pace.label}  ›`, accessibleName: `Weekly pace, ${pace.label}`,
        onActivate: () => model.settings.set_enum(WEEKLY_PACE_KEY,
            nextWeeklyPace(pace.index).index)}));
    return actor;
}

function historySection(model) {
    const actor = section('HISTORY');
    actor.add_child(SettingsRow({id: 'showUsageHistory',
        title: 'Local usage history',
        description: 'Record and chart usage on this machine',
        accessibleName: 'Local usage history',
        active: model.preferences.localHistory,
        onToggle: () => model.settings.set_boolean('show-usage-history',
            !model.preferences.localHistory), tokens: model.tokens}));
    return actor;
}

function updatesSection(model) {
    const actor = section('UPDATES');
    const interval = model.preferences.refreshInterval;
    actor.add_child(ChoiceRow({id: 'refresh-interval-choice',
        title: 'Refresh while visible', value: `${interval.label}  ›`,
        accessibleName: `Refresh while visible, ${interval.label}`,
        onActivate: () => model.settings.set_enum('refresh-interval',
            nextRefreshInterval(interval.index).index)}));
    return actor;
}

export function buildSettingsView(model) {
    const header = new St.BoxLayout({style_class: 'claudex-settings-header',
        orientation: Clutter.Orientation.HORIZONTAL, x_expand: true});
    const back = new St.Button({name: 'back-button',
        style_class: 'claudex-back-button', can_focus: true, reactive: true,
        track_hover: true, child: new St.Label({text: '← Usage',
            style_class: 'claudex-button-label',
            y_align: Clutter.ActorAlign.CENTER})});
    back.set_accessible_name('Back to usage');
    back.connect('clicked', model.onBack);
    header.add_child(back);
    header.add_child(new St.Label({text: 'Settings',
        style_class: 'claudex-settings-title', x_expand: true,
        y_align: Clutter.ActorAlign.CENTER}));
    return [header, panelSection(model), displaySection(model),
        historySection(model), updatesSection(model)];
}
