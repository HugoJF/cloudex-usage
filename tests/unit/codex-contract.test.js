import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {
    extractCodexAccessToken,
    mapCodexUsage,
} from '../../extension/codex-contract.js';

const WEEK_SECONDS = 604800;
const MAX_SAFE_RESET_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

function fixture(name) {
    return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

function weekly(overrides = {}) {
    return {
        used_percent: 37.5,
        limit_window_seconds: WEEK_SECONDS,
        reset_at: 1783296000,
        ...overrides,
    };
}

function payload(window, slot = 'primary_window') {
    return {
        rate_limit: {
            primary_window: null,
            secondary_window: null,
            [slot]: window,
        },
    };
}

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
    assert.equal(extractCodexAccessToken({
        tokens: {access_token: '  opaque.token-123_+/=  ', refresh_token: 'ignored'},
        access_token: 'wrong-level',
        profile: {plan: 'ignored'},
    }), 'opaque.token-123_+/=');
    assert.equal(extractCodexAccessToken({
        tokens: {access_token: '\tbeArEr   second-token\n'},
    }), 'second-token');
    assert.equal(extractCodexAccessToken({
        tokens: {access_token: 'Bearerish-token'},
    }), 'Bearerish-token');
});

test('access-token extraction rejects malformed shapes, values, and embedded whitespace', () => {
    const invalid = [
        null,
        undefined,
        [],
        'token',
        1,
        {access_token: 'wrong-level'},
        {tokens: null},
        {tokens: []},
        {tokens: {}},
        {tokens: {access_token: ''}},
        {tokens: {access_token: ' \t\n '}},
        {tokens: {access_token: 'Bearer'}},
        {tokens: {access_token: 'Bearer Bearer token'}},
        {tokens: {access_token: 'two words'}},
        {tokens: {access_token: ['token']}},
        {tokens: {access_token: {value: 'token'}}},
        {tokens: {access_token: 42}},
    ];
    for (const value of invalid)
        assert.equal(extractCodexAccessToken(value), null);
});

test('access-token extraction fails closed when parsed-object accessors throw', () => {
    const authPayload = {};
    Object.defineProperty(authPayload, 'tokens', {
        get() {
            throw new Error('must not escape');
        },
    });
    assert.doesNotThrow(() => extractCodexAccessToken(authPayload));
    assert.equal(extractCodexAccessToken(authPayload), null);

    const tokens = {};
    Object.defineProperty(tokens, 'access_token', {
        get() {
            throw new Error('must not escape');
        },
    });
    assert.equal(extractCodexAccessToken({tokens}), null);
});

test('sanitized fixtures map either account-level weekly slot to immutable readings', () => {
    const cases = [
        ['codex-usage-current.json', {
            status: 'available',
            readings: [{id: 'weekly', percent: 37, resetAtMs: 1783296000000}],
        }],
        ['codex-usage-secondary.json', {
            status: 'available',
            readings: [{id: 'weekly', percent: 62.5, resetAtMs: 1783900800000}],
        }],
    ];
    for (const [name, expected] of cases) {
        const source = fixture(name);
        const result = mapCodexUsage(source);
        assert.deepEqual(result, expected);
        assertDeepFrozen(result);
        assert.deepEqual(mapCodexUsage(JSON.parse(JSON.stringify(source))), expected);
    }
});

test('usage mapping ignores model limits and unrelated provider metadata', () => {
    const source = fixture('codex-usage-current.json');
    source.allowed = false;
    source.rate_limit.allowed = false;
    source.rate_limit.limit_reached = true;
    source.rate_limit.primary_window.reset_after_seconds = 1;
    source.account = {display_name: 'ignored'};
    source.plan_type = 'unknown';
    source.credits = {has_credits: true, balance: 500};
    source.promo = {active: true};
    assert.equal(mapCodexUsage(source).readings[0].percent, 37);

    const modelOnly = {
        rate_limit: {
            primary_window: {
                used_percent: 5,
                limit_window_seconds: 18000,
                reset_at: 1,
            },
            secondary_window: null,
        },
        additional_rate_limits: [{
            rate_limit: {primary_window: weekly({used_percent: 99})},
        }],
    };
    assertUnavailable(mapCodexUsage(modelOnly));

    const throwingMetadata = payload(weekly());
    Object.defineProperty(throwingMetadata, 'additional_rate_limits', {
        get() {
            throw new Error('irrelevant metadata was read');
        },
    });
    assert.equal(mapCodexUsage(throwingMetadata).status, 'available');
});

