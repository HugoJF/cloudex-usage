import assert from 'node:assert/strict';
import test from 'node:test';

import {
    elapsedWindowPercent,
    formatFreshness,
    formatReset,
    nextMinuteDelay,
} from '../../extension/temporal.js';
import {harness, provider, settle} from './surface-controller-fixtures.js';

test('reset and freshness display round at the intended minute boundaries', () => {
    assert.equal(formatReset(1_000, 1_000), 'Resets now');
    assert.equal(formatReset(1_001, 1_000), 'Resets in 1 min');
    assert.equal(formatReset(61_000, 1_000), 'Resets in 1 min');
    assert.equal(formatReset(3_601_000, 1_000), 'Resets in 1 hr');
    assert.equal(formatReset(90_001_000, 1_000), 'Resets in 1 day, 1 hr');
    assert.equal(formatFreshness(1_000, 1_000), 'Updated just now');
    assert.equal(formatFreshness(1_000, 61_000), 'Updated 1 min ago');
});

test('minute alignment stays bounded and rejects clocks outside its integer domain', () => {
    assert.equal(nextMinuteDelay(0), 60_000);
    assert.equal(nextMinuteDelay(1), 59_999);
    assert.equal(nextMinuteDelay(59_999), 1);
    assert.equal(nextMinuteDelay(60_000), 60_000);
    assert.equal(nextMinuteDelay(65_000), 55_000);
    const extreme = nextMinuteDelay(Number.MAX_SAFE_INTEGER);
    assert(Number.isSafeInteger(extreme) && extreme >= 1 && extreme <= 60_000);
    for (const invalid of [-1, 1.5, NaN, Infinity,
        Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => nextMinuteDelay(invalid));
    }
});

test('invalid clocks preserve readings while omitting temporal derivations', async () => {
    const state = harness();
    state.controller.registerProvider(provider({
        windows: [{
            id: 'short',
            label: '4-minute window',
            dataRole: 'dataClaudeShort',
            durationMs: 240_000,
        }],
    }));
    await settle();
    assert.equal(state.timers.size, 1, 'refresh cadence remains scheduled');

    for (const invalid of [NaN, Infinity, -1, 1.5,
        Number.MAX_SAFE_INTEGER + 1]) {
        state.setNow(invalid);
        const snapshot = state.controller.getSnapshot();
        const metric = snapshot.providers[0].metrics[0];
        assert.equal(snapshot.clockValid, false);
        assert.equal(metric.percent, 25);
        assert.equal(metric.resetLabel, 'Reset time unavailable');
        assert(!Object.hasOwn(metric, 'elapsedPercent'));
        assert(!Object.hasOwn(metric, 'weekdayElapsedPercent'));
        assert.equal(snapshot.footer, 'Update time unavailable');
        assert.equal(state.timers.size, 1, 'invalid presentation time keeps cadence');
    }
});

test('elapsed window percentage clamps safely and stays monotonic', () => {
    const fiveHours = 18_000_000;
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, 0), 0);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, 9_000_000), 50);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, fiveHours), 100);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours, fiveHours + 1), 100);
    assert.equal(elapsedWindowPercent(fiveHours, fiveHours * 2, 0), 0);

    const week = 604_800_000;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const fractional = elapsedWindowPercent(week, week, threeDays);
    assert(Math.abs(fractional - 3 / 7 * 100) < Number.EPSILON * 100);
    const samples = [0, 1, threeDays, week - 1, week]
        .map(now => elapsedWindowPercent(week, week, now));
    assert(samples.every((value, index) => index === 0 ||
        value >= samples[index - 1]));
    assert(samples.every(value => Number.isFinite(value) &&
        value >= 0 && value <= 100));

    const maximum = Number.MAX_SAFE_INTEGER;
    assert.equal(elapsedWindowPercent(maximum, maximum, 0), 0);
    const middle = elapsedWindowPercent(maximum, maximum,
        Math.floor(maximum / 2));
    assert(Number.isFinite(middle) && middle > 49 && middle < 51);
    assert.equal(elapsedWindowPercent(maximum, maximum, maximum), 100);

    for (const [durationMs, resetAtMs, nowMs] of [
        [undefined, 1, 1], [null, 1, 1], [0, 1, 1], [-1, 1, 1],
        [1.5, 1, 1], [Number.MAX_SAFE_INTEGER + 1, 1, 1],
        [1, -1, 1], [1, 1.5, 1], [1, Infinity, 1],
        [1, 1, -1], [1, 1, NaN], [1, 1, Number.MAX_SAFE_INTEGER + 1],
    ]) {
        assert.throws(() => elapsedWindowPercent(durationMs, resetAtMs, nowMs));
    }
});
