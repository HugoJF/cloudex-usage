import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {requireCallback, requireId, requireText} from './presentation-validation.js';

/** @typedef {{id: string, iconName: string, accessibleName: string, onActivate: function, tokens: object, busy?: boolean}} IconButtonProps */
/** @param {IconButtonProps} props */
export function IconButton({id, iconName, accessibleName, onActivate, tokens,
    busy = false}) {
    requireId(id, 'Icon button');
    requireCallback(onActivate, 'Icon button activation');
    if (typeof busy !== 'boolean')
        {throw new Error('Icon button busy state must be boolean');}
    const actor = new St.Button({name: id,
        style_class: `claudex-icon-button${busy ? ' busy' : ''}`, can_focus: true,
        reactive: true, track_hover: true, y_align: Clutter.ActorAlign.CENTER,
        y_expand: false, child: new St.Icon({icon_name: requireText(iconName,
            'Symbolic icon'), icon_size: tokens.size.settingsIcon})});
    actor.set_accessible_name(requireText(accessibleName,
        'Icon button accessible name'));
    if (busy)
        {actor.add_accessible_state(Atk.StateType.BUSY);}
    actor.connect('clicked', onActivate);
    return actor;
}
