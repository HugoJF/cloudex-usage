import {colorToRgba} from './token-geometry.js';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function requireId(id, context) {
    if (typeof id !== 'string' || !SAFE_ID.test(id))
        {throw new Error(`${context} id must be safe`);}
    return id;
}

export function requireText(value, context) {
    if (typeof value !== 'string' || value.length === 0)
        {throw new Error(`${context} must be nonempty text`);}
    return value;
}

export function requireCallback(value, context) {
    if (typeof value !== 'function')
        {throw new Error(`${context} must be a callback`);}
    return value;
}

export function requirePercent(value, context) {
    if (!Number.isFinite(value) || value < 0 || value > 100)
        {throw new Error(`${context} must be a finite percentage from 0 to 100`);}
    return value;
}

export function requireUniqueIds(items, context) {
    const ids = new Set();
    for (const item of items) {
        requireId(item.id, context);
        if (ids.has(item.id))
            {throw new Error(`${context} ids must be unique`);}
        ids.add(item.id);
    }
}

export function requireDataRole(dataRole, tokens) {
    requireId(dataRole, 'Data role');
    const color = tokens?.color?.[dataRole];
    if (typeof color !== 'string')
        {throw new Error(`Unknown data role: ${dataRole}`);}
    colorToRgba(color);
    return color;
}
