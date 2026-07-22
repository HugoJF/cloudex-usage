#!/usr/bin/env node

import {rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    assertCommandRejects as rejectCommand,
    assertLegacySettingsSeedGuard,
    legacySettingsSeed,
    run as runCommand,
} from './check-command-helpers.mjs';
import {
    CATALOG_CAPTURES,
    SURFACE_CAPTURES,
    assertCaptures as verifyCaptures,
    prepareProductionVariant as buildProductionVariant,
    replaceExactly,
    writeSharedConsumer,
} from './check-capture-helpers.mjs';
import {
    assertPackage,
    assertPackagedJavaScriptSafety as verifyPackagedJavaScriptSafety,
    assertProductionVerifierRejects,
    assertProviderSourceSafety,
    assertVerifierRejects,
} from './check-package-helpers.mjs';
import {
    createCheckWorkspace,
    initializeCheckFixtures,
    seedHistory,
} from './check-workspace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const updateCaptures = process.argv.includes('--update-captures');
const unknownArgs = process.argv.slice(2)
    .filter(argument => argument !== '--update-captures');
if (unknownArgs.length > 0)
    {throw new Error(`Unknown arguments: ${unknownArgs.join(' ')}`);}

const run = (command, args, options = {}) =>
    runCommand(root, command, args, options);
const assertCommandRejects = (command, args, expectedMessage, options = {}) =>
    rejectCommand({root, command, args, expectedMessage, options});
const assertPackagedJavaScriptSafety = (zipPath, entries, label) =>
    verifyPackagedJavaScriptSafety(root, zipPath, entries, label);
const prepareProductionVariant = (sourceDir, packageDir, edits) =>
    buildProductionVariant({root, sourceDir, packageDir, edits, run});
const assertCaptures = (captureDir, captures, label, compareCanonical) =>
    verifyCaptures({root, captureDir, captures, label, compareCanonical});

const workspace = createCheckWorkspace(root, updateCaptures);
const {temporaryRoot, packageDir, productionPackageDir, proofSourceDir,
    proofPackageDir, proofJourneyPath, settingsFixtureDir, fixtureSourceDir,
    fixturePackageDir, journeySourceDir, journeyPackageDir,
    claudeJourneySourceDir, claudeJourneyPackageDir, fixtureProcRoot,
    journeyProcRoot, claudeJourneyProcRoot, codexHome, claudeConfigHome,
    codexAdapterHistoryDir, claudeAdapterHistoryDir, claudeHistoryDir,
    surfaceHistoryDir, settingsHistoryDir, missingSettingsFixtureDir,
    missingSettingsConfigDir, fakeCodex, fakeClaude, captureDir} = workspace;
assertLegacySettingsSeedGuard();
assertCommandRejects('sh', [path.join(root, 'scripts/gsettings-session-wrapper.sh'),
    '/usr/bin/true'], 'missing validated legacy GSettings seed', {
    env: {
        ...process.env,
        XDG_CONFIG_HOME: missingSettingsConfigDir,
        CLOUDEX_GSETTINGS_FIXTURE_DIR: missingSettingsFixtureDir,
        CLOUDEX_J003_PHASE: 'write',
    },
});
process.stdout.write('GSettings session wrapper: missing-seed rejection passed\n');
initializeCheckFixtures(workspace, legacySettingsSeed());

