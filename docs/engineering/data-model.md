# Data Model

The catalog retains only process-local presentation state. The production shell
persists four panel preferences in its GSettings schema: three boolean visibility
choices and one refresh-cadence enum. Provider readings, reset timestamps, raw
responses, credentials, errors, and popup view state are never persisted.
