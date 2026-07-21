const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9_./-]*$/;

export const DEFAULT_DATA_ROLES = Object.freeze([
    'dataClaudeShort',
    'dataClaudeWeekly',
    'dataCodexWeekly',
]);

export function requireId(value, name) {
    if (typeof value !== 'string' || !SAFE_ID.test(value)) {
        throw new Error(`${name} must be a safe ID`);
    }
    return value;
}

function requireText(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${name} must be nonempty text`);
    }
    return value;
}

export function requireCallback(value, name) {
    if (typeof value !== 'function') {
        throw new Error(`${name} must be a callback`);
    }
    return value;
}

function requirePositiveSafeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
    }
    return value;
}

function requirePath(value, name) {
    if (typeof value !== 'string' || !SAFE_PATH.test(value)) {
        throw new Error(`${name} must be a safe package-relative path`);
    }
    return value;
}

function frozen(value) {
    return Object.freeze(value);
}

function snapshotWindow(window, dataRoles, ids, read) {
    if (!window || typeof window !== 'object') {
        throw new Error('Provider window must be an object');
    }
    const id = requireId(read(() => window.id), 'Provider window ID');
    if (ids.has(id)) {
        throw new Error('Provider window IDs must be unique');
    }
    ids.add(id);
    const dataRole = read(() => window.dataRole);
    if (!dataRoles.includes(dataRole)) {
        throw new Error('Provider window dataRole must be token-backed');
    }
    const snapshot = {
        id,
        label: requireText(read(() => window.label), 'Provider window label'),
        dataRole,
    };
    const durationMs = read(() => window.durationMs);
    if (durationMs !== undefined) {
        snapshot.durationMs = requirePositiveSafeInteger(durationMs,
            'Provider window duration');
    }
    return frozen(snapshot);
}

function snapshotMarks(marks, read) {
    if (!marks || typeof marks !== 'object') {
        throw new Error('Provider marks are required');
    }
    return frozen({
        darkPanel: requirePath(read(() => marks.darkPanel), 'Dark panel mark'),
        lightPanel: requirePath(read(() => marks.lightPanel), 'Light panel mark'),
        popup: requirePath(read(() => marks.popup), 'Popup mark'),
        accessibleName: requireText(read(() => marks.accessibleName),
            'Provider mark accessible name'),
    });
}

export function snapshotPresentation(provider, dataRoles, id, read) {
    const order = read(() => provider.order);
    if (!Number.isInteger(order) || order < 0) {
        throw new Error('Provider order must be a non-negative integer');
    }
    const windows = read(() => provider.windows);
    if (!Array.isArray(windows) || read(() => windows.length) === 0) {
        throw new Error('Provider windows must be nonempty');
    }
    const ids = new Set();
    const snapshots = windows.map(window =>
        snapshotWindow(read(() => window), dataRoles, ids, read));
    return frozen({
        id,
        order,
        label: requireText(read(() => provider.label), 'Provider label'),
        detail: requireText(read(() => provider.detail), 'Provider detail'),
        marks: snapshotMarks(read(() => provider.marks), read),
        windows: frozen(snapshots),
    });
}

function snapshotReading(reading, seen) {
    if (!reading || typeof reading !== 'object' ||
        typeof reading.id !== 'string' || seen.has(reading.id) ||
        !Number.isFinite(reading.percent) || reading.percent < 0 ||
        reading.percent > 100 || !Number.isSafeInteger(reading.resetAtMs) ||
        reading.resetAtMs < 0) {
        return null;
    }
    const snapshot = frozen({
        id: reading.id,
        percent: reading.percent,
        resetAtMs: reading.resetAtMs,
    });
    seen.set(reading.id, snapshot);
    return snapshot;
}

export function validateResult(result, windows) {
    if (!result || typeof result !== 'object') {
        return null;
    }
    if (result.status === 'unavailable') {
        return Object.keys(result).length === 1
            ? frozen({status: 'unavailable'})
            : null;
    }
    if (result.status !== 'available' || !Array.isArray(result.readings) ||
        result.readings.length !== windows.length) {
        return null;
    }
    const byId = new Map();
    if (result.readings.some(reading => snapshotReading(reading, byId) === null)) {
        return null;
    }
    const readings = windows.map(window => byId.get(window.id));
    if (readings.some(reading => reading === undefined)) {
        return null;
    }
    return frozen({status: 'available', readings: frozen(readings)});
}
