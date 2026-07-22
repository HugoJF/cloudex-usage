import St from 'gi://St';

import {box, dataStyle, label} from './actor-utils.js';
import {requireUniqueIds} from './presentation-validation.js';

/** @typedef {{entries: object[], tokens: object}} LegendProps */
/** @param {LegendProps} props */
export function Legend({entries, tokens}) {
    requireUniqueIds(entries, 'Legend entry');
    const actor = box('cloudex-legend');
    for (const entry of entries) {
        const item = box('cloudex-legend-item');
        item.add_child(new St.Widget({style_class: 'cloudex-legend-dot',
            style: dataStyle(entry.dataRole, tokens), width: 8, height: 8}));
        item.add_child(label(entry.label, 'cloudex-legend-label'));
        actor.add_child(item);
    }
    return actor;
}
