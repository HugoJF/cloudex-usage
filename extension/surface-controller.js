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

const DEFAULT_REFRESH_INTERVAL_MS = 300000;

export class SurfaceController {
    constructor({now = () => Date.now(), schedule, cancel, onChange = () => {},
        refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
        dataRoles = DEFAULT_DATA_ROLES} = {}) {
        this._now = requireCallback(now, 'Clock');
        this._schedule = requireCallback(schedule, 'Scheduler');
        this._cancel = requireCallback(cancel, 'Scheduler cancel');
        this._onChange = requireCallback(onChange, 'Change callback');
        if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0)
            {throw new Error('Refresh interval must be a positive safe integer');}
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
        const id = this._reserveProvider(provider);
        let state = null;
        let acquiredUnsubscribe = null;
        const read = callback => {
            this._assertProvisionalActive(id);
            const value = callback();
            this._assertProvisionalActive(id);
            return value;
        };
        try {
            state = this._createProviderState(provider, id, read);
            const subscribeEligibility = requireCallback(
                read(() => provider.subscribeEligibility),
                'Provider subscribeEligibility');
            this._assertProvisionalActive(id);
            const unsubscribe = subscribeEligibility(eligible =>
                this._receiveEligibility(state, eligible));
            if (typeof unsubscribe === 'function')
                {acquiredUnsubscribe = unsubscribe;}
            this._assertProvisionalActive(id);
            if (typeof unsubscribe !== 'function') {
                throw new Error(
                    'Provider subscribeEligibility must return an unsubscribe callback');
            }
            if (this._providers.has(id))
                {throw new Error(`Provider ID is already registered: ${id}`);}
            state.unsubscribe = unsubscribe;
            state.registered = true;
            this._providers.set(id, state);
        } catch (error) {
            this._cleanupRegistration(state, acquiredUnsubscribe);
            throw error;
        } finally {
            this._providerReservations.delete(id);
        }
        this._changed();
        if (state.eligible)
            {this._requestEligibilityRefresh();}
        else
            {this._syncLifecycle();}
        let unregistered = false;
        return () => {
            if (unregistered)
                {return;}
            unregistered = true;
            this._removeProvider(id, state);
        };
    }

    _reserveProvider(provider) {
        if (this._disposed)
            {throw new Error('Surface controller is disposed');}
        if (!provider || typeof provider !== 'object')
            {throw new Error('Provider must be an object');}
        const id = requireId(provider.id, 'Provider ID');
        if (this._disposed)
            {throw new Error('Surface controller is disposed');}
        if (this._providers.has(id) || this._providerReservations.has(id))
            {throw new Error(`Provider ID is already registered: ${id}`);}
        this._providerReservations.add(id);
        return id;
    }

    _assertProvisionalActive(id) {
        if (this._disposed)
            {throw new Error('Surface controller is disposed');}
        if (!this._providerReservations.has(id))
            {throw new Error(`Provider registration was interrupted: ${id}`);}
    }

    _createProviderState(provider, id, read) {
        const presentation = snapshotProviderPresentation(provider,
            this._dataRoles, id, read);
        const isEligible = requireCallback(read(() => provider.isEligible),
            'Provider isEligible');
        const initial = read(() => isEligible());
        if (typeof initial !== 'boolean')
            {throw new Error('Provider isEligible must return a strict boolean');}
        return {presentation,
            refresh: requireCallback(read(() => provider.refresh), 'Provider refresh'),
            eligible: initial, result: null,
            generation: Symbol('provider-generation'), unsubscribe: null,
            removed: false, registered: false};
    }

    _receiveEligibility(state, eligible) {
        if (state.removed)
            {return;}
        const changed = typeof eligible !== 'boolean' || state.eligible !== eligible;
        if (!changed)
            {return;}
        state.eligible = eligible === true;
        state.result = null;
        state.generation = Symbol('provider-generation');
        if (!state.registered)
            {return;}
        this._changed();
        if (state.eligible)
            {this._requestEligibilityRefresh();}
        else
            {this._syncLifecycle();}
    }

    _cleanupRegistration(state, unsubscribe) {
        if (state)
            {state.removed = true;}
        if (!unsubscribe)
            {return;}
        try {
            unsubscribe();
        } catch (_) {
            // Preserve the primary registration failure.
        }
    }

    refresh() {
        if (this._disposed || !this._hasEligible())
            {return;}
        this._clearTimer();
        if (this._refreshing)
            {return;}
        this._startRefresh();
    }

    setRefreshIntervalMs(refreshIntervalMs) {
        if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs <= 0)
            {throw new Error('Refresh interval must be a positive safe integer');}
        if (this._refreshIntervalMs === refreshIntervalMs)
            {return;}
        this._refreshIntervalMs = refreshIntervalMs;
        if (this._disposed || !this._hasEligible() || this._refreshing)
            {return;}
        this._clearTimer();
        this._scheduleNext();
    }

    getSnapshot() {
        return buildSurfaceSnapshot(this._orderedEligible(), this._refreshing,
            this._lastCompletedAtMs, this._now());
    }

    dispose() {
        if (this._disposed)
            {return;}
        this._disposed = true;
        this._clearTimer();
        this._refreshRequested = false;
        for (const [id, state] of [...this._providers])
            {this._removeProvider(id, state, false);}
        this._providers.clear();
        this._changed();
    }

    _removeProvider(id, state, notify = true) {
        if (state.removed)
            {return;}
        state.removed = true;
        state.generation = Symbol('provider-generation');
        this._providers.delete(id);
        state.unsubscribe?.();
        state.unsubscribe = null;
        if (notify)
            {this._changed();}
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
            {this._startRefresh();}
    }

    _requestEligibilityRefresh() {
        if (this._disposed || !this._hasEligible())
            {return;}
        if (this._refreshing) {
            this._refreshRequested = true;
            return;
        }
        this._clearTimer();
        this._startRefresh();
    }

    _startRefresh() {
        if (this._refreshing || this._disposed || !this._hasEligible())
            {return;}
        this._refreshing = true;
        this._changed();
        const attempts = this._orderedEligible().map(state =>
            this._attemptRefresh(state));
        Promise.all(attempts).then(results => this._completeRefresh(results));
    }

    _attemptRefresh(state) {
        const generation = state.generation;
        return Promise.resolve().then(() => {
            if (this._disposed || state.removed || !state.eligible ||
                state.generation !== generation)
                {return {state, generation, result: null, skipped: true};}
            try {
                return Promise.resolve(state.refresh())
                    .then(result => ({state, generation,
                        result: validateProviderResult(result,
                            state.presentation.windows), skipped: false}))
                    .catch(() => ({state, generation, result: null, skipped: false}));
            } catch {
                return {state, generation, result: null, skipped: false};
            }
        });
    }

    _completeRefresh(results) {
        if (this._disposed)
            {return;}
        results.forEach(result => this._applyRefreshResult(result));
        this._refreshing = false;
        this._lastCompletedAtMs = this._hasEligible() ? this._now() : null;
        this._changed();
        this._scheduleAfterRefresh();
    }

    _applyRefreshResult({state, generation, result, skipped}) {
        if (!skipped && !state.removed && state.eligible &&
            state.generation === generation)
            {state.result = result ?? frozen({status: 'unavailable'});}
    }

    _scheduleAfterRefresh() {
        if (!this._hasEligible())
            {return;}
        if (this._refreshRequested) {
            this._refreshRequested = false;
            this._startRefresh();
            return;
        }
        this._scheduleNext();
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
            {return;}
        this._cancel(this._timer);
        this._timer = null;
    }

    _changed() {
        this._onChange(this.getSnapshot());
    }
}