test('usage mapping requires exactly one structurally valid seven-day candidate', () => {
    const invalid = [
        null,
        undefined,
        [],
        {},
        {rate_limit: null},
        {rate_limit: []},
        {rate_limit: {primary_window: null, secondary_window: null}},
        payload({}),
        payload(weekly({limit_window_seconds: 604799})),
        payload(weekly({limit_window_seconds: '604800'})),
        {
            rate_limit: {
                primary_window: weekly(),
                secondary_window: weekly({used_percent: 80}),
            },
        },
        payload([weekly()]),
    ];
    for (const value of invalid)
        assertUnavailable(mapCodexUsage(value));
});

test('usage mapping enforces percentage and authoritative reset boundaries', () => {
    for (const percent of [0, 37.125, 100]) {
        const result = mapCodexUsage(payload(weekly({used_percent: percent})));
        assert.equal(result.readings[0].percent, percent);
    }
    for (const percent of [-1, 100.0001, NaN, Infinity, -Infinity, '37', null])
        assertUnavailable(mapCodexUsage(payload(weekly({used_percent: percent}))));

    for (const reset_at of [0, 1783296000, MAX_SAFE_RESET_SECONDS]) {
        const result = mapCodexUsage(payload(weekly({reset_at})));
        assert.equal(result.readings[0].resetAtMs / 1000, reset_at);
    }
    for (const reset_at of [
        -1,
        1.5,
        MAX_SAFE_RESET_SECONDS + 1,
        NaN,
        Infinity,
        '1783296000',
        null,
    ]) {
        assertUnavailable(mapCodexUsage(payload(weekly({reset_at}))));
    }

    assertUnavailable(mapCodexUsage(payload({
        used_percent: 10,
        limit_window_seconds: WEEK_SECONDS,
        reset_after_seconds: 60,
    })));
});

test('usage mapping is deterministic, source-independent, and slot-invariant', () => {
    const primary = payload(weekly({used_percent: 48, reset_at: 123}));
    const secondary = payload(
        weekly({used_percent: 48, reset_at: 123}),
        'secondary_window');
    assert.deepEqual(mapCodexUsage(primary), mapCodexUsage(secondary));

    const first = mapCodexUsage(primary);
    const second = mapCodexUsage(primary);
    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.readings, second.readings);
    assert.notStrictEqual(first.readings[0], second.readings[0]);

    primary.rate_limit.primary_window.used_percent = 99;
    primary.rate_limit.primary_window.reset_at = 999;
    assert.deepEqual(first, {
        status: 'available',
        readings: [{id: 'weekly', percent: 48, resetAtMs: 123000}],
    });
    assert.throws(() => {
        first.readings[0].percent = 1;
    }, TypeError);

    const unavailableFirst = mapCodexUsage(null);
    const unavailableSecond = mapCodexUsage(null);
    assert.deepEqual(unavailableFirst, unavailableSecond);
    assert.notStrictEqual(unavailableFirst, unavailableSecond);
});

test('usage mapping fails closed when supported payload accessors throw', () => {
    const source = {};
    Object.defineProperty(source, 'rate_limit', {
        get() {
            throw new Error('must not escape');
        },
    });
    assert.doesNotThrow(() => mapCodexUsage(source));
    assertUnavailable(mapCodexUsage(source));

    const rate_limit = {secondary_window: null};
    Object.defineProperty(rate_limit, 'primary_window', {
        get() {
            throw new Error('must not escape');
        },
    });
    assertUnavailable(mapCodexUsage({rate_limit}));
});

test('fixtures contain no credential or user-identity fields', () => {
    const forbidden = new Set(['access_token', 'account_id', 'user_id', 'email']);
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
    inspect(fixture('codex-usage-current.json'));
    inspect(fixture('codex-usage-secondary.json'));
});
