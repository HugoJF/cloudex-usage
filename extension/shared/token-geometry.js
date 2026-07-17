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

const DECIMAL = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const FUNCTION_COLOR = new RegExp(
    String.raw`^(rgba?)\(\s*(${DECIMAL})\s*,\s*(${DECIMAL})\s*,\s*(${DECIMAL})` +
    String.raw`(?:\s*,\s*(${DECIMAL}))?\s*\)$`, 'i');

function valueAtPath(root, path) {
    return path.split('.').reduce((value, key) => value?.[key], root);
}

export function tokenValue(tokens, path) {
    const value = valueAtPath(tokens, path);
    if (value === undefined)
        throw new Error(`Missing design token: ${path}`);
    return value;
}

export function colorToRgba(color) {
    if (typeof color !== 'string')
        throw new Error(`Unsupported color: ${color}`);
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        return [
            Number.parseInt(color.slice(1, 3), 16) / 255,
            Number.parseInt(color.slice(3, 5), 16) / 255,
            Number.parseInt(color.slice(5, 7), 16) / 255,
            1,
        ];
    }

    const match = color.match(FUNCTION_COLOR);
    if (!match || (match[1].toLowerCase() === 'rgb' && match[5] !== undefined) ||
        (match[1].toLowerCase() === 'rgba' && match[5] === undefined))
        throw new Error(`Unsupported color: ${color}`);

    const channels = match.slice(2, 5).map(Number);
    const alpha = match[5] === undefined ? 1 : Number(match[5]);
    if (channels.some(value => !Number.isFinite(value) || value < 0 || value > 255) ||
        !Number.isFinite(alpha) || alpha < 0 || alpha > 1)
        throw new Error(`Color channels are out of range: ${color}`);
    return [...channels.map(value => value / 255), alpha];
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
        try {
            colorToRgba(value);
        } catch {
            throw new Error(`Design token color.${name} is not a supported CSS color`);
        }
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
