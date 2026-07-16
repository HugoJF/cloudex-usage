export const LIMIT_KEYS = Object.freeze([
    'showClaudeShort',
    'showClaudeWeekly',
    'showCodexWeekly',
]);

export const RANGES = Object.freeze(['1h', '6h', '1d', '7d', '30d']);

export const USAGE = Object.freeze({
    claudeShort: Object.freeze({
        id: 'claudeShort',
        provider: 'Claude',
        window: '5-hour window',
        percent: 8,
        reset: 'Resets in 3 hr, 50 min',
        dataRole: 'dataClaudeShort',
    }),
    claudeWeekly: Object.freeze({
        id: 'claudeWeekly',
        provider: 'Claude',
        window: 'Weekly window',
        percent: 68,
        reset: 'Resets in 1 day, 17 hr',
        dataRole: 'dataClaudeWeekly',
    }),
    codexWeekly: Object.freeze({
        id: 'codexWeekly',
        provider: 'Codex',
        window: 'Weekly window',
        percent: 42,
        reset: 'Resets in 4 days, 2 hr',
        dataRole: 'dataCodexWeekly',
    }),
});

export const HISTORY = Object.freeze({
    claudeShort: Object.freeze([
        2, 2, 2, 7, 7, 7, 11, 11, 13, 13, 13, 16, 18, 21, 23, 24, 26,
        27, 29, 29, 31, 31, 34, 36, 4, 7, 8, 8, 8, 8,
    ]),
    claudeWeekly: Object.freeze([
        61, 61, 62, 62, 62, 63, 63, 63, 63, 64, 64, 64, 64, 64, 65,
        65, 65, 65, 66, 66, 66, 66, 67, 67, 67, 67, 68, 68, 68, 68,
    ]),
    codexWeekly: Object.freeze([
        27, 27, 28, 28, 29, 30, 30, 31, 31, 32, 33, 34, 34, 35, 36,
        36, 37, 37, 38, 38, 39, 39, 40, 40, 40, 41, 41, 41, 42, 42,
    ]),
});

const REQUIRED_TOKENS = Object.freeze({
    'color.surfaceRoot': 'string',
    'color.surfaceRaised': 'string',
    'color.surfaceControl': 'string',
    'color.surfaceChart': 'string',
    'color.surfaceHover': 'string',
    'color.foregroundPrimary': 'string',
    'color.foregroundSecondary': 'string',
    'color.foregroundMuted': 'string',
    'color.foregroundSubtle': 'string',
    'color.borderSubtle': 'string',
    'color.borderChart': 'string',
    'color.focus': 'string',
    'color.switchInactive': 'string',
    'color.switchActive': 'string',
    'color.switchThumb': 'string',
    'color.switchShadow': 'string',
    'color.dataClaudeShort': 'string',
    'color.dataClaudeWeekly': 'string',
    'color.dataCodexWeekly': 'string',
    'color.grid': 'string',
    'color.separator': 'string',
    'color.hoverOverlay': 'string',
    'radius.control': 'number',
    'radius.card': 'number',
    'radius.chart': 'number',
    'radius.popover': 'number',
    'radius.pill': 'number',
    'space.micro': 'number',
    'space.iconText': 'number',
    'space.compact': 'number',
    'space.control': 'number',
    'space.cardInset': 'number',
    'space.section': 'number',
    'space.popoverInset': 'number',
    'type.kicker.size': 'number',
    'type.kicker.weight': 'number',
    'type.kicker.tracking': 'number',
    'type.supporting.size': 'number',
    'type.legend.size': 'number',
    'type.meta.size': 'number',
    'type.body.size': 'number',
    'type.bodyStrong.size': 'number',
    'type.bodyStrong.weight': 'number',
    'type.title.size': 'number',
    'type.title.weight': 'number',
    'size.popoverMinWidth': 'number',
    'size.progressWidth': 'number',
    'size.progressHeight': 'number',
    'size.chartHeight': 'number',
    'size.chartAxisWidth': 'number',
    'size.panelProviderIcon': 'number',
    'size.providerIcon': 'number',
    'size.settingsIcon': 'number',
    'size.iconButtonHitTarget': 'number',
    'size.switchTrackWidth': 'number',
    'size.switchTrackHeight': 'number',
    'size.switchThumb': 'number',
    'size.switchInset': 'number',
    'stroke.grid': 'number',
    'stroke.claudeShort': 'number',
    'stroke.weekly': 'number',
});

