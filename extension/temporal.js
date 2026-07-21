const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const DAYS_PER_WEEK = 7;
export const WEEK_MS = DAYS_PER_WEEK * HOURS_PER_DAY * MINUTES_PER_HOUR *
    MILLISECONDS_PER_MINUTE;
const MAX_WEEKDAY_SEGMENTS = 9;
const MONDAY = 1;
const FRIDAY = 5;

function requirePositiveSafeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
    }
    return value;
}

function requireClock(value, name = 'Presentation clock') {
    if (!isValidClock(value)) {
        throw new Error(`${name} must be a non-negative safe integer`);
    }
    return value;
}

function plural(value, unit) {
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function isValidClock(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

export function formatReset(resetAtMs, nowMs) {
    const minutes = Math.max(0, Math.ceil(
        (resetAtMs - nowMs) / MILLISECONDS_PER_MINUTE));
    if (minutes === 0) {
        return 'Resets now';
    }
    const days = Math.floor(minutes / MINUTES_PER_DAY);
    const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    const remainingMinutes = minutes % MINUTES_PER_HOUR;
    const parts = [];
    if (days > 0) {
        parts.push(plural(days, 'day'));
    }
    if (hours > 0) {
        parts.push(plural(hours, 'hr'));
    }
    if (remainingMinutes > 0 && days === 0) {
        parts.push(plural(remainingMinutes, 'min'));
    }
    return `Resets in ${parts.join(', ')}`;
}

export function formatFreshness(completedAtMs, nowMs) {
    const minutes = Math.max(0, Math.floor(
        (nowMs - completedAtMs) / MILLISECONDS_PER_MINUTE));
    return minutes === 0
        ? 'Updated just now'
        : `Updated ${plural(minutes, 'min')} ago`;
}

export function nextMinuteDelay(nowMs) {
    requireClock(nowMs);
    const remainder = nowMs % MILLISECONDS_PER_MINUTE;
    return remainder === 0
        ? MILLISECONDS_PER_MINUTE
        : MILLISECONDS_PER_MINUTE - remainder;
}

export function elapsedWindowPercent(durationMs, resetAtMs, nowMs) {
    requirePositiveSafeInteger(durationMs, 'Window duration');
    requireClock(resetAtMs, 'Window reset');
    requireClock(nowMs);
    const startAtMs = resetAtMs - durationMs;
    if (nowMs <= startAtMs) {
        return 0;
    }
    if (nowMs >= resetAtMs) {
        return 100;
    }
    return (durationMs - (resetAtMs - nowMs)) / durationMs * 100;
}

function weekdayMilliseconds(startAtMs, endAtMs) {
    let cursor = startAtMs;
    let total = 0;
    for (let segment = 0; cursor < endAtMs; segment++) {
        if (segment >= MAX_WEEKDAY_SEGMENTS) {
            return null;
        }
        const cursorDate = new Date(cursor);
        const nextDay = new Date(cursor);
        nextDay.setHours(HOURS_PER_DAY, 0, 0, 0);
        const nextAtMs = nextDay.getTime();
        if (!Number.isFinite(cursorDate.getTime()) ||
            !Number.isFinite(nextAtMs) || nextAtMs <= cursor) {
            return null;
        }
        const segmentEndAtMs = Math.min(nextAtMs, endAtMs);
        if (cursorDate.getDay() >= MONDAY && cursorDate.getDay() <= FRIDAY) {
            total += segmentEndAtMs - cursor;
        }
        cursor = segmentEndAtMs;
    }
    return total;
}

export function weekdayElapsedWindowPercent(resetAtMs, nowMs) {
    const startAtMs = resetAtMs - WEEK_MS;
    const durationMs = weekdayMilliseconds(startAtMs, resetAtMs);
    if (durationMs === null || durationMs === 0) {
        return null;
    }
    const elapsedUntilMs = Math.max(startAtMs, Math.min(nowMs, resetAtMs));
    const elapsedMs = weekdayMilliseconds(startAtMs, elapsedUntilMs);
    return elapsedMs === null ? null : elapsedMs / durationMs * 100;
}
