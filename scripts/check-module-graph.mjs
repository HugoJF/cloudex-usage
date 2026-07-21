#!/usr/bin/env node

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOTS = ['extension', 'design/direction-lab', 'scripts', 'tests'];
const SKIPPED_PATHS = new Set([
    'scripts/check-module-graph.mjs',
    'scripts/doc-lint.mjs',
    'tests/lint/invalid.js',
    'tests/lint/valid.js',
]);
const JOURNEY_EXPORTS = new Set(['METRICS', 'init', 'run']);

function sourceFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const absolute = path.join(directory, entry);
        if (statSync(absolute).isDirectory())
            {files.push(...sourceFiles(absolute));}
        else if (/\.(?:m?js)$/.test(entry))
            {files.push(absolute);}
    }
    return files;
}

function relativePath(absolute) {
    return path.relative(ROOT, absolute).split(path.sep).join('/');
}

function exportedNames(source) {
    const names = new Set();
    const declaration = /export\s+(?:async\s+)?(?:const|class|function)\s+([\w$]+)/g;
    for (const match of source.matchAll(declaration))
        {names.add(match[1]);}
    if (/export\s+default\b/.test(source))
        {names.add('default');}
    return names;
}

function resolveImport(importer, specifier) {
    if (!specifier.startsWith('.'))
        {return null;}
    const resolved = path.resolve(path.dirname(importer), specifier);
    return relativePath(path.extname(resolved) ? resolved : `${resolved}.js`);
}

function importedNames(source, importer) {
    const imports = [];
    const statement = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g;
    for (const match of source.matchAll(statement)) {
        const target = resolveImport(importer, match[2]);
        if (!target)
            {continue;}
        const clause = match[1].trim();
        const names = new Set();
        if (clause.startsWith('*'))
            {names.add('*');}
        const named = clause.match(/\{([\s\S]*?)\}/)?.[1];
        if (named) {
            for (const item of named.split(','))
                {names.add(item.trim().split(/\s+as\s+/)[0]);}
        }
        const defaultName = clause.split(',')[0].trim();
        if (defaultName && !defaultName.startsWith('{') &&
            !defaultName.startsWith('*'))
            {names.add('default');}
        imports.push({target, names});
    }
    return imports;
}

function isAllowedEntrypoint(file, name) {
    if (name === 'default' && /(?:^|\/)extension\.js$/.test(file))
        {return true;}
    return /(?:journey|journeys\/.*journey\.test)\.js$/.test(file) &&
        JOURNEY_EXPORTS.has(name);
}

const files = SOURCE_ROOTS.flatMap(root => sourceFiles(path.join(ROOT, root)))
    .filter(file => !SKIPPED_PATHS.has(relativePath(file)));
const imports = new Map();
for (const file of files) {
    for (const item of importedNames(readFileSync(file, 'utf8'), file)) {
        const consumed = imports.get(item.target) ?? new Set();
        item.names.forEach(name => consumed.add(name));
        imports.set(item.target, consumed);
    }
}

const unconsumed = [];
let exportCount = 0;
for (const file of files) {
    const relative = relativePath(file);
    for (const name of exportedNames(readFileSync(file, 'utf8'))) {
        exportCount++;
        const consumers = imports.get(relative) ?? new Set();
        if (!consumers.has('*') && !consumers.has(name) &&
            !isAllowedEntrypoint(relative, name))
            {unconsumed.push(`${relative}: ${name}`);}
    }
}

if (unconsumed.length > 0)
    {throw new Error(`Unconsumed exports:\n${unconsumed.join('\n')}`);}
process.stdout.write(`module graph: ${exportCount} exports accounted for\n`);
