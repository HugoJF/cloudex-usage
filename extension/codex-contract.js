const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const WEEK_SECONDS = DAYS_PER_WEEK * HOURS_PER_DAY * MINUTES_PER_HOUR *
    SECONDS_PER_MINUTE;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unavailable() {
    return Object.freeze({status: 'unavailable'});
}

export function extractCodexAccessToken(authPayload) {
    try {
        if (!isRecord(authPayload) || !isRecord(authPayload.tokens))
            {return null;}
        const value = authPayload.tokens.access_token;
        if (typeof value !== 'string')
            {return null;}
        const token = value.trim().replace(/^Bearer(?:\s+|$)/i, '').trim();
        if (token.length === 0 || /\s/.test(token))
            {return null;}
        return token;
    } catch {
        return null;
    }
}

function weeklyWindow(payload) {
    if (!isRecord(payload) || !isRecord(payload.rate_limit))
        {return null;}
    const candidates = [payload.rate_limit.primary_window,
        payload.rate_limit.secondary_window].filter(window =>
        isRecord(window) && window.limit_window_seconds === WEEK_SECONDS);
    return candidates.length === 1 ? candidates[0] : null;
}

function reading(window) {
    if (!window)
        {return null;}
    const {used_percent: percent, reset_at: resetAtSeconds} = window;
    const validPercent = typeof percent === 'number' && Number.isFinite(percent) &&
        percent >= 0 && percent <= 100;
    const validReset = Number.isInteger(resetAtSeconds) && resetAtSeconds >= 0;
    if (!validPercent || !validReset)
        {return null;}
    const resetAtMs = resetAtSeconds * MILLISECONDS_PER_SECOND;
    return Number.isSafeInteger(resetAtMs)
        ? Object.freeze({id: 'weekly', percent, resetAtMs})
        : null;
}

export function mapCodexUsage(payload) {
    try {
        const mapped = reading(weeklyWindow(payload));
        if (!mapped)
            {return unavailable();}
        return Object.freeze({
            status: 'available',
            readings: Object.freeze([mapped]),
        });
    } catch {
        return unavailable();
    }
}
