import {chmodSync, copyFileSync, mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIRECTORY_NAMES = ['packageDir', 'productionPackageDir', 'proofPackageDir',
    'captureDir', 'settingsFixtureDir', 'fixturePackageDir', 'journeyPackageDir',
    'claudeJourneyPackageDir', 'fixtureProcRoot', 'journeyProcRoot',
    'claudeJourneyProcRoot', 'codexHome', 'claudeConfigHome',
    'codexAdapterHistoryDir', 'claudeAdapterHistoryDir', 'claudeHistoryDir',
    'surfaceHistoryDir', 'settingsHistoryDir'];

const PATHS = {
    packageDir: 'package',
    productionPackageDir: 'production-package',
    proofSourceDir: 'shared-proof',
    proofPackageDir: 'shared-proof-package',
    proofJourneyPath: 'shared-proof.journey.js',
    settingsFixtureDir: 'settings-fixture',
    fixtureSourceDir: 'fixture-source',
    fixturePackageDir: 'fixture-package',
    journeySourceDir: 'journey-source',
    journeyPackageDir: 'journey-package',
    claudeJourneySourceDir: 'claude-journey-source',
    claudeJourneyPackageDir: 'claude-journey-package',
    fixtureProcRoot: 'empty-proc',
    journeyProcRoot: 'journey-proc',
    claudeJourneyProcRoot: 'claude-journey-proc',
    codexHome: 'codex-home',
    claudeConfigHome: 'claude-home',
    codexAdapterHistoryDir: 'codex-adapter-history',
    claudeAdapterHistoryDir: 'claude-adapter-history',
    claudeHistoryDir: 'claude-history',
    surfaceHistoryDir: 'surface-history',
    settingsHistoryDir: 'settings-history',
    missingSettingsFixtureDir: 'missing-settings-fixture',
    missingSettingsConfigDir: 'missing-settings-config',
    fakeCodex: 'codex',
    fakeClaude: 'claude',
};

export function createCheckWorkspace(root, updateCaptures) {
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(),
        'cloudex-usage-check-'));
    const workspace = {temporaryRoot};
    for (const [key, relativePath] of Object.entries(PATHS))
        {workspace[key] = path.join(temporaryRoot, relativePath);}
    workspace.captureDir = updateCaptures
        ? path.join(root, 'design/captures')
        : path.join(temporaryRoot, 'captures');
    for (const key of DIRECTORY_NAMES)
        {mkdirSync(workspace[key], {recursive: true});}
    return workspace;
}

export function initializeCheckFixtures(workspace, settingsSeed) {
    writeFileSync(path.join(workspace.settingsFixtureDir, 'legacy-keyfile'),
        settingsSeed);
    writeFileSync(path.join(workspace.codexHome, 'auth.json'),
        JSON.stringify({tokens: {access_token: 'journey-token'}}));
    writeFileSync(path.join(workspace.claudeConfigHome, '.credentials.json'),
        JSON.stringify({claudeAiOauth: {accessToken: 'journey-token'}}));
    copyFileSync('/usr/bin/python3', workspace.fakeCodex);
    chmodSync(workspace.fakeCodex, 0o700);
    copyFileSync('/usr/bin/python3', workspace.fakeClaude);
    chmodSync(workspace.fakeClaude, 0o700);
}

export function seedHistory(historyDirectory) {
    const now = Date.now();
    const sample = (hoursAgo, percent) =>
        [now - hoursAgo * 60 * 60 * 1000, percent];
    writeFileSync(path.join(historyDirectory, 'history.json'), JSON.stringify({
        version: 1,
        windows: {
            'claude:short': [sample(7, 8), sample(3, 14), sample(1, 11)],
            'claude:weekly': [sample(7, 60), sample(3, 63), sample(1, 66)],
        },
    }));
}
