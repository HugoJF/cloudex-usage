const WEEK_SECONDS = 7 * 24 * 60 * 60;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unavailable() {
    return Object.freeze({status: 'unavailable'});
}

export function extractCodexAccessToken(authPayload) {
    try {
        if (!isRecord(authPayload) || !isRecord(authPayload.tokens))
            return null;
        const value = authPayload.tokens.access_token;
        if (typeof value !== 'string')
            return null;
        const token = value.trim().replace(/^Bearer(?:\s+|$)/i, '').trim();
        if (token.length === 0 || /\s/.test(token))
            return null;
        return token;
    } catch {
        return null;
    }
}

export function mapCodexUsage(payload) {
    try {
        if (!isRecord(payload) || !isRecord(payload.rate_limit))
            return unavailable();
        const windows = [
            payload.rate_limit.primary_window,
            payload.rate_limit.secondary_window,
        ];
        const weekly = windows.filter(window =>
            isRecord(window) && window.limit_window_seconds === WEEK_SECONDS);
        if (weekly.length !== 1)
            return unavailable();

        const [{used_percent: percent, reset_at: resetAtSeconds}] = weekly;
        if (typeof percent !== 'number' || !Number.isFinite(percent) ||
            percent < 0 || percent > 100 ||
            !Number.isInteger(resetAtSeconds) || resetAtSeconds < 0) {
            return unavailable();
        }
        const resetAtMs = resetAtSeconds * 1000;
        if (!Number.isSafeInteger(resetAtMs))
            return unavailable();

        const reading = Object.freeze({id: 'weekly', percent, resetAtMs});
        return Object.freeze({
            status: 'available',
            readings: Object.freeze([reading]),
        });
    } catch {
        return unavailable();
    }
}
