import Clutter from 'gi://Clutter';

import {box, button, label} from './actor-utils.js';
import {requireText} from './presentation-validation.js';

/** @typedef {{status: string, action?: object|null}} FooterStatusProps */
/** @param {FooterStatusProps} props */
export function FooterStatus({status, action = null}) {
    const actor = box('claudex-footer', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    actor.add_child(label(requireText(status, 'Footer status'), 'claudex-updated',
        {name: 'footer-status', x_expand: true}));
    if (action !== null) {
        if (!action || typeof action !== 'object')
            {throw new Error('Footer action must be an object');}
        actor.add_child(button({id: action.id, text: action.label,
            styleClass: 'claudex-text-button', accessibleName: action.accessibleName,
            onActivate: action.onActivate}));
    }
    return actor;
}
