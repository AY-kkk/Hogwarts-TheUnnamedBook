# IndexedDB v5 character isolation migration

## Purpose

Schema v5 adds `characterUuid` to the `world_log` index and makes every new character, log, memory, world event, and Pensieve resume marker belong to one local character.

## Automatic migration

- Every legacy character without a UUID receives a locally generated UUID.
- If the database contains exactly one character, unscoped legacy logs, memories, and world events are assigned to that character because the owner is unambiguous.
- If the database contains multiple characters, unscoped records are preserved but not shown or sent to the model. The migration does not guess an owner and therefore cannot contaminate another save.
- The migration is additive. It does not delete legacy records.

## Rollback note

Do not downgrade a browser that has opened schema v5 to an older frontend build. Roll back the application only after preserving/exporting local data, or ship a forward-fix with a schema version greater than 5.

## Verification

1. Open a legacy single-character database and confirm its previous history remains visible.
2. Create three characters and confirm no fourth empty slot is shown.
3. Add logs/world events to two characters and confirm switching characters never displays or sends the other character's records.
4. Delete one character and confirm only that character's logs, memories, world events, and resume marker are removed.
