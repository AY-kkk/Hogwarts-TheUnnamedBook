
import { motion, AnimatePresence } from 'framer-motion';
import { type Log } from '../../lib/db';
import { Scroll, Trash2, X } from 'lucide-react';

interface ArchiveOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  logs: Log[];
  onDeleteLog: (id: number) => void;
  onClearAll: () => void;
  onRestartConversation: () => void;
  onContinueFromLog: (id: number) => Promise<void>;
}

export function ArchiveOverlay({
  isOpen,
  onClose,
  logs,
  onDeleteLog,
  onClearAll,
  onRestartConversation,
  onContinueFromLog
}: ArchiveOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Panel */}
          <motion.div 
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 w-full h-[80vh] bg-hogwarts-card border-b-4 border-magic-gold z-50 shadow-2xl flex flex-col"
          >
            <header className="flex items-center justify-between p-6 border-b border-white/10 bg-hogwarts-dark/50">
              <h2 className="font-title text-2xl text-magic-gold flex items-center gap-3">
                <Scroll className="text-magic-light" />
                冥想盆 (Memory Archive)
              </h2>
              <button onClick={onClose} className="text-parchment-300 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {logs.length === 0 ? (
                <div className="text-center text-parchment-300/50 py-20 italic">
                  记忆是一片空白...
                </div>
              ) : (
                logs.slice().reverse().map(log => (
                  <div key={log.id} className="bg-hogwarts-bg/50 p-4 rounded border border-white/5 hover:border-magic-gold/30 transition-colors group relative">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 text-xs text-magic-gold/70 font-ui">
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                        {log.type === 'ai' && <span className="rounded border border-magic-gold/30 px-1.5 py-0.5">AI 生成</span>}
                      </div>
                      <span className="text-xs text-parchment-300/30">
                        {new Blob([log.content]).size} bytes
                      </span>
                    </div>
                    <p className="text-parchment-100 font-body line-clamp-2 text-sm opacity-80">
                      {log.content.replace(/[#*]/g, '')}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!log.id) return;
                          if (!confirm("将从这段记忆继续对话（后续记忆不会删除，可随时在冥想盆查看），确定吗？")) return;
                          try {
                            await onContinueFromLog(log.id);
                            onClose();
                          } catch (err) {
                            console.error('Continue from log failed', err);
                            alert(err instanceof Error ? err.message : '从此继续失败，请稍后再试');
                          }
                        }}
                        aria-label="从此继续"
                        className="px-3 py-1 rounded border border-magic-gold/30 text-magic-gold hover:text-magic-light hover:border-magic-gold/60 hover:bg-magic-gold/10 transition-colors text-xs"
                      >
                        从此继续
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => log.id && onDeleteLog(log.id)}
                      className="absolute top-4 right-4 text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                      title="遗忘这段记忆"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <footer className="p-4 border-t border-white/10 bg-hogwarts-dark/50 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  if (confirm("确定要重新开始对话吗？将清空当前角色的对话记录。")) {
                    onRestartConversation();
                    onClose();
                  }
                }}
                aria-label="重新开始对话"
                className="flex items-center gap-2 text-magic-gold hover:text-magic-light px-4 py-2 rounded hover:bg-magic-gold/10 transition-colors text-sm"
              >
                <Scroll size={16} />
                重新开始对话
              </button>
              <button 
                onClick={() => {
                  if (confirm("确定要清空所有记忆吗？这将无法撤销！")) {
                    onClearAll();
                  }
                }}
                aria-label="清空全部记忆"
                className="flex items-center gap-2 text-red-400 hover:text-red-300 px-4 py-2 rounded hover:bg-red-900/20 transition-colors text-sm"
              >
                <Trash2 size={16} />
                清空全部记忆
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
