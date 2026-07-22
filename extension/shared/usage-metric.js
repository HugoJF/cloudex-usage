import Clutter from 'gi://Clutter';

import {box, column, label} from './actor-utils.js';
import {ProgressBar} from './progress-bar.js';

/** @typedef {{metric: object, tokens: object}} UsageMetricProps */
/** @param {UsageMetricProps} props */
export function UsageMetric({metric, tokens}) {
    const actor = column('cloudex-metric', {x_expand: true});
    const top = box('cloudex-metric-top', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    top.add_child(label(metric.label, 'cloudex-window', {x_expand: true}));
    top.add_child(label(`${metric.percent}%`, 'cloudex-percent'));
    actor.add_child(top);
    actor.add_child(ProgressBar({metric, tokens}));
    actor.add_child(label(metric.resetLabel, 'cloudex-reset',
        {name: `reset-label-${metric.id}`}));
    return actor;
}
