import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function packageEntries(zipPath) {
    const zip = readFileSync(zipPath);
    const entries = new Set();
    let offset = 0;
    const centralHeader = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    const fixedHeaderBytes = 46;
    while (offset <= zip.length - fixedHeaderBytes) {
        const header = zip.indexOf(centralHeader, offset);
        if (header < 0)
            {break;}
        const filenameLength = zip.readUInt16LE(header + 28);
        const extraLength = zip.readUInt16LE(header + 30);
        const commentLength = zip.readUInt16LE(header + 32);
        const start = header + fixedHeaderBytes;
        entries.add(zip.subarray(start, start + filenameLength).toString('utf8'));
        offset = start + filenameLength + extraLength + commentLength;
    }
    if (entries.size === 0)
        {throw new Error(`Unable to inspect ${zipPath}`);}
    return entries;
}

function assertPackageEntries(entries, label, extraRequired = []) {
    const requiredFiles = ['metadata.json', 'extension.js', 'stylesheet.css',
        'tokens.json', 'shared/actor-utils.js', 'shared/history-chart.js',
        'shared/history-range-stepper.js', 'shared/panel-indicator.js',
        'shared/presentation-validation.js', 'shared/provider-card.js',
        'shared/token-geometry.js', 'shared/stylesheet.template.css',
        ...extraRequired];
    for (const required of requiredFiles) {
        if (!entries.has(required))
            {throw new Error(`${label} package is missing ${required}`);}
    }
    for (const stale of ['primitives.js', 'shared/primitives.js',
        'token-geometry.js', 'stylesheet.template.css']) {
        if (entries.has(stale))
            {throw new Error(`${label} package contains stale root ${stale}`);}
    }
}

function assertProductionEntries(entries) {
    assertPackageEntries(entries, 'production', PRODUCTION_REQUIRED);
    for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
        if (entries.has(forbidden))
            {throw new Error(`production package contains ${forbidden}`);}
    }
}

export function assertPackage(zipPath, label, extraRequired = []) {
    const entries = packageEntries(zipPath);
    assertPackageEntries(entries, label, extraRequired);
    process.stdout.write(`${label} package: complete\n`);
    return entries;
}

export function assertPackagedJavaScriptSafety(root, zipPath, entries, label) {
    const forbidden = [/\bconsole\.(?:log|warn|error)\s*\(/, /\blog\s*\(/,
        /\b(?:localStorage|sessionStorage)\b/,
        /\b(?:access[_-]?token|password)\s*[:=]\s*['"][^'"]+['"]/i];
    for (const entry of entries) {
        if (!entry.endsWith('.js'))
            {continue;}
        const result = spawnSync('unzip', ['-p', zipPath, entry],
            {cwd: root, encoding: 'utf8'});
        if (result.error || result.status !== 0)
            {throw result.error ?? new Error(`Unable to inspect packaged ${entry}`);}
        if (forbidden.some(pattern => pattern.test(result.stdout)))
            {throw new Error(`${label} package has unsafe JavaScript in ${entry}`);}
    }
    process.stdout.write(`${label} package JavaScript: recursively scanned\n`);
}

function expectPackageFailure(entries, extraRequired, mutate, message) {
    const fixture = new Set(entries);
    mutate(fixture);
    try {
        assertPackageEntries(fixture, 'invalid', extraRequired);
    } catch {
        return;
    }
    throw new Error(`Package verifier accepted ${message}`);
}

export function assertVerifierRejects(entries) {
    expectPackageFailure(entries, [], fixture =>
        fixture.delete('shared/token-geometry.js'), 'an absent shared dependency');
    expectPackageFailure(entries, [], fixture => {
        fixture.delete('shared/token-geometry.js');
        fixture.add('token-geometry.js');
    }, 'a misplaced shared dependency');
    expectPackageFailure(entries, [], fixture => fixture.add('primitives.js'),
        'a stale root primitive module');
    process.stdout.write('package verifier: rejection fixtures passed\n');
}

const PRODUCTION_REQUIRED = ['surface-controller.js', 'panel-preferences.js',
    'codex-contract.js', 'codex-runtime.js', 'claude-contract.js',
    'claude-runtime.js', 'history-store.js', 'history-runtime.js',
    'schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml',
    'icons/claude.svg', 'icons/codex.svg'];

export function assertProductionVerifierRejects(entries) {
    const expectFailure = (mutate, message) => {
        const fixture = new Set(entries);
        mutate(fixture);
        try {
            assertProductionEntries(fixture);
        } catch {
            return;
        }
        throw new Error(`Production package verifier accepted ${message}`);
    };
    for (const required of PRODUCTION_REQUIRED) {
        expectFailure(fixture => fixture.delete(required), `an absent ${required}`);
    }
    for (const forbidden of ['catalog-state.js', 'stub-provider.js']) {
        expectFailure(fixture => fixture.add(forbidden), `a packaged ${forbidden}`);
    }
    process.stdout.write('production package verifier: rejection fixtures passed\n');
}

export function assertProviderSourceSafety(root) {
    const source = ['codex-contract.js', 'codex-runtime.js',
        'claude-contract.js', 'claude-runtime.js']
        .map(file => readFileSync(path.join(root, 'extension', file), 'utf8'))
        .join('\n');
    const forbidden = [/\bGio\.(?:Subprocess|AppInfo)\b/,
        /\bGLib\.(?:spawn|shell_parse_argv)\b/, /\b(?:AppSystem|GSettings)\b/,
        /\b(?:codex|claude)\s+(?:login|exec)\b/i,
        /\bconsole\.(?:log|warn|error)\s*\(/,
        /\.(?:replace_contents|create|append_to|move|copy)\s*\(/];
    const unsafe = value => forbidden.some(pattern => pattern.test(value));
    if (unsafe(source))
        {throw new Error('Provider source contains a launch, log, or persistence path');}
    if (!unsafe(`${source}\nGio.Subprocess.new(['claude', 'login']);`))
        {throw new Error('Provider source guard accepted a tainted fixture');}
    process.stdout.write('Provider source guard: both verdicts passed\n');
}
