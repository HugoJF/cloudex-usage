#!/usr/bin/env node

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesheets = ['extension/shared/stylesheet.template.css',
    'extension/stylesheet.css', 'design/direction-lab/stylesheet.css'];
const forbiddenNames = /\.(?:selected|direction)(?:-|\b)/;

function validateStylesheet(relativePath) {
    const source = readFileSync(path.join(root, relativePath), 'utf8');
    let depth = 0;
    for (const character of source) {
        if (character === '{')
            {depth += 1;}
        if (character === '}')
            {depth -= 1;}
        if (depth < 0)
            {throw new Error(`${relativePath} closes an unopened block`);}
    }
    if (depth !== 0)
        {throw new Error(`${relativePath} has unbalanced blocks`);}
    if (source.includes('!important'))
        {throw new Error(`${relativePath} contains !important`);}
    if (forbiddenNames.test(source))
        {throw new Error(`${relativePath} contains a generic legacy class`);}
}

for (const stylesheet of stylesheets)
    {validateStylesheet(stylesheet);}
process.stdout.write(`CSS structure: ${stylesheets.length} stylesheets verified\n`);
