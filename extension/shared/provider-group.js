import Clutter from 'gi://Clutter';

import {box, column, label, providerIcon} from './actor-utils.js';
import {requireId, requireText} from './presentation-validation.js';

/** @typedef {{model: object, tokens: object}} ProviderGroupProps */
/** @param {ProviderGroupProps} props */
export function ProviderGroup({model, tokens}) {
    requireId(model.id, 'Provider group');
    const actor = box('cloudex-provider-header', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    actor.add_child(providerIcon({path: model.iconPath, size: tokens.size.providerIcon,
        styleClass: 'cloudex-provider-icon', accessibleName: model.iconAccessibleName}));
    const copy = column('cloudex-provider-copy', {x_expand: true});
    copy.add_child(label(model.label, 'cloudex-provider-name'));
    if (model.detail !== undefined && model.detail !== null)
        {copy.add_child(label(requireText(model.detail, 'Provider detail'),
            'cloudex-provider-detail'));}
    actor.add_child(copy);
    return actor;
}
