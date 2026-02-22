import { type Character } from '../../lib/db';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';

interface RelationshipsPanelProps {
  character: Character;
}

export function RelationshipsPanel({ character }: RelationshipsPanelProps) {
  const relationships = character.relationships || {};
  const entries = Object.entries(relationships);

  return (
    <div className="space-y-8 p-4">
      {/* Header */}
      <h3 className="font-title text-2xl mb-6 text-center text-magic">Relationships</h3>

      {/* List */}
      <div className="space-y-4">
        {entries.length > 0 ? (
          entries.map(([name, data]) => (
            <motion.div 
              key={name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-parchment/60 p-4 rounded-lg border border-ink/10 flex items-center gap-4 hover:bg-parchment/80 transition-colors"
            >
               <div className="w-12 h-12 rounded-full bg-ink/5 flex items-center justify-center border border-ink/10 shrink-0">
                  <User size={24} className="text-ink/40" />
               </div>
               
               <div className="flex-1">
                 <div className="flex justify-between items-baseline mb-1">
                   <h4 className="font-title text-lg font-bold text-ink">{name}</h4>
                   <span className="font-meta text-xs text-ink/50 uppercase tracking-widest">{data.tag}</span>
                 </div>
                 <p className="font-body text-sm text-ink/70 italic line-clamp-2">"{data.desc}"</p>
                 
                 {/* Relationship Level Bar */}
                 <div className="mt-3 h-1.5 w-full bg-ink/10 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-magic transition-all duration-500" 
                     style={{ width: `${(data.level / 5) * 100}%` }} 
                   />
                 </div>
               </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-12 text-ink/40 italic font-body">
            You haven't made any deep connections yet.
          </div>
        )}
      </div>
    </div>
  );
}
