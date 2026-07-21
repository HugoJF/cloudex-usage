import assert from 'node:assert/strict';
import test from 'node:test';

import {deferred, harness, provider, settle} from './surface-controller-fixtures.js';

test('cadence changes replace one pending timer without forcing an overlapping refresh', async () => {
    const state = harness();
    const first = deferred();
    let calls = 0;
    state.controller.registerProvider(provider({refresh: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve({status: 'available', readings: [
            {id: 'short', percent: 25, resetAtMs: 1_120_000},
        ]});
    }}));
    await settle();
    state.controller.setRefreshIntervalMs(600000);
    assert.equal(state.timers.size, 0, 'pending first cycle owns no timer');
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 25, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(state.runTimer(), 600000);
    await settle();
    state.controller.setRefreshIntervalMs(900000);
    assert.equal(state.runTimer(), 900000);
    await settle();
    assert.equal(calls, 3, 'rescheduling does not trigger a duplicate cycle');
    assert.throws(() => state.controller.setRefreshIntervalMs(0));
    assert.throws(() => state.controller.setRefreshIntervalMs(Number.MAX_SAFE_INTEGER + 1));
});

test('manual refresh coalesces, resets scheduling, and independent failures clear stale readings', async () => {
    const state = harness();
    const first = deferred();
    const second = deferred();
    let calls = 0;
    const claude = provider({refresh: () => {
        calls += 1;
        if (calls === 1)
            {return first.promise;}
        if (calls === 2)
            {return second.promise;}
        return Promise.resolve({status: 'available', readings: [
            {id: 'short', percent: 30, resetAtMs: 1_120_000},
        ]});
    }});
    const codex = provider({
        id: 'codex',
        order: 1,
        windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
        refresh: async () => ({status: 'available', readings: [
            {id: 'weekly', percent: 50, resetAtMs: 1_180_000},
        ]}),
    });
    state.controller.registerProvider(claude);
    state.controller.registerProvider(codex);
    await settle();
    assert.equal(calls, 1);
    state.controller.refresh();
    state.controller.refresh();
    assert.equal(calls, 1, 'manual refresh does not overlap a pending cycle');
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 25, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(calls, 2);
    assert.equal(state.timers.size, 0, 'newly eligible provider joins a follow-up cycle');
    second.reject(new Error('adapter detail must not escape'));
    await settle();
    const snapshot = state.controller.getSnapshot();
    const claudeModel = snapshot.providers.find(item => item.id === 'claude');
    const codexModel = snapshot.providers.find(item => item.id === 'codex');
    assert.equal(claudeModel.availability, 'unavailable');
    assert.equal(claudeModel.metrics.length, 0);
    assert.equal(codexModel.availability, 'available');
    assert.equal(codexModel.metrics[0].percent, 50);
    assert.equal(state.timers.size, 1);
    state.controller.refresh();
    await settle();
    assert.equal(calls, 3, 'manual refresh cancels the pending timer and starts one cycle');
    assert.equal(state.timers.size, 1, 'manual completion schedules one replacement timer');
});

test('refreshing keeps the last completion freshness while initial work stays unchecked',
    async () => {
        const state = harness();
        const first = deferred();
        const second = deferred();
        let calls = 0;
        state.controller.registerProvider(provider({refresh: () => {
            calls += 1;
            return calls === 1 ? first.promise : second.promise;
        }}));
        await settle();
        let snapshot = state.controller.getSnapshot();
        assert.equal(snapshot.refreshing, true);
        assert.equal(snapshot.footer, 'Not checked yet');

        first.resolve({status: 'available', readings: [
            {id: 'short', percent: 25, resetAtMs: 1_120_000},
        ]});
        await settle();
        assert.equal(state.controller.getSnapshot().footer, 'Updated just now');

        state.advance(61_000);
        state.controller.refresh();
        await settle();
        snapshot = state.controller.getSnapshot();
        assert.equal(snapshot.refreshing, true);
        assert.equal(snapshot.footer, 'Updated 1 min ago');

        second.resolve({status: 'unavailable'});
        await settle();
        snapshot = state.controller.getSnapshot();
        assert.equal(snapshot.refreshing, false);
        assert.equal(snapshot.footer, 'Checked just now');
    });

test('result validation requires exact readings and rejects unavailable readings', async () => {
    const invalidResults = [
        {status: 'available', readings: []},
        {status: 'available', readings: [{id: 'other', percent: 1, resetAtMs: 1}]},
        {status: 'available', readings: [{id: 'short', percent: 101, resetAtMs: 1}]},
        {status: 'available', readings: [{id: 'short', percent: 1, resetAtMs: -1}]},
        {status: 'unavailable', readings: []},
    ];
    for (const result of invalidResults) {
        const state = harness();
        state.controller.registerProvider(provider({refresh: async () => result}));
        await settle();
        const model = state.controller.getSnapshot().providers[0];
        assert.equal(model.availability, 'unavailable');
        assert.equal(model.metrics.length, 0);
    }
});

test('ineligibility, unregister, and disposal cancel timers and ignore late values', async () => {
    const state = harness();
    const pending = deferred();
    const item = provider({refresh: () => pending.promise});
    const unregister = state.controller.registerProvider(item);
    await settle();
    item.setEligible(false);
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);
    pending.resolve({status: 'available', readings: [
        {id: 'short', percent: 99, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(state.controller.getSnapshot().visible, false);
    unregister();
    state.controller.dispose();
    assert.equal(item.unsubscribeCount, 1);
});

