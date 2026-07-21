import assert from 'node:assert/strict';
import test from 'node:test';

import {deferred, harness, provider, settle} from './surface-controller-fixtures.js';

test('failed subscription cleanup runs once without replacing the primary error', async () => {
    const state = harness();
    let cleanupCalls = 0;
    let escaped = null;
    const item = provider({
        subscribeEligibility: callback => {
            escaped = callback;
            callback(true);
            state.controller.dispose();
            return () => {
                cleanupCalls += 1;
                throw new Error('cleanup detail');
            };
        },
    });
    assert.throws(() => state.controller.registerProvider(item), /disposed/);
    escaped(true);
    await settle();
    assert.equal(cleanupCalls, 1);
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);
});

test('strict eligibility, ordering, and observer teardown fail closed', async () => {
    const {controller, timers} = harness();
    const zulu = provider({id: 'zulu', order: 1});
    const alpha = provider({id: 'alpha', order: 1});
    const removeZulu = controller.registerProvider(zulu);
    const removeAlpha = controller.registerProvider(alpha);
    assert.deepEqual(controller.getSnapshot().providers.map(item => item.id),
        ['alpha', 'zulu']);
    zulu.emit('yes');
    assert.deepEqual(controller.getSnapshot().providers.map(item => item.id), ['alpha']);
    removeZulu();
    removeZulu();
    assert.equal(zulu.unsubscribeCount, 1);
    removeAlpha();
    await settle();
    assert.equal(timers.size, 0);
});

test('first eligible provider refreshes immediately and one timer follows completion', async () => {
    const state = harness();
    let calls = 0;
    const item = provider({refresh: async () => {
        calls += 1;
        return {status: 'available', readings: [
            {id: 'short', percent: 25, resetAtMs: 1_120_000},
        ]};
    }});
    state.controller.registerProvider(item);
    assert.equal(calls, 0, 'refresh starts asynchronously');
    await settle();
    assert.equal(calls, 1);
    assert.equal(state.timers.size, 1);
    assert.equal(state.runTimer(), 300000);
    await settle();
    assert.equal(calls, 2);
    assert.equal(state.timers.size, 1);
});

test('a provider becoming eligible replaces the cadence timer with one shared refresh', async () => {
    const state = harness();
    let claudeCalls = 0;
    let codexCalls = 0;
    const claude = provider({refresh: async () => ({
        status: 'available',
        readings: [{id: 'short', percent: ++claudeCalls, resetAtMs: 1_120_000}],
    })});
    const codex = provider({
        id: 'codex',
        order: 1,
        windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'weekly', percent: ++codexCalls, resetAtMs: 1_180_000}],
        }),
    });
    codex.setEligible(false);
    state.controller.registerProvider(claude);
    state.controller.registerProvider(codex);
    await settle();
    assert.equal(claudeCalls, 1);
    assert.equal(codexCalls, 0);
    assert.equal(state.timers.size, 1);

    codex.setEligible(true);
    assert.equal(state.timers.size, 0, 'eligibility cancels the cadence timer');
    await settle();
    assert.equal(claudeCalls, 2, 'the existing provider joins the shared cycle');
    assert.equal(codexCalls, 1, 'the newly eligible provider refreshes immediately');
    assert.equal(state.timers.size, 1);

    codex.emit(true);
    await settle();
    assert.deepEqual([claudeCalls, codexCalls], [2, 1],
        'a repeated eligibility value is a no-op');
    assert.equal(state.timers.size, 1);
});

test('eligibility during an in-flight cycle queues one non-overlapping follow-up', async () => {
    const state = harness();
    const first = deferred();
    let claudeCalls = 0;
    let codexCalls = 0;
    const claude = provider({refresh: () => {
        claudeCalls += 1;
        return claudeCalls === 1 ? first.promise : Promise.resolve({
            status: 'available',
            readings: [{id: 'short', percent: 31, resetAtMs: 1_120_000}],
        });
    }});
    const codex = provider({
        id: 'codex',
        order: 1,
        windows: [{id: 'weekly', label: 'Weekly window', dataRole: 'dataCodexWeekly'}],
        refresh: async () => {
            codexCalls += 1;
            return {status: 'available', readings: [
                {id: 'weekly', percent: 41, resetAtMs: 1_180_000},
            ]};
        },
    });
    codex.setEligible(false);
    state.controller.registerProvider(claude);
    state.controller.registerProvider(codex);
    await settle();
    assert.equal(claudeCalls, 1);

    codex.setEligible(true);
    codex.emit(true);
    await settle();
    assert.deepEqual([claudeCalls, codexCalls], [1, 0],
        'the in-flight cycle is not overlapped');
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 21, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.deepEqual([claudeCalls, codexCalls], [2, 1],
        'all eligibility demand coalesces into one follow-up');
    const refreshingEdges = state.snapshots.map(snapshot => snapshot.refreshing)
        .filter((value, index, values) => index === 0 || value !== values[index - 1]);
    assert(refreshingEdges.some((value, index) => value === true &&
        refreshingEdges[index + 1] === false && refreshingEdges[index + 2] === true),
    'completion is observable before the queued follow-up starts');
    assert.equal(state.timers.size, 1);
});

