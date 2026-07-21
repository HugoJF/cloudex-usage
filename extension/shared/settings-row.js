import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {box, column, label} from './actor-utils.js';
import {requireCallback, requireId, requireText} from './presentation-validation.js';
import {Switch} from './switch.js';

/** @typedef {{id: string, title: string, description: string, accessibleName: string, active: boolean, onToggle: function, tokens: object}} SettingsRowProps */
/** @param {SettingsRowProps} props */
export function SettingsRow({id, title, description, accessibleName, active,
    onToggle, tokens}) {
    requireId(id, 'Settings row');
    requireCallback(onToggle, 'Settings row activation');
    const row = box('claudex-setting-row', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    const copy = column('claudex-setting-copy', {x_expand: true});
    copy.add_child(label(title, 'claudex-setting-title'));
    copy.add_child(label(description, 'claudex-setting-description'));
    row.add_child(copy);
    row.add_child(Switch({active, tokens}));
    const actor = new St.Button({name: `toggle-${id}`,
        style_class: 'claudex-setting-button', can_focus: true, reactive: true,
        track_hover: true, toggle_mode: true, checked: active, child: row,
        accessible_role: Atk.Role.SWITCH});
    actor.set_accessible_name(requireText(accessibleName,
        'Settings row accessible name'));
    actor.connect('clicked', () => onToggle(id));
    return actor;
}
