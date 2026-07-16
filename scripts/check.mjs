#!/usr/bin/env node

import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const updateCaptures = process.argv.includes('--update-captures');
const unknownArgs = process.argv.slice(2)
    .filter(argument => argument !== '--update-captures');
if (unknownArgs.length > 0)
    throw new Error(`Unknown arguments: ${unknownArgs.join(' ')}`);

const expectedCaptures = [
    'panel-dark-100.png',
    'usage-dark-100.png',
    'usage-range-7d-focus-hover.png',
    'settings-dark-100.png',
    'settings-toggle-off-focus-hover.png',
    'panel-visibility-off.png',
    'panel-light-100.png',
    'panel-dark-200.png',
];

function run(command, args, options = {}) {
    process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: 'inherit',
        ...options,
    });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error(`${command} exited with status ${result.status}`);
}

function assertPackage(zipPath) {
    const zip = readFileSync(zipPath);
    const entries = new Set();
    let offset = 0;
    while (offset <= zip.length - 46) {
        const header = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset);
        if (header < 0)
            break;
        const filenameLength = zip.readUInt16LE(header + 28);
        const extraLength = zip.readUInt16LE(header + 30);
        const commentLength = zip.readUInt16LE(header + 32);
        const filenameStart = header + 46;
        entries.add(zip.subarray(filenameStart,
            filenameStart + filenameLength).toString('utf8'));
        offset = filenameStart + filenameLength + extraLength + commentLength;
    }
    if (entries.size === 0)
        throw new Error(`Unable to inspect ${zipPath}`);
    for (const required of [
        'metadata.json',
        'extension.js',
        'primitives.js',
        'catalog-state.js',
        'stylesheet.css',
        'tokens.json',
        'icons/claude.svg',
        'icons/claude-light.svg',
        'icons/codex.svg',
        'icons/codex-light.svg',
    ]) {
        if (!entries.has(required))
            throw new Error(`Extension package is missing ${required}`);
    }
    process.stdout.write('catalog package: complete\n');
}

function assertCaptures(captureDir) {
    for (const filename of expectedCaptures) {
        const bytes = readFileSync(path.join(captureDir, filename));
        const pngSignature = bytes.subarray(0, 8).toString('hex');
        if (pngSignature !== '89504e470d0a1a0a' || bytes.length < 256)
            throw new Error(`${filename} is not a non-empty PNG capture`);
    }
    process.stdout.write(`catalog captures: ${expectedCaptures.length} verified\n`);
}

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'claudex-usage-check-'));
const packageDir = path.join(temporaryRoot, 'package');
const captureDir = updateCaptures
    ? path.join(root, 'design/captures')
    : path.join(temporaryRoot, 'captures');
mkdirSync(packageDir, {recursive: true});
mkdirSync(captureDir, {recursive: true});

try {
    run('node', ['scripts/doc-lint.mjs', 'docs/product', 'docs/engineering']);
    run('node', ['scripts/render-catalog-styles.mjs', '--check']);
    run('node', ['--test', 'tests/unit/catalog-state.test.js',
        'tests/unit/design-tokens.test.js']);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=icons',
        '--extra-source=catalog-state.js',
        '--extra-source=primitives.js',
        '--extra-source=../system/tokens.json',
        '--out-dir', packageDir,
        'design/direction-lab',
    ]);

    const zipPath = path.join(packageDir,
        'claudex-usage-design@hugo.local.shell-extension.zip');
    assertPackage(zipPath);
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', zipPath,
        'tests/journeys/J-001-primitive-catalog.journey.test.js',
    ], {
        env: {...process.env, CLAUDEX_CAPTURE_DIR: captureDir},
    });
    assertCaptures(captureDir);
    process.stdout.write('\nClaudex Usage check: passed\n');
} finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
}
