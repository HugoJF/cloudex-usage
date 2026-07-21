import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {ESLint} from 'eslint';

const eslint = new ESLint({overrideConfigFile: 'eslint.config.js'});

const validResults = await eslint.lintFiles(['tests/lint/valid.js']);
assert.equal(validResults[0].errorCount, 0, 'valid lint fixture must pass');

const invalidSource = await readFile('tests/lint/invalid.js', 'utf8');
const [invalidResult] = await eslint.lintText(invalidSource, {
    filePath: 'tests/lint/valid.js',
});
const rejectedRules = new Set(invalidResult.messages.map(message => message.ruleId));
for (const rule of ['curly', 'max-params', 'no-else-return', 'no-magic-numbers']) {
    assert.ok(rejectedRules.has(rule), `invalid fixture must trigger ${rule}`);
}

for (const filePath of ['scripts/check.mjs', 'extension/extension.js',
    'tests/journeys/J-001-primitive-catalog.journey.test.js']) {
    const configuration = await eslint.calculateConfigForFile(filePath);
    assert.equal(configuration.linterOptions.noInlineConfig, true,
        `${filePath} must reject inline configuration`);
    for (const rule of ['complexity', 'max-depth', 'max-lines',
        'max-lines-per-function', 'max-params', 'no-unused-vars']) {
        assert.equal(configuration.rules[rule][0], 2,
            `${filePath} must enforce ${rule}`);
    }
}
const production = await eslint.calculateConfigForFile('extension/extension.js');
assert.equal(production.rules['no-magic-numbers'][0], 2,
    'production must enforce named constants');

console.log('ESLint configuration fixtures: both verdicts passed');
