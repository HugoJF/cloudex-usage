import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {FooterStatus} from './shared/footer-status.js';
import {IconButton} from './shared/icon-button.js';
import {ProviderCard} from './shared/provider-card.js';
import {ProviderGroup} from './shared/provider-group.js';

function column(styleClass, name = null) {
    return new St.BoxLayout({name, style_class: styleClass,
        orientation: Clutter.Orientation.VERTICAL, x_expand: true});
}

export function displayUsageMetric(provider, metric, preferences,
    toDisplayPercent) {
    const percent = toDisplayPercent(metric.percent);
    let elapsedPercent = metric.elapsedPercent;
    if (preferences.weeklyPace.id === 'weekdays' &&
        Object.hasOwn(metric, 'weekdayElapsedPercent'))
        {elapsedPercent = metric.weekdayElapsedPercent ?? undefined;}
    const pacePercent = preferences.timePace && elapsedPercent !== undefined
        ? toDisplayPercent(elapsedPercent)
        : undefined;
    const paceAccessible = pacePercent === undefined
        ? ''
        : `; Time pace ${Math.round(pacePercent)} percent ` +
            preferences.usageDisplay.id;
    return {
        ...metric,
        percent,
        ...(pacePercent === undefined ? {} : {pacePercent}),
        accessibleName: `${provider.label} ${metric.label} at ${percent} percent ` +
            preferences.usageDisplay.id + paceAccessible,
    };
}

function providerCard(provider, model) {
    const presentation = {
        id: `provider-${provider.id}`,
        label: provider.label,
        iconPath: `${model.extensionPath}/${provider.marks.popup}`,
        iconAccessibleName: provider.marks.accessibleName,
    };
    if (provider.availability === 'available') {
        return ProviderCard({
            id: `provider-card-${provider.id}`,
            provider: presentation,
            metrics: provider.metrics.map(metric => displayUsageMetric(provider, metric,
                model.preferences, model.displayPercent)),
            tokens: model.tokens,
        });
    }
    const card = column('cloudex-provider-card', `provider-card-${provider.id}`);
    card.add_child(ProviderGroup({model: presentation, tokens: model.tokens}));
    card.add_child(new St.Label({name: `unavailable-${provider.id}`,
        text: 'Usage unavailable', style_class: 'cloudex-provider-detail'}));
    return card;
}

function header(model) {
    const actor = new St.BoxLayout({style_class: 'cloudex-header',
        orientation: Clutter.Orientation.HORIZONTAL, x_expand: true});
    const copy = column('cloudex-title-copy');
    copy.add_child(new St.Label({text: 'USAGE', style_class: 'cloudex-kicker',
        y_align: Clutter.ActorAlign.CENTER}));
    copy.add_child(new St.Label({text: 'Claude + Codex',
        style_class: 'cloudex-title', y_align: Clutter.ActorAlign.CENTER}));
    actor.add_child(copy);
    actor.add_child(IconButton({id: 'refresh-button',
        iconName: model.snapshot.refreshing
            ? 'process-working-symbolic' : 'view-refresh-symbolic',
        accessibleName: model.snapshot.refreshing
            ? 'Refreshing usage' : 'Refresh usage',
        onActivate: model.onRefresh, tokens: model.tokens,
        busy: model.snapshot.refreshing}));
    actor.add_child(IconButton({id: 'settings-button',
        iconName: 'preferences-system-symbolic', accessibleName: 'Open settings',
        onActivate: model.onOpenSettings, tokens: model.tokens}));
    return actor;
}

export function buildUsageView(model) {
    const children = [header(model), ...model.snapshot.providers.map(provider =>
        providerCard(provider, model))];
    if (model.history)
        {children.push(model.history);}
    children.push(FooterStatus({status: model.snapshot.footer}));
    return children;
}
