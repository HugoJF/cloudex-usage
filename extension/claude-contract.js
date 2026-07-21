const WINDOWS = [
    ['five_hour', 'short'],
    ['seven_day', 'weekly'],
];

const ISO_8601 =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;
const MIN_YEAR = 1970;
const MAX_YEAR = 9999;
const MAX_MONTH = 12;
const MAX_DAY = 31;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MAX_SECOND = 59;
const MAX_OFFSET_HOUR = 14;
const MILLISECONDS_DIGITS = 3;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unavailable() {
    return Object.freeze({status: 'unavailable'});
}

export function extractClaudeAccessToken(authPayload) {
    try {
        if (!isRecord(authPayload) || !isRecord(authPayload.claudeAiOauth))
            return null;
        const value = authPayload.claudeAiOauth.accessToken;
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

function resetAtMs(value) {
    if (typeof value !== 'string')
        return null;
    const match = ISO_8601.exec(value);
    if (match === null)
        return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText,
        fraction, zone] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (year < MIN_YEAR || year > MAX_YEAR ||
        month < 1 || month > MAX_MONTH || day < 1 || day > MAX_DAY ||
        hour > MAX_HOUR || minute > MAX_MINUTE || second > MAX_SECOND)
        return null;
    const base = Date.UTC(year, month - 1, day, hour, minute, second);
    const back = new Date(base);
    if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 ||
        back.getUTCDate() !== day || back.getUTCHours() !== hour ||
        back.getUTCMinutes() !== minute || back.getUTCSeconds() !== second)
        return null;
    const fractionMs = fraction === undefined ? 0
        : Number(fraction.slice(0, MILLISECONDS_DIGITS)
            .padEnd(MILLISECONDS_DIGITS, '0'));
    let ms = base + fractionMs;
    if (zone !== 'Z') {
        const sign = zone[0] === '-' ? -1 : 1;
        const offsetHour = Number(zone.slice(1, 3));
        const offsetMinute = Number(zone.slice(4, 6));
        if (offsetHour > MAX_OFFSET_HOUR || offsetMinute > MAX_MINUTE ||
            (offsetHour === MAX_OFFSET_HOUR && offsetMinute !== 0))
            return null;
        const offsetMinutes = offsetHour * MINUTES_PER_HOUR + offsetMinute;
        ms -= sign * offsetMinutes * MILLISECONDS_PER_MINUTE;
    }
    if (!Number.isSafeInteger(ms) || ms < 0)
        return null;
    return ms;
}

export function mapClaudeUsage(payload) {
    try {
        if (!isRecord(payload))
            return unavailable();
        const readings = [];
        for (const [field, id] of WINDOWS) {
            const window = payload[field];
            if (!isRecord(window))
                return unavailable();
            const percent = window.utilization;
            if (typeof percent !== 'number' || !Number.isFinite(percent) ||
                percent < 0 || percent > 100)
                return unavailable();
            const ms = resetAtMs(window.resets_at);
            if (ms === null)
                return unavailable();
            readings.push(Object.freeze({id, percent, resetAtMs: ms}));
        }
        return Object.freeze({
            status: 'available',
            readings: Object.freeze(readings),
        });
    } catch {
        return unavailable();
    }
}
