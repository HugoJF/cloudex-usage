import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const REQUEST_TIMEOUT_SECONDS = 15;

Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish');

export class SoupTransport {
    constructor() {
        this._session = new Soup.Session({timeout: REQUEST_TIMEOUT_SECONDS});
    }

    async send(message, cancellable) {
        const stream = await this._session.send_async(message,
            GLib.PRIORITY_DEFAULT, cancellable);
        return {statusCode: message.status_code, stream};
    }

    abort() {
        this._session.abort();
    }
}