try {
    for (const script of ['scripts/gsettings-session-wrapper.sh',
        'scripts/live-check.sh', 'scripts/live-play.sh'])
        {run('bash', ['-n', script]);}
    run('node', ['scripts/doc-lint.mjs', 'docs/product', 'docs/engineering']);
    run('node', ['scripts/render-catalog-styles.mjs', '--check']);
    run('node', ['--test', 'tests/unit/catalog-state.test.js',
        'tests/unit/claude-contract.test.js',
        'tests/unit/codex-contract.test.js',
        'tests/unit/design-tokens.test.js', 'tests/unit/history-store.test.js',
        'tests/unit/panel-preferences.test.js',
        'tests/unit/surface-controller-registration.test.js',
        'tests/unit/surface-controller-scheduling.test.js',
        'tests/unit/surface-controller-refresh.test.js',
        'tests/unit/surface-controller-temporal.test.js',
        'tests/unit/weekday-pace-timezone.test.js']);
    run('gjs', ['-m', 'tests/unit/codex-adapter.test.js']);
    run('gjs', ['-m', 'tests/unit/claude-adapter.test.js']);
    run('gjs', ['-m', 'tests/unit/history-runtime.test.js']);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=icons',
        '--extra-source=catalog-state.js',
        '--extra-source=catalog-panel.js',
        '--extra-source=catalog-settings-view.js',
        '--extra-source=catalog-usage-view.js',
        '--extra-source=../../extension/shared',
        '--extra-source=../system/tokens.json',
        '--out-dir', packageDir,
        'design/direction-lab',
    ]);

    const zipPath = path.join(packageDir,
        'cloudex-usage-design@hugo.local.shell-extension.zip');
    const catalogEntries = assertPackage(zipPath, 'catalog', [
        'catalog-state.js',
        'catalog-panel.js',
        'catalog-settings-view.js',
        'catalog-usage-view.js',
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
        '--schema=schemas/org.gnome.shell.extensions.cloudex-usage.gschema.xml',
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
        '--extra-source=history-view.js', '--extra-source=usage-view.js',
        '--extra-source=settings-view.js', '--extra-source=load-tokens.js',
        '--extra-source=temporal.js',
        '--extra-source=shared',
        '--extra-source=../design/system/tokens.json',
        '--extra-source=../design/direction-lab/icons',
        '--out-dir', productionPackageDir,
        'extension',
    ]);
    const productionZipPath = path.join(productionPackageDir,
        'cloudex-usage@hugo.local.shell-extension.zip');
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
        'history-view.js',
        'usage-view.js',
        'settings-view.js',
        'load-tokens.js',
        'temporal.js',
        'schemas/org.gnome.shell.extensions.cloudex-usage.gschema.xml',
        'icons/claude.svg',
        'icons/claude-light.svg',
        'icons/codex.svg',
        'icons/codex-light.svg',
    ]);
    assertPackagedJavaScriptSafety(productionZipPath, productionEntries,
        'production');
    for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
        if (productionEntries.has(forbidden))
            {throw new Error(`production package contains forbidden ${forbidden}`);}
    }
    assertProductionVerifierRejects(productionEntries);
    assertProviderSourceSafety(root);
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
            CODEX_HOME: codexHome, CLOUDEX_FAKE_CODEX: fakeCodex,
            CLOUDEX_PROC_ROOT: journeyProcRoot,
            CLOUDEX_HISTORY_DIR: codexAdapterHistoryDir},
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
            CLOUDEX_FAKE_CLAUDE: fakeClaude, CLOUDEX_PROC_ROOT: claudeJourneyProcRoot,
            CLOUDEX_HISTORY_DIR: claudeAdapterHistoryDir},
    });
    seedHistory(claudeHistoryDir);
    for (const phase of ['write', 'restore']) {
        run('dbus-run-session', ['--', 'gnome-shell-test-tool', '--devkit',
            '--disable-animations', '--extension', claudeJourneyZipPath,
            'tests/journeys/J-006-usage-history.journey.test.js',
        ], {
            env: {...process.env, GSETTINGS_BACKEND: 'memory',
                CLAUDE_CONFIG_DIR: claudeConfigHome,
                CLOUDEX_FAKE_CLAUDE: fakeClaude,
                CLOUDEX_PROC_ROOT: claudeJourneyProcRoot,
                CLOUDEX_HISTORY_DIR: claudeHistoryDir,
                CLOUDEX_CAPTURE_DIR: captureDir,
                CLOUDEX_J006_PHASE: phase},
        });
    }
    writeSharedConsumer(root, proofSourceDir, proofJourneyPath);
    run('gnome-extensions', [
        'pack',
        '--force',
        '--extra-source=shared',
        '--extra-source=tokens.json',
        '--out-dir', proofPackageDir,
        proofSourceDir,
    ]);
    const proofZipPath = path.join(proofPackageDir,
        'cloudex-shared-proof@hugo.local.shell-extension.zip');
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
        env: {...process.env, CLOUDEX_CAPTURE_DIR: captureDir},
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
                CLOUDEX_CAPTURE_DIR: captureDir,
                CLOUDEX_GSETTINGS_FIXTURE_DIR: settingsFixtureDir,
                CLOUDEX_J003_PHASE: phase,
                CLOUDEX_HISTORY_DIR: settingsHistoryDir,
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
            CLOUDEX_CAPTURE_DIR: captureDir,
            CLOUDEX_HISTORY_DIR: surfaceHistoryDir},
    });
    assertCaptures(captureDir, CATALOG_CAPTURES, 'catalog', !updateCaptures);
    assertCaptures(captureDir, SURFACE_CAPTURES, 'production surface',
        !updateCaptures);
    process.stdout.write('\nCloudex Usage check: passed\n');
} finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
}
