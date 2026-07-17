import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Shield, User, Download, Sun, Wand2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CharacterPanel } from '../panels/CharacterPanel';
import { RelationshipsPanel } from '../panels/RelationshipsPanel';
import { SpellsPanel } from '../panels/SpellsPanel';
import { type Character } from '../../lib/db';
import { HOUSE_CONFIG, DEFAULT_THEME } from '../../lib/constants';
import { HouseCrest } from '../ui/HouseCrest';

interface MemoryBarProps {
  isExpanded: boolean;
  onToggle: () => void;
  character: Character;
}

import { ArchiveOverlay } from '../auth/ArchiveOverlay';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Log } from '../../lib/db';
import { clearPensieveResumeState, startPensieveResumeFromLog } from '../../services/pensieveResume';

export function MemoryBar({ isExpanded, onToggle, character }: MemoryBarProps) {
  const status = character.status;
  const house = character.house; // Can be undefined
  const currentYear = status.current_year;
  const currentSeason = "Autumn"; 
  const houseTheme = house ? (HOUSE_CONFIG[house] || DEFAULT_THEME) : DEFAULT_THEME;

  // Panel State
  const [activeTab, setActiveTab] = useState<'character' | 'relationships' | 'spells' | 'system'>('character');
  const [showArchive, setShowArchive] = useState(false);

  // Archive Logs
  const logs =
    useLiveQuery<Log[]>(
      () =>
        character.uuid
          ? db.logs.where('characterUuid').equals(character.uuid).toArray()
          : [],
      [character.uuid]
    ) || [];

  const handleArchiveDelete = async (id: number) => {
    if (!character.uuid) return;
    const log = await db.logs.get(id);
    if (log?.characterUuid === character.uuid) await db.logs.delete(id);
  };

  const handleArchiveClear = async () => {
    try {
      if (!character.uuid) throw new Error('当前角色缺少 UUID，无法安全清空记忆');
      await db.logs.where('characterUuid').equals(character.uuid).delete();
      await clearPensieveResumeState(character.uuid);
    } catch (err) {
      console.error('Archive clear failed', err);
    }
  };

  const handleRestartConversation = async () => {
    try {
      const now = Date.now();
      if (!character.uuid) throw new Error('当前角色缺少 UUID，无法安全重开对话');
      await db.logs.where('characterUuid').equals(character.uuid).delete();
      await clearPensieveResumeState(character.uuid);
      await db.logs.add({
        turn_id: now,
        content: "## 新的开始\\n\\n你轻轻触碰冥想盆的银色边缘，旧日回响像雾一样散去。\\n\\n请在下方输入你的下一步行动。",
        type: 'system',
        characterUuid: character.uuid,
        timestamp: now
      });
    } catch (err) {
      console.error('Restart conversation failed', err);
    }
  };

  const handleContinueFromLog = async (logId: number) => {
    if (!character.uuid) return;
    try {
      await startPensieveResumeFromLog(character.uuid, logId);
    } catch (err) {
      console.error('Continue from log failed', err);
      alert(err instanceof Error ? err.message : '从此继续失败，请稍后再试');
    }
  };

  return (
    <motion.div 
      className={cn(
        "fixed left-0 top-0 h-full bg-[#E8DFC5] border-r border-[#D3C7A8] shadow-2xl z-50 flex flex-col items-center py-8 transition-all duration-300 overflow-hidden",
        isExpanded ? "w-[360px]" : "w-[80px]" // Increased expanded width for better panel view
      )}
      initial={{ x: -100 }}
      animate={{ x: 0 }}
      transition={{ type: "spring", stiffness: 100 }}
      style={{
        borderRightColor: houseTheme.primary
      }}
    >
      <ArchiveOverlay 
        isOpen={showArchive} 
        onClose={() => setShowArchive(false)}
        logs={logs}
        onDeleteLog={handleArchiveDelete}
        onClearAll={handleArchiveClear}
        onRestartConversation={handleRestartConversation}
        onContinueFromLog={handleContinueFromLog}
      />

      {/* Top: House Crest (Toggle) */}
      <div 
        className="mb-8 cursor-pointer hover:scale-105 transition-transform relative group shrink-0"
        onClick={onToggle}
      >
        <div 
          className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg border-2 overflow-hidden bg-white/10 backdrop-blur-sm"
          style={{ borderColor: houseTheme.secondary }}
        >
           <HouseCrest house={house} className="w-12 h-12" />
        </div>
        
        {/* Glow Effect - Only if house is selected */}
        {house && (
          <div 
              className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-40 blur-md transition-opacity duration-300"
              style={{ backgroundColor: houseTheme.primary }}
          />
        )}
      </div>

      {/* Navigation Tabs (Vertical when collapsed, Horizontal-ish when expanded?) 
          Actually, let's keep vertical for consistency, but when expanded show content on the right? 
          No, the requirement is "Sidebar shows status". So we switch between Icon Mode and Content Mode.
      */}
      
      {isExpanded ? (
        // EXPANDED VIEW: Full Content Panel
        <div className="flex-1 w-full overflow-y-auto px-2 scrollbar-hide">
          {/* Tab Headers */}
          <div className="flex justify-around mb-6 border-b border-ink/10 pb-2 px-4">
             <TabButton icon={<User size={18} />} active={activeTab === 'character'} onClick={() => setActiveTab('character')} color={houseTheme.primary} />
             <TabButton icon={<Shield size={18} />} active={activeTab === 'relationships'} onClick={() => setActiveTab('relationships')} color={houseTheme.primary} />
             <TabButton icon={<Wand2 size={18} />} active={activeTab === 'spells'} onClick={() => setActiveTab('spells')} color={houseTheme.primary} />
             <TabButton icon={<Download size={18} />} active={activeTab === 'system'} onClick={() => setActiveTab('system')} color={houseTheme.primary} />
          </div>

          {/* Tab Content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="pb-20"
          >
            {activeTab === 'character' && <CharacterPanel character={character} />}
            {activeTab === 'relationships' && <RelationshipsPanel character={character} />}
            {activeTab === 'spells' && <SpellsPanel character={character} />}
            {activeTab === 'system' && (
              <div className="text-center p-8 text-ink/60 italic">
                <p>Game Version: 0.1.0</p>
                <p>System: Trae Engine</p>
                <div className="flex flex-col gap-2 mt-4">
                  <button className="px-4 py-2 border border-ink/20 rounded hover:bg-ink/5">
                    Export Save (JSON)
                  </button>
                  <button 
                    onClick={async () => {
                      if(confirm("Reset World? This cannot be undone.")) {
                         // Import db dynamically to avoid circular dependency issues if any, though here it's fine
                         const { db } = await import('../../lib/db');
                         await db.delete();
                         window.location.reload();
                      }
                    }}
                    className="px-4 py-2 border border-blood/50 text-blood rounded hover:bg-blood/10"
                  >
                    Reset World
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      ) : (
        // COLLAPSED VIEW: Icons Only
        <div className="flex-1 flex flex-col gap-8 w-full px-4 items-center">
          <NavOrb icon={<User size={20} />} label="Character" isExpanded={false} onClick={() => { onToggle(); setActiveTab('character'); }} color={houseTheme.primary} />
          <NavOrb icon={<Shield size={20} />} label="Relationships" isExpanded={false} onClick={() => { onToggle(); setActiveTab('relationships'); }} color={houseTheme.primary} />
          <NavOrb icon={<Wand2 size={20} />} label="Spells" isExpanded={false} onClick={() => { onToggle(); setActiveTab('spells'); }} color={houseTheme.primary} />
          <NavOrb icon={<Download size={20} />} label="System" isExpanded={false} onClick={() => { onToggle(); setActiveTab('system'); }} color={houseTheme.primary} />
        </div>
      )}

      {/* Bottom: Status & Time */}
      <div 
        className="mt-auto flex flex-col items-center gap-2 text-ink/60 shrink-0 pb-4 bg-[#E8DFC5] w-full pt-4 border-t border-ink/5 cursor-pointer hover:bg-ink/5 transition-colors"
        onClick={() => setShowArchive(true)}
      >
        <div className="w-8 h-8 rounded-full border border-ink/20 flex items-center justify-center relative">
          <Sun size={14} />
          {/* Unread dot */}
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#E8DFC5]" />
        </div>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center font-meta text-sm italic"
          >
            <p>{currentSeason}</p>
            <p className="font-bold">{currentYear}</p>
            <p className="text-xs mt-1 text-ink/40">
              {logs.length} Memories
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

interface NavOrbProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  color?: string;
  onClick?: () => void;
  isExpanded?: boolean;
}

interface TabButtonProps {
  icon: ReactNode;
  active?: boolean;
  color?: string;
  onClick?: () => void;
}

function NavOrb({ icon, label, active, color, onClick }: NavOrbProps) {
  return (
    <div 
      className="group flex items-center gap-4 cursor-pointer relative"
      onClick={onClick}
      title={label}
    >
      <div className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 relative",
        "bg-[#F4EBD0] border border-[#D3C7A8] shadow-inner hover:scale-110",
        active && "text-magic border-magic shadow-[0_0_15px_rgba(212,175,55,0.3)]"
      )}
      style={active ? { color: color, borderColor: color } : {}}
      >
        {icon}
      </div>
    </div>
  )
}

function TabButton({ icon, active, onClick, color }: TabButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg transition-colors",
        active ? "bg-ink/5 text-ink" : "text-ink/40 hover:text-ink/70"
      )}
      style={active ? { color: color } : {}}
    >
      {icon}
    </button>
  )
}
