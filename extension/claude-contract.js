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
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unavailable() {
    return Object.freeze({status: 'unavailable'});
}

export function extractClaudeAccessToken(authPayload) {
    try {
        if (!isRecord(authPayload) || !isRecord(authPayload.claudeAiOauth))
            {return null;}
        const value = authPayload.claudeAiOauth.accessToken;
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

function timestampParts(value) {
    const match = typeof value === 'string' ? ISO_8601.exec(value) : null;
    if (!match)
        {return null;}
    const [, yearText, monthText, dayText, hourText, minuteText, secondText,
        fraction, zone] = match;
    return {year: Number(yearText), month: Number(monthText), day: Number(dayText),
        hour: Number(hourText), minute: Number(minuteText),
        second: Number(secondText), fraction, zone};
}

function inRange(value, minimum, maximum) {
    return value >= minimum && value <= maximum;
}

function calendarEpoch(parts) {
    const {year, month, day, hour, minute, second} = parts;
    const validFields = [inRange(year, MIN_YEAR, MAX_YEAR),
        inRange(month, 1, MAX_MONTH), inRange(day, 1, MAX_DAY),
        inRange(hour, 0, MAX_HOUR), inRange(minute, 0, MAX_MINUTE),
        inRange(second, 0, MAX_SECOND)];
    if (!validFields.every(Boolean))
        {return null;}
    const base = Date.UTC(year, month - 1, day, hour, minute, second);
    const back = new Date(base);
    const observed = [back.getUTCFullYear(), back.getUTCMonth() + 1,
        back.getUTCDate(), back.getUTCHours(), back.getUTCMinutes(),
        back.getUTCSeconds()];
    return observed.every((value, index) => value ===
        [year, month, day, hour, minute, second][index]) ? base : null;
}

function offsetMilliseconds(zone) {
    if (zone === 'Z')
        {return 0;}
    const [signText, hourTens, hourOnes,, minuteTens, minuteOnes] = zone;
    const hour = Number(`${hourTens}${hourOnes}`);
    const minute = Number(`${minuteTens}${minuteOnes}`);
    if (hour > MAX_OFFSET_HOUR || minute > MAX_MINUTE ||
        hour === MAX_OFFSET_HOUR && minute !== 0)
        {return null;}
    const sign = signText === '-' ? -1 : 1;
    return sign * (hour * MINUTES_PER_HOUR + minute) * MILLISECONDS_PER_MINUTE;
}

function resetAtMs(value) {
    const parts = timestampParts(value);
    if (!parts)
        {return null;}
    const base = calendarEpoch(parts);
    const offset = offsetMilliseconds(parts.zone);
    if (base === null || offset === null)
        {return null;}
    const fractionMs = parts.fraction === undefined ? 0
        : Number(parts.fraction.slice(0, MILLISECONDS_DIGITS)
            .padEnd(MILLISECONDS_DIGITS, '0'));
    const ms = base + fractionMs - offset;
    if (!Number.isSafeInteger(ms) || ms < 0)
        {return null;}
    return ms;
}

export function mapClaudeUsage(payload) {
    try {
        if (!isRecord(payload))
            {return unavailable();}
        const readings = [];
        for (const [field, id] of WINDOWS) {
            const window = payload[field];
            if (!isRecord(window))
                {return unavailable();}
            const percent = window.utilization;
            if (typeof percent !== 'number' || !Number.isFinite(percent) ||
                percent < 0 || percent > 100)
                {return unavailable();}
            const ms = resetAtMs(window.resets_at);
            if (ms === null)
                {return unavailable();}
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
