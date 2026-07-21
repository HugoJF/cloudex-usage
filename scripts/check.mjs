#!/usr/bin/env node

import {
    chmodSync,
    copyFileSync,
    cpSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
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

const catalogCaptures = [
    'catalog-panel-dark-100.png',
    'catalog-popup-dark-100.png',
    'catalog-settings-dark-100.png',
    'catalog-panel-disabled.png',
    'catalog-panel-light-100.png',
    'catalog-panel-dark-200.png',
];
const surfaceCaptures = [
    'surface-panel-dark-100.png',
    'surface-popup-dark-100.png',
    'surface-refresh-focus-hover.png',
    'surface-unavailable-popup.png',
    'surface-panel-light-100.png',
    'surface-panel-dark-200.png',
    'surface-settings-dark-100.png',
    'surface-settings-toggle-off-focus-hover.png',
    'surface-settings-cadence-focus-hover.png',
    'surface-settings-light-100.png',
    'surface-left-popup-dark-100.png',
    'surface-history-stepper-dark-100.png',
    'surface-history-stepper-light-100.png',
    'surface-history-stepper-dark-200.png',
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

function assertCommandRejects(command, args, expectedMessage, options = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        ...options,
    });
    if (result.error)
        throw result.error;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status === 0 || !output.includes(expectedMessage))
        throw new Error(`${command} did not reject with ${expectedMessage}`);
}

function validateLegacySettingsSeed(source) {
    const requiredKeys = [
        'show-claude-short',
        'show-claude-weekly',
        'show-codex-weekly',
        'refresh-interval',
        'show-usage-history',
        'history-range',
    ];
    if (typeof source !== 'string' ||
        !source.includes('[org/gnome/shell/extensions/claudex-usage]') ||
        requiredKeys.some(key => !source.includes(`\n${key}=`)))
        throw new Error('legacy GSettings seed is incomplete');
    for (const additiveKey of ['usage-display', 'show-time-pace', 'weekly-pace']) {
        if (source.includes(`\n${additiveKey}=`))
            throw new Error(`legacy GSettings seed already contains ${additiveKey}`);
    }
    return source;
}

function legacySettingsSeed() {
    return validateLegacySettingsSeed(
        '[org/gnome/shell/extensions/claudex-usage]\n' +
        'show-claude-short=false\n' +
        'show-claude-weekly=true\n' +
        'show-codex-weekly=false\n' +
        "refresh-interval='fifteen-minutes'\n" +
        'show-usage-history=false\n' +
        "history-range='7d'\n");
}

function assertLegacySettingsSeedGuard() {
    const valid = legacySettingsSeed();
    for (const [line, key] of [
        ["usage-display='left'", 'usage-display'],
        ['show-time-pace=false', 'show-time-pace'],
        ["weekly-pace='weekdays'", 'weekly-pace'],
    ]) {
        let rejected = false;
        try {
            validateLegacySettingsSeed(`${valid}${line}\n`);
        } catch (error) {
            rejected = error.message ===
                `legacy GSettings seed already contains ${key}`;
        }
        if (!rejected)
            throw new Error(`legacy GSettings seed guard accepted ${key}`);
    }
    process.stdout.write('legacy GSettings seed guard: all verdicts passed\n');
}

function packageEntries(zipPath) {
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
    return entries;
}

function assertPackageEntries(entries, label, extraRequired = []) {
    for (const required of [
        'metadata.json',
        'extension.js',
        'stylesheet.css',
        'tokens.json',
        'shared/actor-utils.js',
        'shared/history-chart.js',
        'shared/history-range-stepper.js',
        'shared/panel-indicator.js',
        'shared/presentation-validation.js',
        'shared/provider-card.js',
        'shared/token-geometry.js',
        'shared/stylesheet.template.css',
        ...extraRequired,
    ]) {
        if (!entries.has(required))
            throw new Error(`${label} package is missing ${required}`);
    }
    for (const stale of ['primitives.js', 'shared/primitives.js', 'token-geometry.js',
        'stylesheet.template.css']) {
        if (entries.has(stale))
            throw new Error(`${label} package contains stale root ${stale}`);
    }
}

function assertPackage(zipPath, label, extraRequired = []) {
    const entries = packageEntries(zipPath);
    assertPackageEntries(entries, label, extraRequired);
    process.stdout.write(`${label} package: complete\n`);
    return entries;
}

