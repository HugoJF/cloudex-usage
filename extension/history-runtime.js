import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    deserializeStore,
    emptyStore,
    hasSamples,
    recordSample,
    seriesForRange,
    serializeStore,
} from './history-store.js';

const OPTION_KEYS = new Set(['dir', 'now']);
const FILE_NAME = 'history.json';
const KIBIBYTE_BYTES = 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
export const HISTORY_FILE_MAX_BYTES = KIBIBYTE_BYTES * KIBIBYTE_BYTES;

function decode(bytes) {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

function close(stream) {
    try {
        stream?.close(null);
    } catch (_) {
        // Cleanup is best effort after the owning operation.
    }
}

function readHistoryFile(path) {
    const file = Gio.File.new_for_path(path);
    const info = file.query_info('standard::type',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (info.get_file_type() !== Gio.FileType.REGULAR)
        {throw new Error('History input must be a regular file');}
    const stream = file.read(null);
    try {
        const chunks = [];
        let total = 0;
        while (true) {
            const bytes = stream.read_bytes(HISTORY_FILE_MAX_BYTES - total + 1, null);
            const size = bytes.get_size();
            if (size === 0)
                {break;}
            total += size;
            if (total > HISTORY_FILE_MAX_BYTES)
                {throw new Error('History input exceeds its byte limit');}
            chunks.push(bytes.get_data());
        }
        const result = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    } finally {
        close(stream);
    }
}

function requireRecord(value) {
    if (value === undefined)
        {return {};}
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        {throw new Error('History runtime options must be an object');}
    if (Object.keys(value).some(key => !OPTION_KEYS.has(key)))
        {throw new Error('Unknown History runtime option');}
    return value;
}

function nextRecordTime(observed, previous) {
    if (!Number.isSafeInteger(observed) || observed < 0)
        {return null;}
    if (observed !== previous)
        {return observed;}
    return observed === Number.MAX_SAFE_INTEGER ? null : observed + 1;
}

export class HistoryRuntime {
    constructor(options) {
        options = requireRecord(options);
        const inheritedDir = GLib.getenv('CLAUDEX_HISTORY_DIR');
        if (options.dir !== undefined) {
            if (typeof options.dir !== 'string' || !GLib.path_is_absolute(options.dir))
                {throw new Error('History runtime dir must be an absolute path');}
            this._dir = options.dir;
        } else if (inheritedDir !== null && GLib.path_is_absolute(inheritedDir)) {
            this._dir = inheritedDir;
        } else {
            this._dir = GLib.build_filenamev([GLib.get_user_data_dir(), 'claudex-usage']);
        }
        if (options.now !== undefined && typeof options.now !== 'function')
            {throw new Error('History runtime now must be a function');}
        this._now = options.now ?? (() => Date.now());
        this._path = GLib.build_filenamev([this._dir, FILE_NAME]);
        this._store = this._load();
        this._lastRecordAtMs = null;
    }

    record(samples) {
        if (!Array.isArray(samples) || samples.length === 0)
            {return;}
        const atMs = nextRecordTime(this._now(), this._lastRecordAtMs);
        if (atMs === null)
            {return;}
        let changed = false;
        for (const sample of samples)
            {changed = this._recordOne(sample, atMs) || changed;}
        if (changed) {
            this._lastRecordAtMs = atMs;
            this._persist();
        }
    }

    _recordOne(sample, atMs) {
        if (!sample || typeof sample !== 'object')
            {return false;}
        const next = recordSample(this._store, {
            providerId: sample.providerId,
            windowId: sample.windowId,
            percent: sample.percent,
            atMs,
        });
        if (next === this._store)
            {return false;}
        this._store = next;
        return true;
    }

    series(rangeId) {
        return seriesForRange(this._store, rangeId, this._now());
    }

    hasSamples() {
        return hasSamples(this._store);
    }

    _load() {
        try {
            const bytes = readHistoryFile(this._path);
            return deserializeStore(JSON.parse(decode(bytes)));
        } catch {
            return emptyStore();
        }
    }

    _persist() {
        try {
            GLib.mkdir_with_parents(this._dir, PRIVATE_DIRECTORY_MODE);
            GLib.file_set_contents(this._path,
                JSON.stringify(serializeStore(this._store)));
        } catch (_) {
            // Persistence failure must not disrupt the live surface.
        }
    }
}
