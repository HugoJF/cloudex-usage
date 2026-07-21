import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {box, label, providerIcon} from './actor-utils.js';
import {requireId, requirePercent, requireText, requireUniqueIds} from './presentation-validation.js';

function requireTone(tone) {
    if (tone !== 'normal' && tone !== 'muted')
        {throw new Error('Panel value tone must be normal or muted');}
    return tone;
}

/** @typedef {{id: string, groups: object[], emptyGroups?: object[], tokens: object}} PanelIndicatorProps */
/** @param {PanelIndicatorProps} props */
export function PanelIndicator({id, groups, emptyGroups = [], tokens}) {
    requireId(id, 'Panel indicator');
    requireUniqueIds(groups, 'Panel group');
    requireUniqueIds(emptyGroups, 'Empty panel group');
    const actor = box('claudex-panel',
        Clutter.Orientation.HORIZONTAL, {name: id});
    const rendered = groups.length > 0 ? groups : emptyGroups;
    rendered.forEach((group, index) => {
        requireText(group.accessibleName, 'Panel group accessible name');
        requireText(group.iconPath, 'Panel group icon path');
        requireUniqueIds(group.values ?? [], 'Panel value');
        if (index > 0)
            {actor.add_child(new St.Widget({style_class: 'claudex-panel-provider-divider',
                width: 1, height: 12}));}
        const item = box('claudex-panel-provider');
        const values = group.values ?? [];
        item.add_child(providerIcon({path: group.iconPath,
            size: tokens.size.panelProviderIcon,
            styleClass: `claudex-panel-provider-icon${values.length === 0 ? ' muted' : ''}`,
            accessibleName: group.accessibleName}));
        values.forEach((value, valueIndex) => {
            requirePercent(value.percent, `Panel value ${value.id}`);
            if (valueIndex > 0)
                {item.add_child(label('·', 'claudex-panel-value-separator'));}
            const tone = requireTone(value.tone ?? 'normal');
            const muted = tone === 'muted' ? ' muted' : '';
            const valueActor = label(`${value.percent}%`, `claudex-panel-value${muted}`,
                {name: `panel-value-${group.id}--${value.id}`});
            valueActor.set_accessible_name(value.accessibleName ?? `${value.percent} percent`);
            item.add_child(valueActor);
        });
        actor.add_child(item);
    });
    return actor;
}
