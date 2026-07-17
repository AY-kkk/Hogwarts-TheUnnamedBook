import { type Character } from '../../lib/db';
import type { ReactNode } from 'react';
import { Wand2, Brain, Zap, Heart, Sparkles } from 'lucide-react';

interface CharacterPanelProps {
  character: Character;
}

export function CharacterPanel({ character }: CharacterPanelProps) {
  const { status, wand } = character;
  
  return (
    <div className="space-y-8 p-4">
      {/* 1. Attributes Hexagon (Simplified) */}
      <div className="bg-parchment/50 p-6 rounded-lg border border-ink/10 relative overflow-hidden">
        <h3 className="font-title text-xl mb-4 border-b border-ink/10 pb-2">Attributes</h3>
        <div className="grid grid-cols-2 gap-4">
            <AttributeItem icon={<Brain size={18}/>} label="Knowledge" value={status.attributes.knowledge} />
            <AttributeItem icon={<Zap size={18}/>} label="Morality" value={status.attributes.morality} />
            <AttributeItem icon={<Heart size={18}/>} label="Athletics" value={status.attributes.athletics} />
            <AttributeItem icon={<Sparkles size={18}/>} label="Charm" value={status.attributes.charm} />
        </div>
      </div>

      {/* 2. Wand Info */}
      <div className="bg-parchment/50 p-6 rounded-lg border border-ink/10">
         <h3 className="font-title text-xl mb-4 border-b border-ink/10 pb-2 flex items-center gap-2">
           <Wand2 size={20} className="text-magic" /> 
           Wand
         </h3>
         {wand ? (
           <div className="space-y-2 font-body text-lg">
             <div className="flex justify-between">
               <span className="text-ink/60">Wood:</span>
               <span className="font-bold">{wand.wood}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-ink/60">Core:</span>
               <span className="font-bold">{wand.core}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-ink/60">Length:</span>
               <span>{wand.length}"</span>
             </div>
             <div className="flex justify-between">
               <span className="text-ink/60">Flexibility:</span>
               <span className="italic">{wand.flexibility}</span>
             </div>
           </div>
         ) : (
           <p className="text-ink/40 italic text-center py-4">You have not yet visited Ollivanders.</p>
         )}
      </div>
      
      {/* 3. Inventory Preview */}
      <div className="bg-parchment/50 p-6 rounded-lg border border-ink/10">
        <h3 className="font-title text-xl mb-4 border-b border-ink/10 pb-2">Inventory</h3>
        <ul className="list-disc list-inside font-body text-lg space-y-1">
          {status.inventory.length > 0 ? (
            status.inventory.map((item, idx) => (
              <li key={idx} className="text-ink/80">{item}</li>
            ))
          ) : (
            <li className="text-ink/40 list-none italic">Empty pockets...</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function AttributeItem({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center p-3 bg-white/30 rounded border border-ink/5">
       <div className="text-ink/50 mb-1">{icon}</div>
       <span className="font-title text-sm uppercase tracking-wider text-ink/60">{label}</span>
       <span className="font-body text-2xl font-bold text-ink">{value}</span>
    </div>
  )
}
