# Data Model

The catalog retains only process-local presentation state. The production shell
persists four panel preferences in its GSettings schema: three boolean visibility
choices and one refresh-cadence enum. Raw responses, credentials, errors, and popup
view state are never persisted.

Local usage history adds one durable, local-only store, defined by the
`extension/history-store.js` boundary and written during the existing refresh cycle. It
retains bounded per-provider-window `{atMs, percent}` samples within a 30-day retention
window; older samples and any beyond the per-window cap are dropped. HIST-002 adds the
durable file that persists the serialized store together with a local-history boolean and
a selected-range enum in the GSettings schema. The store holds only percent-and-timestamp
samples — never a credential, raw response, reset detail, or error — and nothing it
records leaves the machine.
