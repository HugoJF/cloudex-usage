import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {decodeUtf8, readBoundedFile} from './bounded-io.js';

const COMM_MAX_BYTES = 64;

function processMatches(procRoot, name, processName) {
    const comm = Gio.File.new_for_path(GLib.build_filenamev(
        [procRoot, name, 'comm']));
    try {
        return decodeUtf8(readBoundedFile(comm, COMM_MAX_BYTES)) ===
            `${processName}\n`;
    } catch (_) {
        return false;
    }
}

export function hasExactProcess(procRoot, currentUser, processName) {
    let enumerator = null;
    try {
        enumerator = Gio.File.new_for_path(procRoot).enumerate_children(
            'standard::name,owner::user', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!/^[0-9]+$/.test(name) ||
                info.get_attribute_string('owner::user') !== currentUser)
                {continue;}
            if (processMatches(procRoot, name, processName)) {
                return true;
            }
        }
    } catch {
        return false;
    } finally {
        try {
            enumerator?.close(null);
        } catch (_) {
            // Cleanup is best effort after traversal.
        }
    }
    return false;
}
