# State Schema `state-2026.07.17.1`

The browser owns the canonical Local-First state. `GameStatus` contains resources, attributes, inventory, location, calendar, mode, prologue turn and chapter. Character-level house, spells, relationships and per-character world events are updated by the same State Manager transaction.

## Incremental update contract

Every `<state_update>` must be the final response block and contain:

- a character-scoped `event_id` using 8-64 safe characters;
- at least one known change among `status`, `house`, `inventory_events`, `spells`, `relationships` and `world_log_add`;
- only documented fields and bounded values;
- `status.attributes` for knowledge, athletics, charm, morality and mental values;
- one of `Unsorted`, `Gryffindor`, `Slytherin`, `Ravenclaw`, `Hufflepuff` for house;
- one of `prologue`, `weekly`, `event` for mode.

The State Manager validates the whole package before opening its write transaction. It merges the status, applies inventory/spell/relationship/house/world changes, updates `lastPlayed` and records the event key in one transaction. A repeated event key returns `duplicate` without applying any change.

Invalid JSON, an unknown field, an out-of-range value, MP above max MP or AP above max AP preserves the previous snapshot. The original narrative stays visible for diagnosis and a redacted local error record is written without storing the raw model payload.

## IndexedDB v6 migration

- Legacy `stamina` becomes `athletics`; legacy `courage` becomes `morality`.
- Missing resource, calendar and mode fields receive deterministic defaults based on the character era.
- Invalid legacy house values become `Unsorted`.
- Existing logs and world events remain untouched.
- Downgrade is unsupported; publish a higher-version forward fix if migration defects are found.