function valueAtPath(root, path) {
    return path.split('.').reduce((value, key) => value?.[key], root);
}

export function tokenValue(tokens, path) {
    const value = valueAtPath(tokens, path);
    if (value === undefined)
        throw new Error(`Missing design token: ${path}`);
    return value;
}

export function validateTokens(tokens) {
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens))
        throw new Error('Design token manifest must be an object');

    for (const [path, expectedType] of Object.entries(REQUIRED_TOKENS)) {
        const value = tokenValue(tokens, path);
        if (typeof value !== expectedType)
            throw new Error(`Design token ${path} must be a ${expectedType}`);
        if (expectedType === 'number' && (!Number.isFinite(value) || value < 0))
            throw new Error(`Design token ${path} must be a non-negative finite number`);
    }

    for (const [name, value] of Object.entries(tokens.color)) {
        const validHex = /^#[0-9a-f]{6}$/i.test(value);
        const validRgba = /^rgba\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*(?:0|1|0?\.\d+)\s*\)$/i.test(value);
        if (!validHex && !validRgba)
            throw new Error(`Design token color.${name} is not a supported CSS color`);
    }

    const expectedThumbTravel = tokens.size.switchTrackWidth -
        tokens.size.switchThumb - tokens.size.switchInset;
    if (expectedThumbTravel <= tokens.size.switchInset)
        throw new Error('Switch geometry leaves no room for thumb travel');

    return tokens;
}

export function progressWidth(percent, trackWidth) {
    if (!Number.isFinite(percent) || !Number.isFinite(trackWidth) || trackWidth < 0)
        throw new TypeError('Progress geometry requires finite, non-negative inputs');
    const clamped = Math.min(100, Math.max(0, percent));
    return Math.round(trackWidth * clamped / 100);
}

export function colorToRgba(color) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        return [
            Number.parseInt(color.slice(1, 3), 16) / 255,
            Number.parseInt(color.slice(3, 5), 16) / 255,
            Number.parseInt(color.slice(5, 7), 16) / 255,
            1,
        ];
    }

    const match = color.match(/^rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(0|1|0?\.\d+)\s*\)$/i);
    if (!match)
        throw new Error(`Unsupported color: ${color}`);
    return [Number(match[1]) / 255, Number(match[2]) / 255,
        Number(match[3]) / 255, Number(match[4])];
}

export class CatalogState {
    constructor() {
        this.view = 'usage';
        this.activeRange = '6h';
        this.refreshInterval = '5 min';
        this.showClaudeShort = true;
        this.showClaudeWeekly = true;
        this.showCodexWeekly = true;
        this.presentOnly = true;
        this.localHistory = true;
    }

    setView(view) {
        if (!['usage', 'settings'].includes(view))
            throw new Error(`Unknown catalog view: ${view}`);
        this.view = view;
    }

    selectRange(range) {
        if (!RANGES.includes(range))
            throw new Error(`Unknown history range: ${range}`);
        this.activeRange = range;
    }

    toggle(key) {
        if (![...LIMIT_KEYS, 'presentOnly', 'localHistory'].includes(key))
            throw new Error(`Unknown catalog toggle: ${key}`);
        this[key] = !this[key];
        return this[key];
    }

    cycleRefreshInterval() {
        const intervals = ['5 min', '10 min', '15 min'];
        const index = intervals.indexOf(this.refreshInterval);
        this.refreshInterval = intervals[(index + 1) % intervals.length];
        return this.refreshInterval;
    }

    snapshot() {
        return Object.freeze({
            view: this.view,
            activeRange: this.activeRange,
            refreshInterval: this.refreshInterval,
            showClaudeShort: this.showClaudeShort,
            showClaudeWeekly: this.showClaudeWeekly,
            showCodexWeekly: this.showCodexWeekly,
            presentOnly: this.presentOnly,
            localHistory: this.localHistory,
        });
    }
}
