import {column} from './actor-utils.js';
import {ProviderGroup} from './provider-group.js';
import {requireId, requireUniqueIds} from './presentation-validation.js';
import {UsageMetric} from './usage-metric.js';

/** @typedef {{id: string, provider: object, metrics: object[], tokens: object}} ProviderCardProps */
/** @param {ProviderCardProps} props */
export function ProviderCard({id, provider, metrics, tokens}) {
    requireId(id, 'Provider card');
    requireUniqueIds(metrics, 'Usage metric');
    const actor = column('claudex-provider-card', {name: id});
    actor.add_child(ProviderGroup({model: provider, tokens}));
    for (const metric of metrics)
        {actor.add_child(UsageMetric({metric, tokens}));}
    return actor;
}
