import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {HistoryChart} from './shared/history-chart.js';
import {HistoryRangeStepper} from './shared/history-range-stepper.js';
import {HISTORY_RANGES} from './shared/history-ranges.js';
import {Legend} from './shared/legend.js';

const SERIES_META = Object.freeze({
    'claude:short': {dataRole: 'dataClaudeShort', stroke: 'claudeShort',
        label: 'Claude 5-hour'},
    'claude:weekly': {dataRole: 'dataClaudeWeekly', stroke: 'weekly',
        label: 'Claude weekly'},
    'codex:weekly': {dataRole: 'dataCodexWeekly', stroke: 'weekly',
        label: 'Codex weekly'},
});

function column(styleClass, name) {
    return new St.BoxLayout({
        name,
        style_class: styleClass,
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
}

function seriesKey(item) {
    return `${item.providerId}:${item.windowId}`;
}

function chartSeries(items, tokens) {
    return items.map(item => ({
        id: `${item.providerId}-${item.windowId}`,
        values: item.values,
        dataRole: SERIES_META[seriesKey(item)].dataRole,
        strokeWidth: tokens.stroke[SERIES_META[seriesKey(item)].stroke],
    }));
}

function legendEntries(items) {
    return items.map(item => ({
        id: `${item.providerId}-${item.windowId}`,
        label: SERIES_META[seriesKey(item)].label,
        dataRole: SERIES_META[seriesKey(item)].dataRole,
    }));
}

export function buildHistoryView({preferences, history, displayPercent, tokens,
    onSelectRange}) {
    if (!preferences.localHistory || !history?.hasSamples())
        {return null;}
    const range = preferences.historyRange;
    const sourceSeries = history.series(range.id)
        .filter(item => SERIES_META[seriesKey(item)]);
    const displayedSeries = sourceSeries.map(item => ({
        ...item,
        values: item.values.map(displayPercent),
    }));
    const section = column('claudex-history', 'history-section');
    const head = new St.BoxLayout({
        style_class: 'claudex-history-header',
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
    });
    head.add_child(new St.Label({
        text: 'Usage history',
        style_class: 'claudex-section-title',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    }));
    head.add_child(HistoryRangeStepper({
        choices: HISTORY_RANGES,
        selected: range,
        onSelect: onSelectRange,
    }));
    section.add_child(head);
    if (sourceSeries.length === 0) {
        section.add_child(new St.Label({
            name: 'history-empty',
            text: `Not enough history for the ${range.label} range yet`,
            style_class: 'claudex-provider-detail',
        }));
        return section;
    }
    section.add_child(HistoryChart({
        id: 'history-chart',
        accessibleName: `Usage history for ${range.label}, percentage ` +
            `${preferences.usageDisplay.id}, from zero to one hundred percent`,
        series: chartSeries(displayedSeries, tokens),
        tokens,
    }));
    section.add_child(Legend({entries: legendEntries(displayedSeries), tokens}));
    return section;
}
