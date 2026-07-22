import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {dataStyle} from './actor-utils.js';
import {requireId, requirePercent, requireText} from './presentation-validation.js';
import {progressWidth} from './token-geometry.js';

const PACE_MARKER_WIDTH_PX = 2;

function markerFor(actor) {
    return actor.get_children().find(child =>
        child.get_name?.()?.startsWith('pace-')) ?? null;
}

export function setProgressBarPace(actor, pacePercent) {
    requirePercent(pacePercent, 'Time pace percentage');
    const marker = markerFor(actor);
    if (!marker)
        {throw new Error('Progress bar has no live Time pace marker');}
    marker.x = Math.max(0, Math.min(actor.width - marker.width,
        progressWidth(pacePercent, actor.width) - marker.width / 2));
}

/** @typedef {{metric: object, tokens: object}} ProgressBarProps */
/** @param {ProgressBarProps} props */
export function ProgressBar({metric, tokens}) {
    requireId(metric.id, 'Progress');
    requirePercent(metric.percent, 'Progress percentage');
    const width = tokens.size.progressWidth;
    const height = tokens.size.progressHeight;
    const actor = new St.Widget({name: `progress-${metric.id}`,
        style_class: 'cloudex-progress-track', layout_manager: new Clutter.FixedLayout(),
        width, height, accessible_role: Atk.Role.PROGRESS_BAR});
    actor.set_accessible_name(requireText(metric.accessibleName,
        'Progress accessible name'));
    const fillWidth = progressWidth(metric.percent, width);
    let fill = null;
    if (fillWidth > 0) {
        fill = new St.Widget({name: `progress-fill-${metric.id}`,
            style_class: 'cloudex-progress-fill',
            style: dataStyle(metric.dataRole, tokens), width: fillWidth, height, x: 0, y: 0});
        actor.add_child(fill);
    }
    if (metric.pacePercent !== undefined) {
        requirePercent(metric.pacePercent, 'Time pace percentage');
        if (!Number.isFinite(width) || width < PACE_MARKER_WIDTH_PX)
            {throw new Error('Time pace marker requires a track at least 2 pixels wide');}
        actor.add_child(new St.Widget({name: `pace-${metric.id}`,
            style: `background-color: ${tokens.color.foregroundPrimary};`,
            width: PACE_MARKER_WIDTH_PX, height, x: 0, y: 0,
            accessible_role: Atk.Role.REDUNDANT_OBJECT}));
        setProgressBarPace(actor, metric.pacePercent);
    }
    actor.connect('notify::width', () => {
        if (!Number.isFinite(actor.width) || actor.width <= 0)
            {return;}
        if (fill)
            {fill.width = progressWidth(metric.percent, actor.width);}
        if (metric.pacePercent !== undefined)
            {setProgressBarPace(actor, metric.pacePercent);}
    });
    return actor;
}
