import { db } from '../lib/db';

/**
 * Extracts <state_update> JSON from text and updates the database.
 * Returns the cleaned text (without the tags).
 */
export async function parseAndApplyState(fullText: string, characterUuid?: string): Promise<string> {
  const tagRegex = /<state_update>([\s\S]*?)<\/state_update>/;
  const match = fullText.match(tagRegex);

  if (match && match[1]) {
    try {
      const jsonStr = match[1];
      const updateData = JSON.parse(jsonStr);
      
      console.log("Applying State Update:", updateData);
      const getChar = async () =>
        characterUuid
          ? await db.character.where('uuid').equals(characterUuid).first()
          : await db.character.limit(1).first();

      // 1. Update Character Status
      if (updateData.status) {
        const char = await getChar();
        if (char) {
          // Merge logic: shallow merge for status
          const newStatus = { ...char.status, ...updateData.status };
          await db.character.update(char.id!, { status: newStatus });
        }
      }

      // 2. Handle Inventory Events
      if (updateData.inventory_events && Array.isArray(updateData.inventory_events)) {
        const char = await getChar();
        if (char) {
          const inventory = [...char.status.inventory];
          for (const event of updateData.inventory_events) {
            if (event.op === 'add') {
              inventory.push(event.item);
            } else if (event.op === 'remove') {
              const idx = inventory.indexOf(event.item);
              if (idx > -1) inventory.splice(idx, 1);
            }
          }
          await db.character.update(char.id!, { 
            status: { ...char.status, inventory } 
          });
        }
      }

      // 3. Handle House Assignment (Prologue)
      if (updateData.house) {
         const char = await getChar();
         if (char) {
           await db.character.update(char.id!, { house: updateData.house });
         }
      }

      // 4. World Log
      if (updateData.world_log_add) {
        await db.world_log.add({
          event_name: updateData.world_log_add,
          timestamp: Date.now(),
          description: "World Event"
        });
      }

      // Return text without the tag
      return fullText.replace(tagRegex, '').trim();

    } catch (e) {
      console.error("Failed to parse state_update JSON", e);
      // Return original text if parse fails, maybe append error note?
      return fullText; 
    }
  }

  return fullText;
}
