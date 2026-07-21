import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createClaudeProvider, ClaudeRuntime} from '../../extension/claude-runtime.js';

const SHORT_RESET = '2026-07-17T22:30:00Z';
const WEEKLY_RESET = '2026-07-23T23:00:00Z';
const SHORT_MS = Date.UTC(2026, 6, 17, 22, 30, 0);
const WEEKLY_MS = Date.UTC(2026, 6, 23, 23, 0, 0);

function assert(value, message) {
    if (!value) {throw new Error(message);}
}
function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function throws(callback) {
    try { callback(); } catch { return; }
    throw new Error('expected rejection');
}
function write(path, value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    Gio.File.new_for_path(path).replace_contents(bytes, null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}
function removeTree(path) {
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        {return;}
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) ===
        Gio.FileType.DIRECTORY) {
        const entries = file.enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info;
        while ((info = entries.next_file(null)))
            {removeTree(GLib.build_filenamev([path, info.get_name()]));}
        entries.close(null);
    }
    file.delete(null);
}
function input(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes));
}
function usage(short = 5, weekly = 17) {
    return JSON.stringify({
        five_hour: {utilization: short, resets_at: SHORT_RESET},
        seven_day: {utilization: weekly, resets_at: WEEKLY_RESET},
        limits: [{kind: 'weekly_scoped', percent: 99, scope: {model: {display_name: 'Opus'}}}],
    });
}
function reading(short, weekly) {
    return {status: 'available', readings: [
        {id: 'short', percent: short, resetAtMs: SHORT_MS},
        {id: 'weekly', percent: weekly, resetAtMs: WEEKLY_MS},
    ]};
}

