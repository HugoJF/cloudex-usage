import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {PopoverScaffold} from './shared/popover-scaffold.js';
import {setProgressBarPace} from './shared/progress-bar.js';
import {
    displayPercent,
    isPreferenceKey,
    readPanelPreferences,
} from './panel-preferences.js';
import {createCodexProvider, CodexRuntime} from './codex-runtime.js';
import {createClaudeProvider, ClaudeRuntime} from './claude-runtime.js';
import {HistoryRuntime} from './history-runtime.js';
import {findActor, replaceChild} from './shared/actor-utils.js';
import {SurfaceController} from './surface-controller.js';
import {nextMinuteDelay} from './temporal.js';
import {buildPanelView} from './panel-view.js';
import {buildHistoryView} from './history-view.js';
import {buildSettingsView} from './settings-view.js';
import {buildUsageView, displayUsageMetric} from './usage-view.js';
import {loadTokens} from './load-tokens.js';

export default class CloudexUsageExtension extends Extension {
    _requireController() {
        if (!this._controller) {
            throw new Error('extension is not enabled');
        }
        return this._controller;
    }

    enable() {
        this._tokens = loadTokens(this.path);
        this._settings = this.getSettings();
        this._preferences = readPanelPreferences(this._settings);
        this._now = () => Date.now();
        this._presentationSourceId = null;
        this._menuOpenChangedId = null;
        this._view = 'usage';
        this._wasRefreshing = false;
        this._historyRangeFocusId = null;
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (!isPreferenceKey(key))
                {return;}
            const previous = this._preferences.refreshInterval.ms;
            this._preferences = readPanelPreferences(this._settings);
            if (previous !== this._preferences.refreshInterval.ms)
                {this._controller?.setRefreshIntervalMs(this._preferences.refreshInterval.ms);}
            this._render();
        });
        this._colorSchemeChangedId = St.Settings.get().connect(
            'notify::color-scheme', () => this._render());
        this._controller = new SurfaceController({
            now: () => this._now(),
            schedule: (callback, delay) => GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                delay, () => {
                    callback();
                    return GLib.SOURCE_REMOVE;
                }),
            cancel: sourceId => GLib.Source.remove(sourceId),
            onChange: () => this._render(),
            refreshIntervalMs: this._preferences.refreshInterval.ms,
        });
        const codex = this._startProvider(() => new CodexRuntime(), createCodexProvider);
        this._codexRuntime = codex.runtime;
        this._unregisterCodex = codex.unregister;
        const claude = this._startProvider(() => new ClaudeRuntime(),
            createClaudeProvider);
        this._claudeRuntime = claude.runtime;
        this._unregisterClaude = claude.unregister;
        try {
            this._history = new HistoryRuntime();
        } catch {
            this._history = null;
        }
        this._render();
    }

    _startProvider(create, wrap) {
        let runtime = null;
        try {
            runtime = create();
            const unregister = this.registerProvider(wrap(runtime));
            return {runtime, unregister};
        } catch {
            runtime?.dispose();
            return {runtime: null, unregister: null};
        }
    }

    registerProvider(provider) {
        return this._requireController().registerProvider(provider);
    }

    refresh() {
        this._requireController().refresh();
    }

    getSurfaceSnapshot() {
        return {
            ...this._requireController().getSnapshot(),
            view: this._view,
            preferences: this._preferences,
        };
    }

    disable() {
        if (this._colorSchemeChangedId) {
            St.Settings.get().disconnect(this._colorSchemeChangedId);
            this._colorSchemeChangedId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._unregisterCodex?.();
        this._unregisterCodex = null;
        this._codexRuntime?.dispose();
        this._codexRuntime = null;
        this._unregisterClaude?.();
        this._unregisterClaude = null;
        this._claudeRuntime?.dispose();
        this._claudeRuntime = null;
        this._history = null;
        this._controller?.dispose();
        this._controller = null;
        this._destroyIndicator();
        this._tokens = null;
        this._settings = null;
        this._preferences = null;
        this._view = null;
        this._now = null;
        this._historyRangeFocusId = null;
    }

    _recordHistory(snapshot) {
        const justCompleted = this._wasRefreshing && !snapshot.refreshing;
        this._wasRefreshing = snapshot.refreshing;
        if (!justCompleted || !snapshot.clockValid ||
            !this._preferences.localHistory || !this._history)
            {return;}
        const samples = [];
        for (const provider of snapshot.providers) {
            if (provider.availability !== 'available')
                {continue;}
            for (const metric of provider.metrics)
                {samples.push({providerId: provider.id, windowId: metric.windowId,
                    percent: metric.percent});}
        }
        this._history.record(samples);
    }

    _render() {
        if (!this._controller || !this._tokens)
            {return;}
        const snapshot = this._controller.getSnapshot();
        this._recordHistory(snapshot);
        if (!snapshot.visible) {
            this._destroyIndicator();
            return;
        }
        this._ensureIndicator();
        replaceChild(this._panelHost, buildPanelView({
            snapshot,
            preferences: this._preferences,
            extensionPath: this.path,
            light: Main.sessionMode.colorScheme === 'prefer-light',
            displayPercent: percent => this._displayPercent(percent),
            tokens: this._tokens,
        }));
        const history = buildHistoryView({
            preferences: this._preferences,
            history: this._history,
            displayPercent: value => this._displayPercent(value),
            tokens: this._tokens,
            onSelectRange: (next, controlId) => {
                this._historyRangeFocusId = controlId;
                this._settings.set_enum('history-range', next.index);
            },
        });
        const children = this._view === 'settings'
            ? buildSettingsView({preferences: this._preferences,
                settings: this._settings, tokens: this._tokens,
                onBack: () => {
                    this._view = 'usage';
                    this._render();
                }})
            : buildUsageView({snapshot, preferences: this._preferences,
                extensionPath: this.path, tokens: this._tokens, history,
                displayPercent: value => this._displayPercent(value),
                onRefresh: () => this._controller.refresh(),
                onOpenSettings: () => {
                    this._view = 'settings';
                    this._render();
                }});
        replaceChild(this._popoverHost, PopoverScaffold({
            id: 'cloudex-live-popover',
            view: this._view,
            children,
        }));
        if (this._historyRangeFocusId) {
            findActor(this._popoverHost, this._historyRangeFocusId)?.grab_key_focus();
            this._historyRangeFocusId = null;
        }
        this._syncPresentationTimer(snapshot);
    }

    _displayPercent(percent) {
        return displayPercent(percent, this._preferences.usageDisplay.id);
    }

    _ensureIndicator() {
        if (this._indicator)
            {return;}
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._indicator.add_style_class_name('cloudex-indicator');
        this._indicator.set_accessible_name('Cloudex Usage');
        this._panelHost = new St.Bin({name: 'cloudex-panel-host'});
        this._indicator.add_child(this._panelHost);
        this._menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'cloudex-menu-item',
        });
        this._popoverHost = new St.Bin({name: 'cloudex-popover-host'});
        this._menuItem.add_child(this._popoverHost);
        this._indicator.menu.addMenuItem(this._menuItem);
        this._menuOpenChangedId = this._indicator.menu.connect(
            'open-state-changed', (_menu, open) => {
                if (!this._controller)
                    {return;}
                const snapshot = this._controller.getSnapshot();
                if (open && this._view === 'usage')
                    {this._updateTemporalPresentation(snapshot);}
                this._syncPresentationTimer(snapshot);
            });
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    _destroyIndicator() {
        this._clearPresentationTimer();
        if (this._indicator && this._menuOpenChangedId) {
            this._indicator.menu.disconnect(this._menuOpenChangedId);
            this._menuOpenChangedId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._panelHost = null;
        this._popoverHost = null;
        this._menuItem = null;
    }

    _usagePopupVisible() {
        return this._view === 'usage' && this._indicator?.menu.isOpen === true;
    }

    _syncPresentationTimer(snapshot = null) {
        if (!this._usagePopupVisible()) {
            this._clearPresentationTimer();
            return;
        }
        snapshot ??= this._controller?.getSnapshot();
        if (!snapshot?.clockValid) {
            this._clearPresentationTimer();
            return;
        }
        if (this._presentationSourceId !== null)
            {return;}
        this._presentationSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            nextMinuteDelay(this._now()),
            () => this._runPresentationTick());
    }

    _runPresentationTick() {
        this._presentationSourceId = null;
        if (!this._controller || !this._usagePopupVisible())
            {return GLib.SOURCE_REMOVE;}
        const snapshot = this._controller.getSnapshot();
        this._updateTemporalPresentation(snapshot);
        this._syncPresentationTimer(snapshot);
        return GLib.SOURCE_REMOVE;
    }

    _updateTemporalPresentation(snapshot) {
        const root = this._popoverHost?.get_child();
        if (!root)
            {return;}
        const footer = findActor(root, 'footer-status');
        if (footer)
            {footer.text = snapshot.footer;}
        for (const provider of snapshot.providers) {
            for (const metric of provider.metrics) {
                const reset = findActor(root, `reset-label-${metric.id}`);
                if (reset)
                    {reset.text = metric.resetLabel;}
                const presentation = displayUsageMetric(provider, metric,
                    this._preferences, value => this._displayPercent(value));
                const progress = findActor(root, `progress-${metric.id}`);
                if (progress && presentation.pacePercent !== undefined) {
                    setProgressBarPace(progress, presentation.pacePercent);
                    progress.set_accessible_name(presentation.accessibleName);
                }
            }
        }
    }

    _clearPresentationTimer() {
        if (this._presentationSourceId === null)
            {return;}
        GLib.Source.remove(this._presentationSourceId);
        this._presentationSourceId = null;
    }

}
