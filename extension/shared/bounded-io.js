import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

export function closeStream(stream) {
    try { stream?.close(null); } catch {}
}

function joinChunks(chunks, total) {
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export function decodeUtf8(bytes) {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

export async function readBounded(stream, limit, cancellable) {
    const chunks = [];
    let total = 0;
    while (true) {
        const bytes = await stream.read_bytes_async(
            Math.min(8192, limit - total + 1),
            GLib.PRIORITY_DEFAULT, cancellable);
        const size = bytes.get_size();
        if (size === 0)
            break;
        total += size;
        if (total > limit)
            throw new Error('Input exceeds its byte limit');
        chunks.push(bytes.get_data());
    }
    return joinChunks(chunks, total);
}

export function readBoundedFile(file, limit) {
    const info = file.query_info('standard::type',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (info.get_file_type() !== Gio.FileType.REGULAR)
        throw new Error('Input must be a regular file');
    const stream = file.read(null);
    try {
        const chunks = [];
        let total = 0;
        while (true) {
            const bytes = stream.read_bytes(limit - total + 1, null);
            const size = bytes.get_size();
            if (size === 0)
                break;
            total += size;
            if (total > limit)
                throw new Error('Input exceeds its byte limit');
            chunks.push(bytes.get_data());
        }
        return joinChunks(chunks, total);
    } finally {
        closeStream(stream);
    }
}