test('queued demand clears across a zero-provider gap', async () => {
    const state = harness();
    const first = deferred();
    let calls = 0;
    const item = provider({refresh: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve({
            status: 'available',
            readings: [{id: 'short', percent: 25, resetAtMs: 1_120_000}],
        });
    }});
    const companion = provider({id: 'companion', order: 1});
    companion.setEligible(false);
    state.controller.registerProvider(item);
    state.controller.registerProvider(companion);
    await settle();
    companion.setEligible(true);
    item.setEligible(false);
    companion.setEligible(false);
    first.resolve({status: 'available', readings: [
        {id: 'short', percent: 20, resetAtMs: 1_120_000},
    ]});
    await settle();
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);

    item.setEligible(true);
    await settle();
    await settle();
    assert.equal(calls, 2, 'reeligibility starts exactly one new cycle');
    assert.equal(state.timers.size, 1);
});

test('eligibility churn and teardown before the adapter microtask prevent access', async () => {
    for (const transition of ['false', 'invalid', 'unregister', 'dispose']) {
        const state = harness();
        let calls = 0;
        const item = provider({refresh: async () => {
            calls += 1;
            return {status: 'available', readings: [
                {id: 'short', percent: 25, resetAtMs: 1_120_000},
            ]};
        }});
        const unregister = state.controller.registerProvider(item);
        if (transition === 'false')
            {item.setEligible(false);}
        else if (transition === 'invalid')
            {item.emit('invalid');}
        else if (transition === 'unregister')
            {unregister();}
        else
            {state.controller.dispose();}
        await settle();
        assert.equal(calls, 0, `${transition} blocks deferred provider access`);
        assert.equal(state.timers.size, 0);
    }
});


test('reentrant disposal stops provisional registration at the current external access', () => {
    const metadata = harness();
    const metadataProvider = provider();
    let detailReads = 0;
    let subscriptionReads = 0;
    Object.defineProperty(metadataProvider, 'label', {
        get() {
            metadata.controller.dispose();
            return 'Claude';
        },
    });
    Object.defineProperty(metadataProvider, 'detail', {
        get() {
            detailReads += 1;
            return 'Must not be read';
        },
    });
    Object.defineProperty(metadataProvider, 'subscribeEligibility', {
        get() {
            subscriptionReads += 1;
            return () => () => {};
        },
    });
    assert.throws(() => metadata.controller.registerProvider(metadataProvider),
        /disposed/);
    assert.equal(detailReads, 0);
    assert.equal(subscriptionReads, 0);

    const duration = harness();
    const durationProvider = provider();
    let eligibilityReads = 0;
    Object.defineProperty(durationProvider.windows[0], 'durationMs', {
        get() {
            duration.controller.dispose();
            return 18_000_000;
        },
    });
    Object.defineProperty(durationProvider, 'isEligible', {
        get() {
            eligibilityReads += 1;
            return () => true;
        },
    });
    assert.throws(() => duration.controller.registerProvider(durationProvider),
        /disposed/);
    assert.equal(eligibilityReads, 0,
        'duration getter disposal stops before lifecycle callback reads');

    const eligibility = harness();
    const eligibilityProvider = provider();
    let subscribeReads = 0;
    eligibilityProvider.isEligible = () => {
        eligibility.controller.dispose();
        return true;
    };
    Object.defineProperty(eligibilityProvider, 'subscribeEligibility', {
        get() {
            subscribeReads += 1;
            return () => () => {};
        },
    });
    assert.throws(() => eligibility.controller.registerProvider(eligibilityProvider),
        /disposed/);
    assert.equal(subscribeReads, 0);
});

