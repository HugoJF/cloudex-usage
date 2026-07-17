export const PANEL_LIMITS = Object.freeze([
    Object.freeze({
        id: 'showClaudeShort',
        key: 'show-claude-short',
        dataRole: 'dataClaudeShort',
        title: 'Claude 5-hour',
        description: 'Show this limit in the top panel',
    }),
    Object.freeze({
        id: 'showClaudeWeekly',
        key: 'show-claude-weekly',
        dataRole: 'dataClaudeWeekly',
        title: 'Claude weekly',
        description: 'Show this limit in the top panel',
    }),
    Object.freeze({
        id: 'showCodexWeekly',
        key: 'show-codex-weekly',
        dataRole: 'dataCodexWeekly',
        title: 'Codex weekly',
        description: 'Show this limit in the top panel',
    }),
]);

export const REFRESH_INTERVALS = Object.freeze([
    Object.freeze({index: 0, nick: 'five-minutes', label: '5 min', ms: 5 * 60 * 1000}),
    Object.freeze({index: 1, nick: 'ten-minutes', label: '10 min', ms: 10 * 60 * 1000}),
    Object.freeze({index: 2, nick: 'fifteen-minutes', label: '15 min', ms: 15 * 60 * 1000}),
]);

export const REFRESH_INTERVAL_KEY = 'refresh-interval';

const LIMIT_BY_KEY = new Map(PANEL_LIMITS.map(limit => [limit.key, limit]));

function frozen(value) {
    return Object.freeze(value);
}

export function isPreferenceKey(key) {
    return LIMIT_BY_KEY.has(key) || key === REFRESH_INTERVAL_KEY;
}

export function refreshInterval(index) {
    if (!Number.isInteger(index) || !REFRESH_INTERVALS[index])
        throw new Error('Refresh interval enum must be a known integer');
    return REFRESH_INTERVALS[index];
}

export function nextRefreshInterval(index) {
    return REFRESH_INTERVALS[(refreshInterval(index).index + 1) % REFRESH_INTERVALS.length];
}

export function readPanelPreferences(settings) {
    if (!settings || typeof settings.get_boolean !== 'function' ||
        typeof settings.get_enum !== 'function')
        throw new Error('Panel preferences require GSettings accessors');
    const visibility = {};
    for (const limit of PANEL_LIMITS) {
        const value = settings.get_boolean(limit.key);
        if (typeof value !== 'boolean')
            throw new Error(`Panel preference ${limit.key} must be boolean`);
        visibility[limit.dataRole] = value;
    }
    const interval = refreshInterval(settings.get_enum(REFRESH_INTERVAL_KEY));
    return frozen({
        visibility: frozen(visibility),
        refreshInterval: interval,
    });
}
