import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {box, column, label} from './actor-utils.js';
import {
    requireDataRole,
    requireId,
    requirePercent,
    requireText,
    requireUniqueIds,
} from './presentation-validation.js';
import {colorToRgba} from './token-geometry.js';

const AXIS_LABELS = Object.freeze(['100%', '75%', '50%', '25%', '0%']);
const QUARTER_PERCENT = 25;
const HALF_PERCENT = 50;
const THREE_QUARTERS_PERCENT = 75;
const AXIS_VALUES = Object.freeze([
    0,
    QUARTER_PERCENT,
    HALF_PERCENT,
    THREE_QUARTERS_PERCENT,
    100,
]);
const CHART_INSET_PX = 5;
const LINE_INSET_PX = 1;

function validateSeriesItem(item, pointCount, tokens) {
    if (!Array.isArray(item.values) || item.values.length !== pointCount) {
        throw new Error('History series must have equal lengths');
    }
    item.values.forEach(value => requirePercent(value, 'History sample'));
    requireDataRole(item.dataRole, tokens);
    if (!Number.isFinite(item.strokeWidth) || item.strokeWidth <= 0) {
        throw new Error('History stroke width must be positive and finite');
    }
}

function validateSeries(series, tokens) {
    if (!Array.isArray(series) || series.length === 0) {
        throw new Error('History series must be nonempty');
    }
    requireUniqueIds(series, 'History series');
    const pointCount = series[0].values?.length;
    if (!Number.isInteger(pointCount) || pointCount < 2) {
        throw new Error('History series require at least two points');
    }
    for (const item of series) {
        validateSeriesItem(item, pointCount, tokens);
    }
}

/** @typedef {{id: string, series: object[], accessibleName: string, tokens: object}} HistoryChartProps */
/** @param {HistoryChartProps} props */
export function HistoryChart({id, series, accessibleName, tokens}) {
    requireId(id, 'History chart');
    requireText(accessibleName, 'History chart accessible name');
    validateSeries(series, tokens);
    const drawingSeries = series.map(item => ({...item, values: [...item.values]}));
    const frame = box('cloudex-chart-frame', Clutter.Orientation.HORIZONTAL,
        {x_expand: true});
    const chart = new St.DrawingArea({name: id, style_class: 'cloudex-chart',
        x_expand: true, x_align: Clutter.ActorAlign.FILL,
        height: tokens.size.chartHeight, accessible_role: Atk.Role.CHART});
    chart.set_accessible_name(accessibleName);
    chart.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        const bottom = height - CHART_INSET_PX;
        cr.setLineWidth(tokens.stroke.grid);
        cr.setSourceRGBA(...colorToRgba(tokens.color.grid));
        for (const value of AXIS_VALUES) {
            const y = bottom - value / 100 * (bottom - CHART_INSET_PX);
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }
        cr.stroke();
        for (const item of drawingSeries) {
            cr.setSourceRGBA(...colorToRgba(tokens.color[item.dataRole]));
            cr.setLineWidth(item.strokeWidth);
            item.values.forEach((value, index) => {
                const x = index * (width - 2) / (item.values.length - 1) + LINE_INSET_PX;
                const y = bottom - value / 100 * (bottom - CHART_INSET_PX);
                if (index === 0)
                    {cr.moveTo(x, y);}
                else
                    {cr.lineTo(x, y);}
            });
            cr.stroke();
        }
        cr.$dispose();
    });
    frame.add_child(chart);
    const axis = column('cloudex-chart-axis');
    AXIS_LABELS.forEach(value => axis.add_child(label(value,
        'cloudex-chart-axis-label', {y_expand: true})));
    frame.add_child(axis);
    return frame;
}
