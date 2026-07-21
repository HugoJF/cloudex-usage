import {closeStream} from './bounded-io.js';

export function cancelRequest(attempt) {
    attempt?.message?.request_headers.remove('Authorization');
    attempt?.cancellable.cancel();
}

export function cleanupRequest(attempt) {
    attempt.message?.request_headers.remove('Authorization');
    closeStream(attempt.stream);
    attempt.message = null;
    attempt.stream = null;
}
