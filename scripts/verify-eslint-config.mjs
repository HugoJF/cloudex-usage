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

console.log('ESLint configuration fixtures: both verdicts passed');