class Session {
    constructor(responses = []) {
        this.responses = responses; this.requests = [];
    }
    async send(message, cancellable) {
        this.requests.push({message, method: message.method,
            path: message.get_uri().get_path(),
            auth: message.request_headers.get_one('Authorization'),
            beta: message.request_headers.get_one('anthropic-beta')});
        const response = this.responses.shift() ?? {};
        if (response.pending)
            {return await new Promise((_resolve, reject) =>
                cancellable.connect(() => reject(new Error('cancelled'))));}
        return {statusCode: response.status ?? 200,
            stream: input(response.body ?? usage())};
    }
    abort() {}
}
const root = GLib.dir_make_tmp('claudex-claude-unit-XXXXXX');
const procRoot = GLib.build_filenamev([root, 'proc']);
const configHome = GLib.build_filenamev([root, 'home']);
const processPath = GLib.build_filenamev([procRoot, '123']);
const credPath = GLib.build_filenamev([configHome, '.credentials.json']);
GLib.mkdir_with_parents(procRoot, 0o700);
GLib.mkdir_with_parents(configHome, 0o700);
function process(name = 'claude') {
    GLib.mkdir_with_parents(processPath, 0o700);
    write(GLib.build_filenamev([processPath, 'comm']), `${name}\n`);
}
function auth(token = 'fixture-token') {
    write(credPath, JSON.stringify({claudeAiOauth: {accessToken: token}}));
}
function runtime(session = new Session(), extra = {}) {
    return new ClaudeRuntime({procRoot, configHome,
        currentUser: GLib.get_user_name(), endpoint: 'http://127.0.0.1:19876/usage',
        schedule: () => 1, cancel: () => {}, session, ...extra});
}
async function idleUntil(callback) {
    while (!callback())
        {await new Promise(resolve => GLib.idle_add(0, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }));}
}
let passed = 0;
async function test(name, callback) {
    await callback(); print(`ok ${++passed} - ${name}`);
}
try {
    await test('provider and runtime reject malformed public boundaries', async () => {
        let listener;
        let cancelled = 0;
        const source = {isPresent: () => true,
            subscribePresence: callback => (listener = callback, () => {}),
            refreshUsage: async () => ({status: 'unavailable'}),
            cancelRefresh: () => cancelled++};
        const provider = createClaudeProvider(source);
        assert(Object.isFrozen(provider) && provider.id === 'claude' &&
            provider.order === 0 &&
            provider.windows[0].dataRole === 'dataClaudeShort' &&
            provider.windows[0].durationMs === 18_000_000 &&
            provider.windows[1].dataRole === 'dataClaudeWeekly' &&
            provider.windows[1].durationMs === 604_800_000 &&
            Object.isFrozen(provider.windows[0]) &&
            Object.isFrozen(provider.windows[1]), 'metadata');
        let observed;
        provider.subscribeEligibility(value => observed = value);
        listener('invalid');
        assert(observed === false && cancelled === 1, 'eligibility');
        equal(await provider.refresh(), {status: 'unavailable'}, 'refresh');
        throws(() => createClaudeProvider({}));
        for (const options of [null, {unknown: true}, {procRoot: 'relative'},
            {configHome: ''}, {currentUser: ''}, {endpoint: 'file:///tmp/x'},
            {presenceIntervalMs: 0}, {authMaxBytes: 1.5},
            {responseMaxBytes: '8'}, {schedule: () => 1},
            {session: {send() {}}}])
            {throws(() => new ClaudeRuntime(options));}
    });

    await test('presence is exact, current-user, change-only, and disposable', () => {
        process();
        let tick;
        let cancels = 0;
        const instance = runtime(new Session(), {
            schedule: callback => (tick = callback, 7),
            cancel: () => cancels++,
        });
        const changes = [];
        const unsubscribe = instance.subscribePresence(value => changes.push(value));
        tick();
        removeTree(processPath); tick();
        process(); tick();
        equal(changes, [false, true], 'changes');
        unsubscribe(); unsubscribe(); instance.dispose();
        assert(cancels === 1, 'unsubscribe');
        const wrongOwner = runtime(new Session(), {currentUser: 'other-user'});
        assert(!wrongOwner.isPresent(), 'owner'); wrongOwner.dispose();
        process('claude-helper');
        const wrongName = runtime();
        assert(!wrongName.isPresent(), 'comm'); wrongName.dispose();
        removeTree(processPath); process(' claude ');
        const paddedName = runtime();
        assert(!paddedName.isPresent(), 'comm whitespace'); paddedName.dispose();
        removeTree(processPath); process('x'.repeat(65));
        const oversizedName = runtime();
        assert(!oversizedName.isPresent(), 'comm ceiling'); oversizedName.dispose();
        removeTree(processPath);
    });

    await test('refresh rereads auth, sends the beta header, and clears secrets', async () => {
        process(); auth('first-token');
        const session = new Session([{body: usage(5, 17)},
            {body: usage(62, 88)}, {status: 302}]);
        const instance = runtime(session);
        equal(await instance.refreshUsage(), reading(5, 17), 'first');
        auth('rotated-token');
        equal(await instance.refreshUsage(), reading(62, 88), 'rotated');
        equal(await instance.refreshUsage(), {status: 'unavailable'}, 'status');
        equal(session.requests.map(item => [item.method, item.path, item.auth, item.beta]), [
            ['GET', '/usage', 'Bearer first-token', 'oauth-2025-04-20'],
            ['GET', '/usage', 'Bearer rotated-token', 'oauth-2025-04-20'],
            ['GET', '/usage', 'Bearer rotated-token', 'oauth-2025-04-20']], 'request');
        assert(session.requests.every(item =>
            item.message.request_headers.get_one('Authorization') === null), 'cleanup');
        instance.dispose(); removeTree(processPath);
    });

    await test('fatal UTF-8 and ingress ceilings fail closed', async () => {
        process();
        write(credPath, new Uint8Array([
            ...new TextEncoder().encode('{"claudeAiOauth":{"accessToken":"bad'),
            0xff, 34, 125, 125]));
        let session = new Session();
        let instance = runtime(session);
        equal(await instance.refreshUsage(), {status: 'unavailable'}, 'auth UTF-8');
        assert(session.requests.length === 0, 'auth transmission'); instance.dispose();
        auth();
        for (const [options, body] of [[{}, new Uint8Array([0xff])],
            [{responseMaxBytes: 8}, usage()]]) {
            instance = runtime(new Session([{body}]), options);
            equal(await instance.refreshUsage(), {status: 'unavailable'}, 'response');
            instance.dispose();
        }
        session = new Session(); instance = runtime(session, {authMaxBytes: 8});
        equal(await instance.refreshUsage(), {status: 'unavailable'}, 'auth ceiling');
        assert(session.requests.length === 0, 'ceiling transmission');
        instance.dispose(); removeTree(processPath);
    });

    await test('stale cancellation cannot clear a reeligible attempt', async () => {
        process(); auth();
        const session = new Session([{pending: true}, {body: usage(61, 73)}]);
        const instance = runtime(session);
        const stale = instance.refreshUsage();
        await idleUntil(() => session.requests.length === 1);
        instance.cancelRefresh(); removeTree(processPath); instance._pollPresence();
        assert(session.requests[0].message.request_headers
            .get_one('Authorization') === null, 'immediate cancellation cleanup');
        process(); instance._pollPresence();
        const current = instance.refreshUsage();
        equal(await stale, {status: 'unavailable'}, 'cancelled');
        equal(await current, reading(61, 73), 'current');
        instance.dispose(); removeTree(processPath);
    });
} finally {
    removeTree(root);
}
print(`Claude adapter unit suite: ${passed} passed`);
