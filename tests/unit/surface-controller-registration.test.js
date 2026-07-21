import assert from 'node:assert/strict';
import test from 'node:test';

import {harness, provider, settle} from './surface-controller-fixtures.js';

test('provider registration validates immutable presentation metadata and paths', () => {
    const invalid = [
        provider({id: 'unsafe id'}),
        provider({order: -1}),
        provider({label: ''}),
        provider({marks: {...provider().marks, popup: '../icon.svg'}}),
        provider({windows: []}),
        provider({windows: [{id: 'short', label: 'Short', dataRole: 'not-a-role'}]}),
        ...[null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(durationMs =>
            provider({windows: [{
                id: 'short',
                label: 'Short',
                dataRole: 'dataClaudeShort',
                durationMs,
            }]})),
        provider({isEligible: () => 1}),
        provider({subscribeEligibility: () => null}),
    ];
    for (const item of invalid) {
        const {controller} = harness();
        assert.throws(() => controller.registerProvider(item));
    }

    const {controller} = harness();
    const item = provider();
    const unregister = controller.registerProvider(item);
    item.label = 'Mutated';
    item.marks.popup = 'icons/other.svg';
    item.windows[0].label = 'Mutated window';
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.providers[0].label, 'Claude');
    assert.equal(snapshot.providers[0].marks.popup, 'icons/claude.svg');
    assert.equal(snapshot.providers[0].windows[0].label, '5-hour window');
    assert.throws(() => controller.registerProvider(provider()), /already registered/);
    unregister();
});

test('optional duration snapshots immutably and derives elapsed window time', async () => {
    const state = harness();
    const paced = provider({
        windows: [{
            id: 'short',
            label: '4-minute window',
            dataRole: 'dataClaudeShort',
            durationMs: 240_000,
        }],
    });
    state.controller.registerProvider(paced);
    paced.windows[0].durationMs = 1;
    await settle();
    const snapshot = state.controller.getSnapshot();
    assert.equal(snapshot.providers[0].windows[0].durationMs, 240_000);
    assert.equal(snapshot.providers[0].metrics[0].elapsedPercent, 50);
    assert(Object.isFrozen(snapshot.providers[0].windows[0]));

    const unpacedState = harness();
    unpacedState.controller.registerProvider(provider());
    await settle();
    const unpaced = unpacedState.controller.getSnapshot().providers[0];
    assert(!Object.hasOwn(unpaced.windows[0], 'durationMs'));
    assert(!Object.hasOwn(unpaced.metrics[0], 'elapsedPercent'));
    assert(!Object.hasOwn(unpaced.metrics[0], 'weekdayElapsedPercent'));
});

test('weekly pace compresses the provider window onto local weekdays', async () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const fridayAtTwenty = new Date(2026, 6, 17, 20).getTime();
    const mondayAtFour = new Date(2026, 6, 20, 4).getTime();
    const state = harness(fridayAtTwenty);
    state.controller.registerProvider(provider({
        windows: [{
            id: 'weekly',
            label: 'Weekly window',
            dataRole: 'dataClaudeWeekly',
            durationMs: week,
        }],
        refresh: async () => ({
            status: 'available',
            readings: [{id: 'weekly', percent: 25, resetAtMs: mondayAtFour}],
        }),
    }));
    await settle();

    let metric = state.controller.getSnapshot().providers[0].metrics[0];
    assert(Math.abs(metric.elapsedPercent - 2 / 3 * 100) < 1e-10);
    assert(Math.abs(metric.weekdayElapsedPercent - 112 / 120 * 100) < 1e-10,
        'Friday 20:00 leaves eight weekday pacing hours before Monday 04:00');

    state.advance(16 * 60 * 60 * 1000);
    metric = state.controller.getSnapshot().providers[0].metrics[0];
    const saturdayPace = metric.weekdayElapsedPercent;
    assert(Math.abs(saturdayPace - 116 / 120 * 100) < 1e-10,
        'Saturday starts with four weekday pacing hours remaining');
    state.advance(24 * 60 * 60 * 1000);
    metric = state.controller.getSnapshot().providers[0].metrics[0];
    assert.equal(metric.weekdayElapsedPercent, saturdayPace,
        'weekend clock time contributes no pacing time');
    state.advance(16 * 60 * 60 * 1000);
    assert.equal(state.controller.getSnapshot().providers[0].metrics[0]
        .weekdayElapsedPercent, 100);
});

