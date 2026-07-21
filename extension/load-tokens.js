import Gio from 'gi://Gio';

import {validateTokens} from './shared/token-geometry.js';

export function loadTokens(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/tokens.json`);
    const [loaded, contents] = file.load_contents(null);
    if (!loaded)
        {throw new Error('Unable to load packaged design tokens');}
    return validateTokens(JSON.parse(new TextDecoder().decode(contents)));
}
