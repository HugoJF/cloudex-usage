import {
    DEFAULT_DATA_ROLES,
    requireCallback,
    requireId,
    snapshotPresentation as snapshotProviderPresentation,
    validateResult as validateProviderResult,
} from './controller-validation.js';
import {
    buildSurfaceSnapshot,
} from './controller-snapshot.js';

function frozen(value) {
    return Object.freeze(value);
}

export class SurfaceController {
    constructor({now = () => Date.now(), schedule, cancel, onChange = () => {},
        refreshIntervalMs = 5 * 60 * 1000, dataRoles = DEFAULT_DATA_ROLES} = {}) {
        this._now = requireCallback(now, 'Clock');
        this._schedule = requireCallback(schedule, 'Scheduler');
        this._cancel = requireCallback(cancel, 'Scheduler cancel');
        this._onChange = requireCallback(onChange, 'Change callback');
        if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0)
            throw new Error('Refresh interval must be a positive safe integer');
        this._refreshIntervalMs = refreshIntervalMs;
        this._dataRoles = [...dataRoles];
        this._providers = new Map();
        this._providerReservations = new Set();
        this._timer = null;
        this._refreshing = false;
        this._refreshRequested = false;
        this._disposed = false;
        this._lastCompletedAtMs = null;
    }

    registerProvider(provider) {
        if (this._disposed)
            throw new Error('Surface controller is disposed');
        if (!provider || typeof provider !== 'object')
            throw new Error('Provider must be an object');
        const id = requireId(provider.id, 'Provider ID');
        if (this._disposed)
            throw new Error('Surface controller is disposed');
        if (this._providers.has(id) || this._providerReservations.has(id))
            throw new Error(`Provider ID is already registered: ${id}`);
        this._providerReservations.add(id);

        let state = null;
        let acquiredUnsubscribe = null;
        let committed = false;
        const assertProvisionalActive = () => {
            if (this._disposed)
                throw new Error('Surface controller is disposed');
            if (!this._providerReservations.has(id))
                throw new Error(`Provider registration was interrupted: ${id}`);
        };
        const read = callback => {
            assertProvisionalActive();
            const value = callback();
            assertProvisionalActive();
            return value;
        };
        try {
            const presentation = snapshotProviderPresentation(
                provider, this._dataRoles, id, read);
            const isEligible = requireCallback(read(() => provider.isEligible),
                'Provider isEligible');
            const initial = read(() => isEligible());
            if (typeof initial !== 'boolean')
                throw new Error('Provider isEligible must return a strict boolean');
            const subscribeEligibility = requireCallback(
                read(() => provider.subscribeEligibility),
                'Provider subscribeEligibility');
            const refresh = requireCallback(read(() => provider.refresh), 'Provider refresh');
            state = {
                presentation,
                refresh,
                eligible: initial,
                result: null,
                generation: Symbol('provider-generation'),
                unsubscribe: null,
                removed: false,
                registered: false,
            };
            const receiveEligibility = eligible => {
                if (state.removed)
                    return;
                let becameEligible = false;
                if (typeof eligible !== 'boolean') {
                    state.eligible = false;
                    state.result = null;
                    state.generation = Symbol('provider-generation');
                } else if (state.eligible !== eligible) {
                    state.eligible = eligible;
                    state.result = null;
                    state.generation = Symbol('provider-generation');
                    becameEligible = eligible;
                } else {
                    return;
                }
                if (!state.registered)
                    return;
                this._changed();
                if (becameEligible)
                    this._requestEligibilityRefresh();
                else
                    this._syncLifecycle();
            };
            assertProvisionalActive();
            const unsubscribe = subscribeEligibility(receiveEligibility);
            if (typeof unsubscribe === 'function')
                acquiredUnsubscribe = unsubscribe;
            assertProvisionalActive();
            if (typeof unsubscribe !== 'function') {
                throw new Error(
                    'Provider subscribeEligibility must return an unsubscribe callback');
            }
            if (this._providers.has(id))
                throw new Error(`Provider ID is already registered: ${id}`);
            state.unsubscribe = unsubscribe;
            state.registered = true;
            this._providers.set(id, state);
            committed = true;
        } catch (error) {
            if (state)
                state.removed = true;
            if (acquiredUnsubscribe) {
                try {
                    acquiredUnsubscribe();
                } catch {}
            }
            throw error;
        } finally {
            this._providerReservations.delete(id);
        }
        if (!committed)
            throw new Error(`Provider registration failed: ${id}`);
        this._changed();
        if (state.eligible)
            this._requestEligibilityRefresh();
        else
            this._syncLifecycle();
        let unregistered = false;
        return () => {
            if (unregistered)
                return;
            unregistered = true;
            this._removeProvider(id, state);
        };
    }

    refresh() {
        if (this._disposed || !this._hasEligible())
            return;
        this._clearTimer();
        if (this._refreshing)
            return;
        this._startRefresh();
    }

    setRefreshIntervalMs(refreshIntervalMs) {
        if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0)
            throw new Error('Refresh interval must be a positive safe integer');
        if (this._refreshIntervalMs === refreshIntervalMs)
            return;
        this._refreshIntervalMs = refreshIntervalMs;
        if (this._disposed || !this._hasEligible() || this._refreshing)
            return;
        this._clearTimer();
        this._scheduleNext();
    }

    getSnapshot() {
        return buildSurfaceSnapshot(this._orderedEligible(), this._refreshing,
            this._lastCompletedAtMs, this._now());
    }

    dispose() {
        if (this._disposed)
            return;
        this._disposed = true;
        this._clearTimer();
        this._refreshRequested = false;
        for (const [id, state] of [...this._providers])
            this._removeProvider(id, state, false);
        this._providers.clear();
        this._changed();
    }

    _removeProvider(id, state, notify = true) {
        if (state.removed)
            return;
        state.removed = true;
        state.generation = Symbol('provider-generation');
        this._providers.delete(id);
        state.unsubscribe?.();
        state.unsubscribe = null;
        if (notify)
            this._changed();
        this._syncLifecycle();
    }

    _orderedEligible() {
        return [...this._providers.values()]
            .filter(state => state.eligible && !state.removed)
            .sort((left, right) => left.presentation.order - right.presentation.order ||
                left.presentation.id.localeCompare(right.presentation.id));
    }

    _hasEligible() {
        return this._orderedEligible().length > 0;
    }

    _syncLifecycle() {
        if (this._disposed || !this._hasEligible()) {
            this._clearTimer();
            this._lastCompletedAtMs = null;
            this._refreshRequested = false;
            return;
        }
        if (!this._refreshing && this._timer === null &&
            this._lastCompletedAtMs === null)
            this._startRefresh();
    }

    _requestEligibilityRefresh() {
        if (this._disposed || !this._hasEligible())
            return;
        if (this._refreshing) {
            this._refreshRequested = true;
            return;
        }
        this._clearTimer();
        this._startRefresh();
    }

    _startRefresh() {
        if (this._refreshing || this._disposed || !this._hasEligible())
            return;
        this._refreshing = true;
        this._changed();
        const attempts = this._orderedEligible().map(state => {
            const generation = state.generation;
            return Promise.resolve()
                .then(() => {
                    if (this._disposed || state.removed || !state.eligible ||
                        state.generation !== generation) {
                        return {state, generation, result: null, skipped: true};
                    }
                    let refreshResult;
                    try {
                        refreshResult = state.refresh();
                    } catch {
                        return {state, generation, result: null, skipped: false};
                    }
                    return Promise.resolve(refreshResult)
                        .then(result => ({state, generation,
                            result: validateProviderResult(
                                result, state.presentation.windows),
                            skipped: false}))
                        .catch(() => ({state, generation, result: null, skipped: false}));
                });
        });
        Promise.all(attempts).then(results => {
            if (this._disposed)
                return;
            for (const {state, generation, result, skipped} of results) {
                if (!skipped && !state.removed && state.eligible &&
                    state.generation === generation) {
                    state.result = result ?? frozen({status: 'unavailable'});
                }
            }
            this._refreshing = false;
            this._lastCompletedAtMs = this._hasEligible() ? this._now() : null;
            this._changed();
            if (this._hasEligible() && this._refreshRequested) {
                this._refreshRequested = false;
                this._startRefresh();
            } else if (this._hasEligible()) {
                this._scheduleNext();
            }
        });
    }

    _scheduleNext() {
        this._clearTimer();
        this._timer = this._schedule(() => {
            this._timer = null;
            this.refresh();
        }, this._refreshIntervalMs);
    }

    _clearTimer() {
        if (this._timer === null)
            return;
        this._cancel(this._timer);
        this._timer = null;
    }

    _changed() {
        this._onChange(this.getSnapshot());
    }
}
