import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {
    extractClaudeAccessToken,
    mapClaudeUsage,
} from '../../extension/claude-contract.js';

function fixture(name) {
    return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

function windows(overrides = {}) {
    return {
        five_hour: {utilization: 5, resets_at: '2026-07-17T22:30:00+00:00'},
        seven_day: {utilization: 17, resets_at: '2026-07-23T23:00:00+00:00'},
        ...overrides,
    };
}

const SHORT_MS = Date.UTC(2026, 6, 17, 22, 30, 0);
const WEEKLY_MS = Date.UTC(2026, 6, 23, 23, 0, 0);

function assertDeepFrozen(value) {
    if (value === null || typeof value !== 'object')
        return;
    assert(Object.isFrozen(value));
    for (const child of Object.values(value))
        assertDeepFrozen(child);
}

function assertUnavailable(value) {
    assert.deepEqual(value, {status: 'unavailable'});
    assertDeepFrozen(value);
}

test('access-token extraction accepts only the nested normalized opaque token', () => {
    assert.equal(
        extractClaudeAccessToken({claudeAiOauth: {accessToken: 'sk-abc123'}}),
        'sk-abc123');
    assert.equal(
        extractClaudeAccessToken({claudeAiOauth: {accessToken: '  Bearer sk-abc123  '}}),
        'sk-abc123');
    assert.equal(
        extractClaudeAccessToken({claudeAiOauth: {accessToken: 'bearer\tsk-xyz'}}),
        'sk-xyz');
});

test('access-token extraction rejects malformed shapes and ignores sibling credentials', () => {
    const malformed = [
        null,
        undefined,
        {},
        {claudeAiOauth: null},
        {claudeAiOauth: {}},
        {claudeAiOauth: {accessToken: ''}},
        {claudeAiOauth: {accessToken: '   '}},
        {claudeAiOauth: {accessToken: 'sk abc'}},
        {claudeAiOauth: {accessToken: 'Bearer sk abc'}},
        {claudeAiOauth: {accessToken: 42}},
        {claudeAiOauth: {accessToken: null}},
        {claudeAiOauth: ['sk-abc123']},
    ];
    for (const value of malformed)
        assert.equal(extractClaudeAccessToken(value), null);

    // Sibling credential fields must never be read.
    assert.equal(extractClaudeAccessToken({
        accessToken: 'sk-top-level',
        mcpOAuth: {'notion|1': {accessToken: 'sk-mcp'}},
    }), null);
    assert.equal(extractClaudeAccessToken({
        mcpOAuth: {'notion|1': {accessToken: 'sk-mcp'}},
        claudeAiOauth: {accessToken: 'sk-real'},
    }), 'sk-real');
});

test('access-token extraction fails closed when parsed-object accessors throw', () => {
    const authPayload = {};
    Object.defineProperty(authPayload, 'claudeAiOauth', {
        get() {
            throw new Error('must not escape');
        },
    });
    assert.doesNotThrow(() => extractClaudeAccessToken(authPayload));
    assert.equal(extractClaudeAccessToken(authPayload), null);

    const claudeAiOauth = {};
    Object.defineProperty(claudeAiOauth, 'accessToken', {
        get() {
            throw new Error('must not escape');
        },
    });
    assert.equal(extractClaudeAccessToken({claudeAiOauth}), null);
});

test('sanitized fixtures map both account windows to immutable readings', () => {
    const cases = [
        ['claude-usage-current.json', {
            status: 'available',
            readings: [
                {id: 'short', percent: 5, resetAtMs: 1784327400233},
                {id: 'weekly', percent: 17, resetAtMs: 1784847600233},
            ],
        }],
        ['claude-usage-secondary.json', {
            status: 'available',
            readings: [
                {id: 'short', percent: 62.5, resetAtMs: 1785575730000},
                {id: 'weekly', percent: 88, resetAtMs: 1785956400500},
            ],
        }],
    ];
    for (const [name, expected] of cases) {
        const source = fixture(name);
        const result = mapClaudeUsage(source);
        assert.deepEqual(result, expected);
        assertDeepFrozen(result);
        assert.deepEqual(mapClaudeUsage(JSON.parse(JSON.stringify(source))), expected);
    }
});

test('usage mapping ignores model-scoped limits and unrelated provider metadata', () => {
    const source = fixture('claude-usage-current.json');
    source.limits[2].percent = 99;
    source.spend.percent = 80;
    source.extra_usage.is_enabled = true;
    source.member_dashboard_available = true;
    source.account = {display_name: 'ignored'};
    const result = mapClaudeUsage(source);
    assert.equal(result.readings[0].percent, 5);
    assert.equal(result.readings[1].percent, 17);

    const throwingMetadata = windows();
    Object.defineProperty(throwingMetadata, 'limits', {
        get() {
            throw new Error('irrelevant metadata was read');
        },
    });
    assert.equal(mapClaudeUsage(throwingMetadata).status, 'available');
});

test('usage mapping requires both account windows to be structurally valid', () => {
    const invalid = [
        null,
        undefined,
        [],
        {},
        {five_hour: windows().five_hour},
        {seven_day: windows().seven_day},
        windows({five_hour: null}),
        windows({seven_day: null}),
        windows({five_hour: []}),
        windows({five_hour: {utilization: 5}}),
        windows({seven_day: {resets_at: '2026-07-23T23:00:00Z'}}),
    ];
    for (const value of invalid)
        assertUnavailable(mapClaudeUsage(value));
});

test('usage mapping enforces utilization boundaries', () => {
    for (const utilization of [0, 37.125, 100]) {
        const result = mapClaudeUsage(windows({
            five_hour: {utilization, resets_at: '2026-07-17T22:30:00+00:00'},
        }));
        assert.equal(result.readings[0].percent, utilization);
    }
    for (const utilization of [-1, 100.0001, NaN, Infinity, -Infinity, '17', null]) {
        assertUnavailable(mapClaudeUsage(windows({
            five_hour: {utilization, resets_at: '2026-07-17T22:30:00+00:00'},
        })));
    }
});

test('reset parsing is strict, offset-correct, and authoritative', () => {
    const accept = [
        ['2026-07-17T22:30:00+00:00', SHORT_MS],
        ['2026-07-17T22:30:00Z', SHORT_MS],
        ['2026-07-17T22:30:00.233637+00:00', SHORT_MS + 233],
        ['2026-07-17T20:30:00-02:00', SHORT_MS],
        ['2026-07-18T00:30:00+02:00', SHORT_MS],
        ['2026-07-17T22:30:00.5Z', SHORT_MS + 500],
    ];
    for (const [resets_at, expected] of accept) {
        const result = mapClaudeUsage(windows({
            five_hour: {utilization: 5, resets_at},
        }));
        assert.equal(result.readings[0].resetAtMs, expected, resets_at);
    }
    const reject = [
        '',
        '2026-07-17',
        '2026-07-17T22:30:00',
        '2026-07-17 22:30:00Z',
        '2026-13-17T22:30:00Z',
        '2026-02-30T22:30:00Z',
        '2026-07-17T24:00:00Z',
        '2026-07-17T22:60:00Z',
        '2026-07-17T22:30:00+0000',
        '2026-07-17T22:30:00.233637',
        1784327400233,
        null,
    ];
    for (const resets_at of reject) {
        assertUnavailable(mapClaudeUsage(windows({
            five_hour: {utilization: 5, resets_at},
        })));
    }
});

test('usage mapping is deterministic, source-independent, and order-stable', () => {
    const source = windows({five_hour: {utilization: 48, resets_at: '2026-07-17T22:30:00Z'}});
    const first = mapClaudeUsage(source);
    const second = mapClaudeUsage(source);
    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.readings, second.readings);
    assert.notStrictEqual(first.readings[0], second.readings[0]);

    source.five_hour.utilization = 99;
    source.five_hour.resets_at = '2000-01-01T00:00:00Z';
    assert.deepEqual(first.readings[0], {id: 'short', percent: 48, resetAtMs: SHORT_MS});
    assert.throws(() => {
        first.readings[0].percent = 1;
    }, TypeError);
    assert.deepEqual(first.readings.map(r => r.id), ['short', 'weekly']);

    const unavailableFirst = mapClaudeUsage(null);
    const unavailableSecond = mapClaudeUsage(null);
    assert.deepEqual(unavailableFirst, unavailableSecond);
    assert.notStrictEqual(unavailableFirst, unavailableSecond);
});

test('usage mapping fails closed when supported payload accessors throw', () => {
    const source = {};
    Object.defineProperty(source, 'five_hour', {
        get() {
            throw new Error('must not escape');
        },
    });
    assert.doesNotThrow(() => mapClaudeUsage(source));
    assertUnavailable(mapClaudeUsage(source));

    const withShort = {five_hour: {utilization: 5, resets_at: '2026-07-17T22:30:00Z'}};
    Object.defineProperty(withShort, 'seven_day', {
        get() {
            throw new Error('must not escape');
        },
    });
    assertUnavailable(mapClaudeUsage(withShort));
});

test('fixtures contain no credential or user-identity fields', () => {
    const forbidden = new Set([
        'accesstoken', 'refreshtoken', 'access_token', 'account_id', 'user_id', 'email',
    ]);
    function inspect(value) {
        if (value === null || typeof value !== 'object')
            return;
        if (!Array.isArray(value)) {
            for (const key of Object.keys(value))
                assert(!forbidden.has(key.toLowerCase()), `fixture contains ${key}`);
        }
        for (const child of Object.values(value))
            inspect(child);
    }
    inspect(fixture('claude-usage-current.json'));
    inspect(fixture('claude-usage-secondary.json'));
});
