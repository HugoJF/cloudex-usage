import assert from 'node:assert/strict';

import {SurfaceController} from '../../extension/surface-controller.js';

export function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

export async function settle() {
    await new Promise(resolve => setImmediate(resolve));
}

export function harness(initialNow = 1_000_000) {
    let now = initialNow;
    let nextTimerId = 0;
    const timers = new Map();
    const snapshots = [];
    const controller = new SurfaceController({
        now: () => now,
        schedule: (callback, delay) => {
            const id = ++nextTimerId;
            timers.set(id, {callback, delay});
            return id;
        },
        cancel: id => timers.delete(id),
        onChange: snapshot => snapshots.push(snapshot),
    });
    return {
        controller,
        timers,
        snapshots,
        advance(milliseconds) {
            now += milliseconds;
        },
        setNow(value) {
            now = value;
        },
        runTimer() {
            assert.equal(timers.size, 1, 'exactly one timer is scheduled');
            const [id, timer] = timers.entries().next().value;
            timers.delete(id);
            timer.callback();
            return timer.delay;
        },
    };
}

export function provider(overrides = {}) {
    let listener;
    let eligible = true;
    let unsubscribeCount = 0;
    return {
        id: 'claude',
        order: 0,
        label: 'Claude',
        detail: 'Two usage windows',
        marks: {
            darkPanel: 'icons/claude.svg',
            lightPanel: 'icons/claude-light.svg',
            popup: 'icons/claude.svg',
            accessibleName: 'Claude mark',
        },
        windows: [{id: 'short', label: '5-hour window', dataRole: 'dataClaudeShort'}],
        isEligible: () => eligible,
        subscribeEligibility: callback => {
            listener = callback;
            return () => unsubscribeCount += 1;
        },
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'short', percent: 25, resetAtMs: 1_120_000}],
        }),
        setEligible(value) {
            eligible = value;
            listener?.(value);
        },
        emit(value) {
            listener(value);
        },
        get unsubscribeCount() {
            return unsubscribeCount;
        },
        ...overrides,
    };
}

