import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
    validateTokens,
} from '../../extension/shared/token-geometry.js';
import {renderStyles} from '../../scripts/render-catalog-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function loadFixture() {
    return JSON.parse(await readFile(path.join(root, 'design/system/tokens.json'), 'utf8'));
}

test('the canonical token manifest is accepted', async () => {
    const tokens = await loadFixture();
    assert.equal(validateTokens(tokens), tokens);
    const before = JSON.stringify(tokens);
    assert.equal(validateTokens(tokens), tokens);
    assert.equal(JSON.stringify(tokens), before);
});

test('token validation fails closed for missing, malformed, and invalid geometry', async () => {
    const missing = await loadFixture();
    delete missing.color.surfaceRoot;
    assert.throws(() => validateTokens(missing), /Missing design token/);

    const malformed = await loadFixture();
    malformed.color.focus = 'blue-ish';
    assert.throws(() => validateTokens(malformed), /not a supported CSS color/);

    const outOfRange = await loadFixture();
    outOfRange.color.grid = 'rgba(256, 0, 0, 1)';
    assert.throws(() => validateTokens(outOfRange), /not a supported CSS color/);

    const invalidGeometry = await loadFixture();
    invalidGeometry.size.switchTrackWidth = 14;
    assert.throws(() => validateTokens(invalidGeometry), /no room for thumb travel/);
});

test('stylesheet rendering accepts valid tokens and rejects unresolved roles', async () => {
    const tokens = await loadFixture();
    assert.equal(renderStyles('.sample { color: {{color.focus}}; }\n', tokens),
        '/* Generated from stylesheet.template.css and design/system/tokens.json. */\n' +
        '.sample { color: #b7baaf; }\n');
    assert.throws(() => renderStyles('.sample { color: {{color.missing}}; }', tokens),
        /Missing design token/);
});
