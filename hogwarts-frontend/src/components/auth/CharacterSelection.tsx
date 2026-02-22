
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Character } from '../../lib/db';
import { CharacterCard } from './CharacterCard';
import { Sparkles } from 'lucide-react';

interface CharacterSelectionProps {
  onSelectCharacter: (character: Character) => void;
  onCreateNew: () => void;
}

export function CharacterSelection({ onSelectCharacter, onCreateNew }: CharacterSelectionProps) {
  const characters = useLiveQuery(() => db.character.toArray()) || [];

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this wizard? This cannot be undone (Avada Kedavra!).")) {
      await db.character.delete(id);
      // Also delete related logs/memories
      // await db.logs.where('characterId').equals(id).delete();
    }
  };

  const handleCardClick = (char: Character) => {
    onSelectCharacter(char);
  };

  return (
    <div className="min-h-screen bg-hogwarts-bg flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background Ambience */}
      {/* Background (Gradient Only) */}
      <div className="absolute inset-0 bg-gradient-to-t from-hogwarts-bg via-transparent to-hogwarts-bg" />

      <header className="relative z-10 text-center mb-12">
        <h1 className="font-title text-4xl text-magic-gold tracking-[0.2em] mb-2 flex items-center gap-4">
          <Sparkles className="text-magic-light" />
          Select Your Wizard
          <Sparkles className="text-magic-light" />
        </h1>
        <p className="font-body text-parchment-300 italic">
          "The wand chooses the wizard, Mr. Potter."
        </p>
      </header>

      <div className="relative z-10 flex flex-wrap justify-center items-center gap-8 max-w-6xl w-full">
        {/* Existing Characters */}
        {characters.map(char => (
          <CharacterCard 
            key={char.id} 
            character={char} 
            onSelect={() => handleCardClick(char)}
            onDelete={char.id ? () => handleDelete(char.id!) : undefined}
          />
        ))}

        {/* Empty Slots (Up to 3) */}
        {Array.from({ length: Math.max(0, 3 - characters.length) }).map((_, i) => (
          <CharacterCard 
            key={`empty-${i}`} 
            isEmpty 
            onSelect={onCreateNew} 
          />
        ))}
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-8 text-parchment-300/50 text-sm font-ui">
        {characters.length}/3 Slots Used
      </div>
    </div>
  );
}
