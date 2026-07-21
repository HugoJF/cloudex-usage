import {column} from './actor-utils.js';
import {requireId} from './presentation-validation.js';

/** @typedef {{id: string, view: string, children: object[]}} PopoverScaffoldProps */
/** @param {PopoverScaffoldProps} props */
export function PopoverScaffold({id, view, children}) {
    requireId(id, 'Popover');
    requireId(view, 'Popover view');
    const actor = column(`claudex-popover claudex-${view}-view`, {name: id});
    for (const child of children)
        {actor.add_child(child);}
    return actor;
}
