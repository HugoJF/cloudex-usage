import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CatalogState,
    colorToRgba,
    progressWidth,
} from '../../design/direction-lab/catalog-state.js';

test('catalog state starts in the selected Direction D review state', () => {
    const state = new CatalogState();
    assert.deepEqual(state.snapshot(), {
        view: 'usage',
        activeRange: '6h',
        refreshInterval: '5 min',
        showClaudeShort: true,
        showClaudeWeekly: true,
        showCodexWeekly: true,
        presentOnly: true,
        localHistory: true,
    });
});

test('catalog state changes ranges and settings without persistence', () => {
    const state = new CatalogState();
    state.selectRange('7d');
    state.toggle('showClaudeShort');
    state.setView('settings');
    assert.equal(state.snapshot().activeRange, '7d');
    assert.equal(state.snapshot().showClaudeShort, false);
    assert.equal(state.snapshot().view, 'settings');
    assert.throws(() => state.selectRange('forever'), /Unknown history range/);
    assert.throws(() => state.toggle('networkAccess'), /Unknown catalog toggle/);
    assert.throws(() => state.setView('provider-auth'), /Unknown catalog view/);
});

test('refresh choice cycles deterministically in process-local state', () => {
    const state = new CatalogState();
    assert.equal(state.cycleRefreshInterval(), '10 min');
    assert.equal(state.cycleRefreshInterval(), '15 min');
    assert.equal(state.cycleRefreshInterval(), '5 min');
});

test('progress geometry is zero-origin and exact at both endpoints', () => {
    assert.equal(progressWidth(0, 316), 0);
    assert.equal(progressWidth(8, 316), 25);
    assert.equal(progressWidth(50, 316), 158);
    assert.equal(progressWidth(100, 316), 316);
    assert.equal(progressWidth(-10, 316), 0);
    assert.equal(progressWidth(120, 316), 316);
    assert.throws(() => progressWidth(Number.NaN, 316), /finite/);
    assert.throws(() => progressWidth(20, -1), /non-negative/);
});

test('chart colors convert from token CSS values to Cairo channels', () => {
    assert.deepEqual(colorToRgba('#ff8000'), [1, 128 / 255, 0, 1]);
    assert.deepEqual(colorToRgba('rgba(255, 255, 255, 0.10)'), [1, 1, 1, 0.1]);
    assert.throws(() => colorToRgba('rebeccapurple'), /Unsupported color/);
});