test('unrepresentable weekly calendars remain distinct from non-weekly windows',
    async () => {
        const week = 7 * 24 * 60 * 60 * 1000;
        const state = harness();
        state.controller.registerProvider(provider({
            windows: [{
                id: 'weekly',
                label: 'Weekly window',
                dataRole: 'dataClaudeWeekly',
                durationMs: week,
            }],
            refresh: async () => ({
                status: 'available',
                readings: [{
                    id: 'weekly',
                    percent: 25,
                    resetAtMs: Number.MAX_SAFE_INTEGER,
                }],
            }),
        }));
        await settle();
        const metric = state.controller.getSnapshot().providers[0].metrics[0];
        assert.equal(metric.elapsedPercent, 0);
        assert(Object.hasOwn(metric, 'weekdayElapsedPercent'));
        assert.equal(metric.weekdayElapsedPercent, null);
    });

test('failed provisional registration is inert and releases its provider ID', async () => {
    const state = harness();
    let escaped = null;
    let calls = 0;
    const invalid = provider({
        id: 'rollback',
        isEligible: () => false,
        subscribeEligibility: callback => {
            escaped = callback;
            callback(true);
            return null;
        },
        refresh: async () => {
            calls += 1;
            return {status: 'unavailable'};
        },
    });
    assert.throws(() => state.controller.registerProvider(invalid),
        /unsubscribe callback/);
    escaped(true);
    await settle();
    assert.equal(calls, 0);
    assert.equal(state.controller.getSnapshot().visible, false);
    assert.equal(state.timers.size, 0);

    const replacement = provider({id: 'rollback'});
    state.controller.registerProvider(replacement);
    await settle();
    assert.equal(state.controller.getSnapshot().providers[0].id, 'rollback',
        'a failed transaction releases the provider ID');

    const thrownState = harness();
    let thrownEscaped = null;
    const thrown = provider({
        id: 'thrown',
        isEligible: () => false,
        subscribeEligibility: callback => {
            thrownEscaped = callback;
            callback(true);
            throw new Error('subscription detail');
        },
    });
    assert.throws(() => thrownState.controller.registerProvider(thrown),
        /subscription detail/);
    thrownEscaped(true);
    await settle();
    assert.equal(thrownState.controller.getSnapshot().visible, false);
    assert.equal(thrownState.timers.size, 0);
    thrownState.controller.registerProvider(provider({id: 'thrown'}));
    await settle();
    assert.equal(thrownState.controller.getSnapshot().providers[0].id, 'thrown');
});

test('registration survives caught reentrancy and rolls back uncaught reentrancy', async () => {
    const caught = harness();
    let nestedError = null;
    const caughtOuter = provider({
        id: 'reserved',
        isEligible: () => {
            try {
                caught.controller.registerProvider(provider({id: 'reserved'}));
            } catch (error) {
                nestedError = error;
            }
            return true;
        },
    });
    caught.controller.registerProvider(caughtOuter);
    await settle();
    assert.match(nestedError.message, /already registered/);
    assert.deepEqual(caught.controller.getSnapshot().providers.map(item => item.id),
        ['reserved']);

    const uncaught = harness();
    const uncaughtOuter = provider({
        id: 'reserved',
        isEligible: () => uncaught.controller.registerProvider(
            provider({id: 'reserved'})),
    });
    assert.throws(() => uncaught.controller.registerProvider(uncaughtOuter),
        /already registered/);
    uncaught.controller.registerProvider(provider({id: 'reserved'}));
    await settle();
    assert.deepEqual(uncaught.controller.getSnapshot().providers.map(item => item.id),
        ['reserved'], 'an uncaught recursive registration leaves no ghost state');
});

test('an ID getter cannot overwrite a provider committed reentrantly', async () => {
    const state = harness();
    let nestedCalls = 0;
    let outerSubscriptions = 0;
    const nested = provider({
        id: 'getter-id',
        refresh: async () => {
            nestedCalls += 1;
            return {status: 'available', readings: [
                {id: 'short', percent: 25, resetAtMs: 1_120_000},
            ]};
        },
    });
    const outer = provider({
        subscribeEligibility: () => {
            outerSubscriptions += 1;
            return () => {};
        },
    });
    let firstRead = true;
    Object.defineProperty(outer, 'id', {
        get() {
            if (firstRead) {
                firstRead = false;
                state.controller.registerProvider(nested);
            }
            return 'getter-id';
        },
    });
    assert.throws(() => state.controller.registerProvider(outer), /already registered/);
    await settle();
    assert.equal(nestedCalls, 1);
    assert.equal(outerSubscriptions, 0);
    assert.deepEqual(state.controller.getSnapshot().providers.map(item => item.id),
        ['getter-id']);
});

