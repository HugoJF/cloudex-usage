import {PanelIndicator} from './shared/panel-indicator.js';

function valuesFor(provider, preferences, displayPercent) {
    return provider.metrics
        .filter(metric => preferences.visibility[metric.dataRole])
        .map(metric => {
            const percent = displayPercent(metric.percent);
            return {
                id: metric.windowId,
                percent,
                accessibleName: `${metric.label}, ${percent} percent ` +
                    preferences.usageDisplay.id,
                tone: metric.dataRole === 'dataClaudeShort' ? 'muted' : 'normal',
            };
        });
}

export function buildPanelView({snapshot, preferences, extensionPath, light,
    displayPercent, tokens}) {
    const groups = snapshot.providers.map(provider => {
        const values = valuesFor(provider, preferences, displayPercent);
        const valueDescription = values.length === 0
            ? 'no panel percentages'
            : values.map(value => `${value.percent} percent ` +
                preferences.usageDisplay.id).join(', ');
        return {
            id: provider.id,
            accessibleName: `${provider.marks.accessibleName}, ${valueDescription}`,
            iconPath: `${extensionPath}/${light
                ? provider.marks.lightPanel
                : provider.marks.darkPanel}`,
            values,
        };
    });
    return PanelIndicator({id: 'claudex-live-panel', groups, tokens});
}
