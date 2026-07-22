import {spawnSync} from 'node:child_process';

export function run(root, command, args, options = {}) {
    process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
    const result = spawnSync(command, args, {cwd: root, encoding: 'utf8',
        stdio: 'inherit', ...options});
    if (result.error)
        {throw result.error;}
    if (result.status !== 0)
        {throw new Error(`${command} exited with status ${result.status}`);}
}

export function assertCommandRejects({root, command, args, expectedMessage,
    options = {}}) {
    const result = spawnSync(command, args, {cwd: root, encoding: 'utf8',
        ...options});
    if (result.error)
        {throw result.error;}
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status === 0 || !output.includes(expectedMessage))
        {throw new Error(`${command} did not reject with ${expectedMessage}`);}
}

function validateLegacySettingsSeed(source) {
    const requiredKeys = ['show-claude-short', 'show-claude-weekly',
        'show-codex-weekly', 'refresh-interval', 'show-usage-history',
        'history-range'];
    if (typeof source !== 'string' ||
        !source.includes('[org/gnome/shell/extensions/cloudex-usage]') ||
        requiredKeys.some(key => !source.includes(`\n${key}=`)))
        {throw new Error('legacy GSettings seed is incomplete');}
    for (const key of ['usage-display', 'show-time-pace', 'weekly-pace']) {
        if (source.includes(`\n${key}=`))
            {throw new Error(`legacy GSettings seed already contains ${key}`);}
    }
    return source;
}

export function legacySettingsSeed() {
    return validateLegacySettingsSeed(
        '[org/gnome/shell/extensions/cloudex-usage]\n' +
        'show-claude-short=false\nshow-claude-weekly=true\n' +
        'show-codex-weekly=false\n' +
        "refresh-interval='fifteen-minutes'\n" +
        'show-usage-history=false\n' +
        "history-range='7d'\n");
}

export function assertLegacySettingsSeedGuard() {
    const valid = legacySettingsSeed();
    for (const [line, key] of [["usage-display='left'", 'usage-display'],
        ['show-time-pace=false', 'show-time-pace'],
        ["weekly-pace='weekdays'", 'weekly-pace']]) {
        let rejected = false;
        try {
            validateLegacySettingsSeed(`${valid}${line}\n`);
        } catch (error) {
            rejected = error.message ===
                `legacy GSettings seed already contains ${key}`;
        }
        if (!rejected)
            {throw new Error(`legacy GSettings seed guard accepted ${key}`);}
    }
    process.stdout.write('legacy GSettings seed guard: all verdicts passed\n');
}
