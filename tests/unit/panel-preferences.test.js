import assert from 'node:assert/strict';
import test from 'node:test';

import {
    historyRange,
    historyRangeIndex,
    isPreferenceKey,
    nextRefreshInterval,
    PANEL_LIMITS,
    readPanelPreferences,
    REFRESH_INTERVALS,
    refreshInterval,
} from '../../extension/panel-preferences.js';

function settings({booleans = {}, interval = 0, range = 0} = {}) {
    return {
        get_boolean: key => booleans[key] ?? true,
        get_enum: key => {
            if (key === 'history-range')
                return range;
            assert.equal(key, 'refresh-interval');
            return interval;
        },
    };
}

test('panel preferences map each semantic role to its durable boolean', () => {
    const snapshot = readPanelPreferences(settings({booleans: {
        'show-claude-short': false,
        'show-claude-weekly': true,
        'show-codex-weekly': false,
    }, interval: 1}));
    assert.deepEqual(snapshot.visibility, {
        dataClaudeShort: false,
        dataClaudeWeekly: true,
        dataCodexWeekly: false,
    });
    assert.equal(snapshot.refreshInterval.label, '10 min');
    assert.equal(snapshot.refreshInterval.ms, 600000);
    assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.visibility));
    assert.deepEqual(PANEL_LIMITS.map(limit => limit.key), [
        'show-claude-short', 'show-claude-weekly', 'show-codex-weekly',
    ]);
});

test('history preferences expose the local-history flag and selected range', () => {
    const snapshot = readPanelPreferences(settings({
        booleans: {'show-usage-history': false}, range: 3,
    }));
    assert.equal(snapshot.localHistory, false);
    assert.deepEqual(snapshot.historyRange, {index: 3, id: '7d', label: '7d'});
    assert.equal(historyRange(0).id, '1h');
    assert.equal(historyRangeIndex('30d'), 4);
    assert.throws(() => historyRange(5));
    assert.throws(() => historyRangeIndex('2h'));
    assert(isPreferenceKey('show-usage-history') && isPreferenceKey('history-range'));
});

test('refresh intervals cycle, reject unknown enums, and expose only known keys', () => {
    assert.deepEqual(REFRESH_INTERVALS.map(interval => interval.ms),
        [300000, 600000, 900000]);
    assert.equal(nextRefreshInterval(0).index, 1);
    assert.equal(nextRefreshInterval(1).index, 2);
    assert.equal(nextRefreshInterval(2).index, 0);
    assert.throws(() => refreshInterval(-1));
    assert.throws(() => refreshInterval(3));
    assert.throws(() => readPanelPreferences(settings({interval: 4})));
    assert(isPreferenceKey('show-claude-short'));
    assert(isPreferenceKey('refresh-interval'));
    assert(!isPreferenceKey('local-history'));
});
