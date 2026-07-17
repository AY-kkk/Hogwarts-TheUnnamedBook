
import React from 'react';
import { motion } from 'framer-motion';
import { type Character } from '../../lib/db';
import { HouseCrest } from '../ui/HouseCrest';

interface CharacterCardProps {
  character?: Character;
  isEmpty?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}

export const CharacterCard: React.FC<CharacterCardProps> = ({ 
  character, isEmpty, onSelect, onDelete 
}) => {
  
  if (isEmpty) {
    return (
      <motion.div 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onSelect}
        className="
          w-64 h-96 m-4 cursor-pointer group
          border-2 border-dashed border-magic-dark/30 hover:border-magic-gold
          rounded-xl flex flex-col items-center justify-center
          transition-all duration-300 bg-hogwarts-card/50 hover:bg-hogwarts-card
        "
      >
        <span className="text-6xl text-magic-dark group-hover:text-magic-gold transition-colors mb-4">+</span>
        <span className="font-title text-parchment-300 group-hover:text-magic-light tracking-wide">
          新建巫师
        </span>
      </motion.div>
    );
  }

  if (!character) return null;

  return (
    <motion.div 
      whileHover={{ y: -10 }}
      className="
        w-64 h-96 m-4 cursor-pointer relative group
        bg-hogwarts-card border border-magic-dark
        rounded-xl overflow-hidden shadow-xl
        hover:shadow-[0_0_20px_rgba(197,160,89,0.2)] transition-all duration-300
      "
      onClick={onSelect}
    >
      {/* 装饰性角标 */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-magic-gold to-transparent opacity-50" />

      {/* Delete Button (Visible on hover) */}
      {onDelete && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 z-20 text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-2"
          title="删除档案"
        >
          ✕
        </button>
      )}

      {/* 头像区域 */}
      <div className="h-48 bg-hogwarts-dark relative overflow-hidden flex items-center justify-center">
        <HouseCrest house={character.house} className="w-24 h-24 opacity-80 group-hover:opacity-100 transition-all duration-500 relative z-10" />
        
        {/* 等级徽章 */}
        <div className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-magic-dark border border-magic-gold flex items-center justify-center text-parchment-100 font-title text-sm shadow-md">
          {character.status.level}
        </div>
      </div>

      {/* 信息区域 - 羊皮纸质感 */}
      <div className="h-48 p-4 bg-parchment-200 bg-paper-texture flex flex-col justify-between text-parchment-text">
        <div>
          <h3 className="font-title text-xl font-bold mb-1 group-hover:text-magic-dark transition-colors line-clamp-1">
            {character.name}
          </h3>
          <p className="font-ui text-xs opacity-60 uppercase tracking-widest">
            {character.house} • Year {character.status.current_year}
          </p>
        </div>
        
        <div className="border-t border-parchment-300 pt-3">
          <p className="font-ui text-xs opacity-70 italic">
            上次冒险: <br/>
            {character.lastPlayed ? new Date(character.lastPlayed).toLocaleDateString() : 'New'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
