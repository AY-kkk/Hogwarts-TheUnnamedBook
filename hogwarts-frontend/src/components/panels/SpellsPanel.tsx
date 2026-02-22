import { type Character } from '../../lib/db';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

interface SpellsPanelProps {
  character: Character;
}

export function SpellsPanel({ character }: SpellsPanelProps) {
  const spells = character.spells || {};
  const entries = Object.entries(spells);

  return (
    <div className="space-y-8 p-4">
      {/* Header */}
      <h3 className="font-title text-2xl mb-6 text-center text-magic">Spells</h3>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4">
        {entries.length > 0 ? (
          entries.map(([spellName, data]) => (
            <motion.div 
              key={spellName}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-parchment/60 p-4 rounded-lg border border-ink/10 flex flex-col items-center hover:scale-105 transition-transform"
            >
               <div className="w-12 h-12 rounded-full bg-ink/5 flex items-center justify-center mb-3">
                  <Zap size={24} className="text-magic" />
               </div>
               
               <h4 className="font-title text-lg font-bold text-ink mb-1 text-center">{spellName}</h4>
               
               {/* Level Indicator */}
               <div className="flex gap-1 mb-2">
                 {[...Array(5)].map((_, i) => (
                   <div 
                     key={i} 
                     className={`w-1.5 h-1.5 rounded-full ${i < data.level ? 'bg-magic' : 'bg-ink/10'}`}
                   />
                 ))}
               </div>
               
               <p className="font-meta text-xs text-ink/50 text-center italic leading-tight">{data.desc}</p>
            </motion.div>
          ))
        ) : (
          <div className="col-span-2 text-center py-12 text-ink/40 italic font-body">
            Your wand has yet to cast its first spell.
          </div>
        )}
      </div>
    </div>
  );
}