function assertPackagedJavaScriptSafety(zipPath, entries, label) {
    const forbidden = [
        /\bconsole\.(?:log|warn|error)\s*\(/,
        /\blog\s*\(/,
        /\b(?:localStorage|sessionStorage)\b/,
        /\b(?:access[_-]?token|password)\s*[:=]\s*['"][^'"]+['"]/i,
    ];
    for (const entry of entries) {
        if (!entry.endsWith('.js'))
            continue;
        const result = spawnSync('unzip', ['-p', zipPath, entry], {
            cwd: root,
            encoding: 'utf8',
        });
        if (result.error || result.status !== 0)
            throw result.error ?? new Error(`Unable to inspect packaged ${entry}`);
        if (forbidden.some(pattern => pattern.test(result.stdout)))
            throw new Error(`${label} package has unsafe JavaScript in ${entry}`);
    }
    process.stdout.write(`${label} package JavaScript: recursively scanned\n`);
}

function assertVerifierRejects(entries) {
    const expectFailure = (fixture, message) => {
        try {
            assertPackageEntries(fixture, 'invalid');
        } catch {
            return;
        }
        throw new Error(`Package verifier accepted ${message}`);
    };
    const absent = new Set(entries);
    absent.delete('shared/token-geometry.js');
    expectFailure(absent, 'an absent shared dependency');

    const misplaced = new Set(entries);
    misplaced.delete('shared/token-geometry.js');
    misplaced.add('token-geometry.js');
    expectFailure(misplaced, 'a misplaced shared dependency');

    const stale = new Set(entries);
    stale.add('primitives.js');
    expectFailure(stale, 'a stale root primitive module');
    process.stdout.write('package verifier: rejection fixtures passed\n');
}

function assertProductionVerifierRejects(entries) {
    const expectFailure = (fixture, message) => {
        try {
            assertPackageEntries(fixture, 'invalid', ['surface-controller.js',
                'panel-preferences.js', 'codex-contract.js', 'codex-runtime.js',
                'claude-contract.js', 'claude-runtime.js',
                'history-store.js', 'history-runtime.js',
                'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
                'icons/claude.svg', 'icons/codex.svg']);
            for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
                if (fixture.has(forbidden))
                    throw new Error(`invalid package contains ${forbidden}`);
            }
        } catch {
            return;
        }
        throw new Error(`Production package verifier accepted ${message}`);
    };
    for (const required of ['surface-controller.js', 'panel-preferences.js',
        'codex-contract.js', 'codex-runtime.js',
        'claude-contract.js', 'claude-runtime.js',
        'history-store.js', 'history-runtime.js',
        'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        'shared/provider-card.js', 'tokens.json',
        'icons/claude.svg']) {
        const absent = new Set(entries);
        absent.delete(required);
        expectFailure(absent, `an absent ${required}`);
    }
    const catalogFixture = new Set(entries);
    catalogFixture.add('catalog-state.js');
    expectFailure(catalogFixture, 'a catalog fixture');
    const stubFixture = new Set(entries);
    stubFixture.add('stub-provider.js');
    expectFailure(stubFixture, 'a packaged stub');
    process.stdout.write('production package verifier: rejection fixtures passed\n');
}

function assertProviderSourceSafety() {
    const source = ['codex-contract.js', 'codex-runtime.js',
        'claude-contract.js', 'claude-runtime.js']
        .map(file => readFileSync(path.join(root, 'extension', file), 'utf8')).join('\n');
    const forbidden = [/\bGio\.(?:Subprocess|AppInfo)\b/,
        /\bGLib\.(?:spawn|shell_parse_argv)\b/, /\b(?:AppSystem|GSettings)\b/,
        /\b(?:codex|claude)\s+(?:login|exec)\b/i, /\bconsole\.(?:log|warn|error)\s*\(/,
        /\.(?:replace_contents|create|append_to|move|copy)\s*\(/];
    const verify = value => {
        if (forbidden.some(pattern => pattern.test(value)))
            throw new Error('Provider source contains a launch, log, or persistence path');
    };
    verify(source);
    let rejected;
    try {
        verify(`${source}\nGio.Subprocess.new(['claude', 'login']);`);
    } catch { rejected = true; }
    if (!rejected)
        throw new Error('Provider source guard accepted a tainted fixture');
    process.stdout.write('Provider source guard: both verdicts passed\n');
}

function replaceExactly(file, before, after) {
    const source = readFileSync(file, 'utf8');
    if (source.split(before).length !== 2)
        throw new Error(`Expected one replacement in ${file}`);
    writeFileSync(file, source.replace(before, after));
}

function prepareProductionVariant(sourceDir, packageDir, edits) {
    cpSync(path.join(root, 'extension'), sourceDir, {recursive: true});
    copyFileSync(path.join(root, 'design/system/tokens.json'),
        path.join(sourceDir, 'tokens.json'));
    cpSync(path.join(root, 'design/direction-lab/icons'),
        path.join(sourceDir, 'icons'), {recursive: true});
    edits(sourceDir);
    run('gnome-extensions', [
        'pack', '--force',
        '--schema=schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        '--extra-source=surface-controller.js', '--extra-source=panel-preferences.js',
        '--extra-source=codex-contract.js', '--extra-source=codex-runtime.js',
        '--extra-source=claude-contract.js', '--extra-source=claude-runtime.js',
        '--extra-source=history-store.js', '--extra-source=history-runtime.js',
        '--extra-source=controller-snapshot.js',
        '--extra-source=controller-validation.js', '--extra-source=panel-view.js',
        '--extra-source=temporal.js',
        '--extra-source=shared',
        '--extra-source=tokens.json', '--extra-source=icons',
        '--out-dir', packageDir, sourceDir,
    ]);
    return path.join(packageDir, 'claudex-usage@hugo.local.shell-extension.zip');
}

function assertCaptures(captureDir, captures, label, compareCanonical) {
    for (const filename of captures) {
        const bytes = readFileSync(path.join(captureDir, filename));
        const pngSignature = bytes.subarray(0, 8).toString('hex');
        if (pngSignature !== '89504e470d0a1a0a' || bytes.length < 256)
            throw new Error(`${filename} is not a non-empty PNG capture`);
        if (compareCanonical) {
            // Popup actor bounds include five pixels of global panel chrome whose
            // active-indicator antialiasing is outside the extension actor tree.
            const comparableImage = filePath => {
                if (filename.includes('panel'))
                    {return [filePath];}
                if (filename === 'surface-history-stepper-dark-200.png') {
                    return ['(', filePath, '-crop', '856x266+8+21',
                        '+repage', ')'];
                }
                const topCrop = 5;
                return ['(', filePath, '-crop', `99999x99999+0+${topCrop}`,
                    '+repage', ')'];
            };
            const result = spawnSync('compare', [
                '-metric', 'AE',
                ...comparableImage(path.join(root, 'design/captures', filename)),
                ...comparableImage(path.join(captureDir, filename)),
                'null:',
            ], {cwd: root, encoding: 'utf8'});
            if (result.error)
                throw result.error;
            const absoluteError = Number.parseFloat(result.stderr);
            if (result.status !== 0 || absoluteError !== 0)
                throw new Error(`${filename} differs by ${absoluteError} pixels`);
        }
    }
    const comparison = compareCanonical ? ' and pixel-identical' : '';
    process.stdout.write(`${label} captures: ${captures.length} verified` +
        `${comparison}\n`);
}

function writeSharedConsumer(sourceDir, journeyPath) {
    cpSync(path.join(root, 'tests/fixtures/shared-proof'), sourceDir, {
        recursive: true,
    });
    mkdirSync(path.join(sourceDir, 'shared'), {recursive: true});
    cpSync(path.join(root, 'extension/shared'), path.join(sourceDir, 'shared'), {
        recursive: true,
    });
    copyFileSync(path.join(root, 'design/system/tokens.json'),
        path.join(sourceDir, 'tokens.json'));
    copyFileSync(path.join(root, 'design/direction-lab/stylesheet.css'),
        path.join(sourceDir, 'stylesheet.css'));
    copyFileSync(path.join(root, 'tests/gjs/shared-proof.journey.js'), journeyPath);
}

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'claudex-usage-check-'));
const packageDir = path.join(temporaryRoot, 'package');
const productionPackageDir = path.join(temporaryRoot, 'production-package');
const proofSourceDir = path.join(temporaryRoot, 'shared-proof');
const proofPackageDir = path.join(temporaryRoot, 'shared-proof-package');
const proofJourneyPath = path.join(temporaryRoot, 'shared-proof.journey.js');
const settingsFixtureDir = path.join(temporaryRoot, 'settings-fixture');
const fixtureSourceDir = path.join(temporaryRoot, 'fixture-source');
const fixturePackageDir = path.join(temporaryRoot, 'fixture-package');
const journeySourceDir = path.join(temporaryRoot, 'journey-source');
const journeyPackageDir = path.join(temporaryRoot, 'journey-package');
const claudeJourneySourceDir = path.join(temporaryRoot, 'claude-journey-source');
const claudeJourneyPackageDir = path.join(temporaryRoot, 'claude-journey-package');
const fixtureProcRoot = path.join(temporaryRoot, 'empty-proc');
const journeyProcRoot = path.join(temporaryRoot, 'journey-proc');
const claudeJourneyProcRoot = path.join(temporaryRoot, 'claude-journey-proc');
const codexHome = path.join(temporaryRoot, 'codex-home');
const claudeConfigHome = path.join(temporaryRoot, 'claude-home');
const codexAdapterHistoryDir = path.join(temporaryRoot, 'codex-adapter-history');
const claudeAdapterHistoryDir = path.join(temporaryRoot, 'claude-adapter-history');
const claudeHistoryDir = path.join(temporaryRoot, 'claude-history');
const surfaceHistoryDir = path.join(temporaryRoot, 'surface-history');
const settingsHistoryDir = path.join(temporaryRoot, 'settings-history');
const missingSettingsFixtureDir = path.join(temporaryRoot, 'missing-settings-fixture');
const missingSettingsConfigDir = path.join(temporaryRoot, 'missing-settings-config');
const fakeCodex = path.join(temporaryRoot, 'codex');
const fakeClaude = path.join(temporaryRoot, 'claude');
const captureDir = updateCaptures
    ? path.join(root, 'design/captures')
    : path.join(temporaryRoot, 'captures');
for (const directory of [packageDir, productionPackageDir, proofPackageDir,
    captureDir, settingsFixtureDir, fixturePackageDir, journeyPackageDir,
    claudeJourneyPackageDir, fixtureProcRoot, journeyProcRoot, claudeJourneyProcRoot,
    codexHome, claudeConfigHome, codexAdapterHistoryDir,
    claudeAdapterHistoryDir, claudeHistoryDir, surfaceHistoryDir,
    settingsHistoryDir])
    mkdirSync(directory, {recursive: true});
assertLegacySettingsSeedGuard();
assertCommandRejects('sh', [path.join(root, 'scripts/gsettings-session-wrapper.sh'),
    '/usr/bin/true'], 'missing validated legacy GSettings seed', {
    env: {
        ...process.env,
        XDG_CONFIG_HOME: missingSettingsConfigDir,
        CLAUDEX_GSETTINGS_FIXTURE_DIR: missingSettingsFixtureDir,
        CLAUDEX_J003_PHASE: 'write',
    },
});
process.stdout.write('GSettings session wrapper: missing-seed rejection passed\n');
writeFileSync(path.join(settingsFixtureDir, 'legacy-keyfile'), legacySettingsSeed());
writeFileSync(path.join(codexHome, 'auth.json'),
    JSON.stringify({tokens: {access_token: 'journey-token'}}));
writeFileSync(path.join(claudeConfigHome, '.credentials.json'),
    JSON.stringify({claudeAiOauth: {accessToken: 'journey-token'}}));
copyFileSync('/usr/bin/python3', fakeCodex);
chmodSync(fakeCodex, 0o700);
copyFileSync('/usr/bin/python3', fakeClaude);
chmodSync(fakeClaude, 0o700);

try {
    for (const script of ['scripts/gsettings-session-wrapper.sh',
        'scripts/live-check.sh', 'scripts/live-play.sh'])
        run('bash', ['-n', script]);
    run('node', ['scripts/doc-lint.mjs', 'docs/product', 'docs/engineering']);
    run('node', ['scripts/render-catalog-styles.mjs', '--check']);
    run('node', ['--test', 'tests/unit/catalog-state.test.js',
        'tests/unit/claude-contract.test.js',
        'tests/unit/codex-contract.test.js',
        'tests/unit/design-tokens.test.js', 'tests/unit/history-store.test.js',
        'tests/unit/panel-preferences.test.js',
        'tests/unit/surface-controller.test.js',
        'tests/unit/weekday-pace-timezone.test.js']);
    run('gjs', ['-m', 'tests/unit/codex-adapter.test.js']);
    run('gjs', ['-m', 'tests/unit/claude-adapter.test.js']);
    run('gjs', ['-m', 'tests/unit/history-runtime.test.js']);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=icons',
        '--extra-source=catalog-state.js',
        '--extra-source=../../extension/shared',
        '--extra-source=../system/tokens.json',
        '--out-dir', packageDir,
        'design/direction-lab',
    ]);

    const zipPath = path.join(packageDir,
        'claudex-usage-design@hugo.local.shell-extension.zip');
    const catalogEntries = assertPackage(zipPath, 'catalog', [
        'catalog-state.js',
        'icons/claude.svg',
        'icons/claude-light.svg',
        'icons/codex.svg',
        'icons/codex-light.svg',
    ]);
    assertPackagedJavaScriptSafety(zipPath, catalogEntries, 'catalog');
    assertVerifierRejects(catalogEntries);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--schema=schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        '--extra-source=surface-controller.js',
        '--extra-source=panel-preferences.js',
        '--extra-source=codex-contract.js',
        '--extra-source=codex-runtime.js',
        '--extra-source=claude-contract.js',
        '--extra-source=claude-runtime.js',
        '--extra-source=history-store.js',
        '--extra-source=history-runtime.js',
        '--extra-source=controller-snapshot.js',
        '--extra-source=controller-validation.js',
        '--extra-source=panel-view.js',
        '--extra-source=temporal.js',
        '--extra-source=shared',
        '--extra-source=../design/system/tokens.json',
        '--extra-source=../design/direction-lab/icons',
        '--out-dir', productionPackageDir,
        'extension',
    ]);
    const productionZipPath = path.join(productionPackageDir,
        'claudex-usage@hugo.local.shell-extension.zip');
    const productionEntries = assertPackage(productionZipPath, 'production', [
        'surface-controller.js',
        'panel-preferences.js',
        'codex-contract.js',
        'codex-runtime.js',
        'claude-contract.js',
        'claude-runtime.js',
        'history-store.js',
        'history-runtime.js',
        'controller-snapshot.js',
        'controller-validation.js',
        'panel-view.js',
        'temporal.js',
        'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
        'icons/claude.svg',
        'icons/claude-light.svg',
        'icons/codex.svg',
        'icons/codex-light.svg',
    ]);
    assertPackagedJavaScriptSafety(productionZipPath, productionEntries,
        'production');
    for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
        if (productionEntries.has(forbidden))
            throw new Error(`production package contains forbidden ${forbidden}`);
    }
    assertProductionVerifierRejects(productionEntries);
    assertProviderSourceSafety();
    const neutralizeProcRoot = (sourceDir, runtimeClass, procRoot) =>
        replaceExactly(path.join(sourceDir, 'extension.js'),
            `new ${runtimeClass}()`,
            `new ${runtimeClass}({procRoot: ${JSON.stringify(procRoot)}})`);
    const fixtureZipPath = prepareProductionVariant(
        fixtureSourceDir, fixturePackageDir, sourceDir => {
            replaceExactly(path.join(sourceDir, 'codex-runtime.js'),
                "        id: 'codex',", "        id: 'codex-installed-fixture',");
            replaceExactly(path.join(sourceDir, 'claude-runtime.js'),
                "        id: 'claude',", "        id: 'claude-installed-fixture',");
            neutralizeProcRoot(sourceDir, 'CodexRuntime', fixtureProcRoot);
            neutralizeProcRoot(sourceDir, 'ClaudeRuntime', fixtureProcRoot);
        });
    const journeyZipPath = prepareProductionVariant(
        journeySourceDir, journeyPackageDir, sourceDir => {
            replaceExactly(path.join(sourceDir, 'codex-runtime.js'),
                'https://chatgpt.com/backend-api/wham/usage',
                'http://127.0.0.1:19876/usage');
            neutralizeProcRoot(sourceDir, 'CodexRuntime', journeyProcRoot);
            neutralizeProcRoot(sourceDir, 'ClaudeRuntime', fixtureProcRoot);
        });
    run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
        '--disable-animations', '--extension', journeyZipPath,
        'tests/journeys/J-004-codex-usage.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CODEX_HOME: codexHome, CLAUDEX_FAKE_CODEX: fakeCodex,
            CLAUDEX_PROC_ROOT: journeyProcRoot,
            CLAUDEX_HISTORY_DIR: codexAdapterHistoryDir},
    });
    const claudeJourneyZipPath = prepareProductionVariant(
        claudeJourneySourceDir, claudeJourneyPackageDir, sourceDir => {
            replaceExactly(path.join(sourceDir, 'claude-runtime.js'),
                'https://api.anthropic.com/api/oauth/usage',
                'http://127.0.0.1:19876/usage');
            neutralizeProcRoot(sourceDir, 'ClaudeRuntime', claudeJourneyProcRoot);
            neutralizeProcRoot(sourceDir, 'CodexRuntime', fixtureProcRoot);
        });
    run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
        '--disable-animations', '--extension', claudeJourneyZipPath,
        'tests/journeys/J-005-claude-usage.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CLAUDE_CONFIG_DIR: claudeConfigHome,
            CLAUDEX_FAKE_CLAUDE: fakeClaude, CLAUDEX_PROC_ROOT: claudeJourneyProcRoot,
            CLAUDEX_HISTORY_DIR: claudeAdapterHistoryDir},
    });
    const seedNow = Date.now();
    const seedSample = (hoursAgo, percent) => [seedNow - hoursAgo * 3600 * 1000, percent];
    writeFileSync(path.join(claudeHistoryDir, 'history.json'), JSON.stringify({
        version: 1,
        windows: {
            'claude:short': [seedSample(7, 8), seedSample(3, 14), seedSample(1, 11)],
            'claude:weekly': [seedSample(7, 60), seedSample(3, 63), seedSample(1, 66)],
        },
    }));
    for (const phase of ['write', 'restore']) {
        run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
            '--disable-animations', '--extension', claudeJourneyZipPath,
            'tests/journeys/J-006-usage-history.journey.test.js',
        ], {
            env: {...process.env, GSETTINGS_BACKEND: 'memory',
                CLAUDE_CONFIG_DIR: claudeConfigHome,
                CLAUDEX_FAKE_CLAUDE: fakeClaude,
                CLAUDEX_PROC_ROOT: claudeJourneyProcRoot,
                CLAUDEX_HISTORY_DIR: claudeHistoryDir,
                CLAUDEX_CAPTURE_DIR: captureDir,
                CLAUDEX_J006_PHASE: phase},
        });
    }
    writeSharedConsumer(proofSourceDir, proofJourneyPath);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=shared',
        '--extra-source=tokens.json',
        '--out-dir', proofPackageDir,
        proofSourceDir,
    ]);
    const proofZipPath = path.join(proofPackageDir,
        'claudex-shared-proof@hugo.local.shell-extension.zip');
    assertPackage(proofZipPath, 'shared consumer');
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', proofZipPath,
        proofJourneyPath,
    ]);
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
    for (const phase of ['write', 'restore']) {
        run('dbus-run-session', [
            '--',
            'gnome-shell-test-tool',
            '--devkit',
            '--disable-animations',
            '--wrap', path.join(root, 'scripts/gsettings-session-wrapper.sh'),
            '--extension', fixtureZipPath,
            'tests/journeys/J-003-panel-preferences.journey.test.js',
        ], {
            env: {
                ...process.env,
                CLAUDEX_CAPTURE_DIR: captureDir,
                CLAUDEX_GSETTINGS_FIXTURE_DIR: settingsFixtureDir,
                CLAUDEX_J003_PHASE: phase,
                CLAUDEX_HISTORY_DIR: settingsHistoryDir,
            },
        });
    }
    run('dbus-run-session', [
        '--',
        'gnome-shell-test-tool',
        '--devkit',
        '--disable-animations',
        '--extension', fixtureZipPath,
        'tests/journeys/J-002-usage-surface.journey.test.js',
    ], {
        env: {...process.env, GSETTINGS_BACKEND: 'memory',
            CLAUDEX_CAPTURE_DIR: captureDir,
            CLAUDEX_HISTORY_DIR: surfaceHistoryDir},
    });
    assertCaptures(captureDir, catalogCaptures, 'catalog', !updateCaptures);
    assertCaptures(captureDir, surfaceCaptures, 'production surface', !updateCaptures);
    process.stdout.write('\nClaudex Usage check: passed\n');
} finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
}
