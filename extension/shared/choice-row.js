import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {box, label} from './actor-utils.js';
import {requireCallback, requireId, requireText} from './presentation-validation.js';

/** @typedef {{id: string, title: string, value: string, accessibleName: string, onActivate: function}} ChoiceRowProps */
/** @param {ChoiceRowProps} props */
export function ChoiceRow({id, title, value, accessibleName, onActivate}) {
    requireId(id, 'Choice row');
    requireCallback(onActivate, 'Choice row activation');
    const row = box('cloudex-choice-row', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    row.add_child(label(title, 'cloudex-setting-title', {x_expand: true}));
    row.add_child(label(value, 'cloudex-choice-value'));
    const actor = new St.Button({name: id, style_class: 'cloudex-choice-button',
        can_focus: true, reactive: true, track_hover: true, child: row});
    actor.set_accessible_name(requireText(accessibleName,
        'Choice row accessible name'));
    actor.connect('clicked', onActivate);
    return actor;
}
