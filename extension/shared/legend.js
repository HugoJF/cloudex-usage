import St from 'gi://St';

import {box, dataStyle, label} from './actor-utils.js';
import {requireUniqueIds} from './presentation-validation.js';

/** @typedef {{entries: object[], tokens: object}} LegendProps */
/** @param {LegendProps} props */
export function Legend({entries, tokens}) {
    requireUniqueIds(entries, 'Legend entry');
    const actor = box('claudex-legend');
    for (const entry of entries) {
        const item = box('claudex-legend-item');
        item.add_child(new St.Widget({style_class: 'claudex-legend-dot',
            style: dataStyle(entry.dataRole, tokens), width: 8, height: 8}));
        item.add_child(label(entry.label, 'claudex-legend-label'));
        actor.add_child(item);
    }
    return actor;
}
