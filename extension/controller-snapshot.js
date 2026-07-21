import {
    elapsedWindowPercent,
    formatFreshness,
    formatReset,
    isValidClock,
    WEEK_MS,
    weekdayElapsedWindowPercent,
} from './temporal.js';

function frozen(value) {
    return Object.freeze(value);
}

function snapshotMetric(presentation, result, window, clock) {
    const reading = result.readings.find(item => item.id === window.id);
    const metric = {
        id: `${presentation.id}--${window.id}`,
        windowId: window.id,
        label: window.label,
        percent: reading.percent,
        resetAtMs: reading.resetAtMs,
        resetLabel: clock.valid
            ? formatReset(reading.resetAtMs, clock.now)
            : 'Reset time unavailable',
        dataRole: window.dataRole,
        accessibleName: `${presentation.label} ${window.label} at ` +
            `${reading.percent} percent`,
    };
    if (clock.valid && window.durationMs !== undefined) {
        metric.elapsedPercent = elapsedWindowPercent(
            window.durationMs, reading.resetAtMs, clock.now);
        if (window.durationMs === WEEK_MS) {
            metric.weekdayElapsedPercent = weekdayElapsedWindowPercent(
                reading.resetAtMs, clock.now);
        }
    }
    return frozen(metric);
}

function snapshotProvider(state, now, clockValid) {
    const {presentation, result} = state;
    const metrics = result?.status === 'available'
        ? presentation.windows.map(window =>
            snapshotMetric(presentation, result, window,
                {now, valid: clockValid}))
        : [];
    return frozen({
        ...presentation,
        availability: result?.status ?? 'pending',
        metrics: frozen(metrics),
    });
}

function footerFor(providers, lastCompletedAtMs, now, clockValid) {
    const hasResults = providers.some(provider =>
        provider.availability !== 'pending');
    if (!hasResults) {
        return 'Not checked yet';
    }
    if (!clockValid) {
        return 'Update time unavailable';
    }
    if (providers.some(provider => provider.availability === 'available')) {
        return formatFreshness(lastCompletedAtMs, now);
    }
    const relative = lastCompletedAtMs === null
        ? 'just now'
        : formatFreshness(lastCompletedAtMs, now).replace(/^Updated /, '');
    return `Checked ${relative}`;
}

export function buildSurfaceSnapshot(states, refreshing, lastCompletedAtMs, now) {
    const clockValid = isValidClock(now);
    const providers = states.map(state => snapshotProvider(state, now, clockValid));
    return frozen({
        providers: frozen(providers),
        refreshing,
        footer: footerFor(providers, lastCompletedAtMs, now, clockValid),
        visible: providers.length > 0,
        clockValid,
    });
}
