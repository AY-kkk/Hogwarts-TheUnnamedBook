import { motion, AnimatePresence } from 'framer-motion';
import { type Log } from '../../lib/db';
import { cn } from '../../lib/utils';
import { useEffect, useRef } from 'react';

interface NarrativeEngineProps {
  logs: Log[];
  loading: boolean;
}

export function NarrativeEngine({ logs, loading }: NarrativeEngineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // Use the last AI log ID as the trigger for page turn
  // When a new AI log is added or completes, we don't necessarily want to flip the whole page
  // But the requirement is "after each conversation".
  // Let's treat the entire log list as the "Page". 
  // But wait, flipping the whole list every time is jarring.
  // Maybe the user meant "flip" to reveal the NEW content?
  // Or "flip" to a new blank page?
  
  // Interpretation: The user wants a visual cue that feels like a page turn.
  // Since we have a scrolling history (infinite scroll), a full page turn clears history which is bad for context.
  // Let's implement a "Page Reveal" effect for the LATEST log entry.
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="w-full max-w-[800px] mx-auto pb-40 px-4 md:px-0 relative z-10 perspective-[2000px]">
      <AnimatePresence initial={false}>
        {logs.map((log) => (
          <motion.div
            key={log.id}
            initial={{ 
              opacity: 0, 
              rotateX: 90, // Fold out from paper
              y: 20,
              filter: "blur(4px)"
            }}
            animate={{ 
              opacity: 1, 
              rotateX: 0, 
              y: 0,
              filter: "blur(0px)"
            }}
            transition={{ 
              duration: 0.8, 
              ease: [0.16, 1, 0.3, 1], // easeOutExpo
              delay: 0.1
            }}
            className={cn(
              "mb-12 relative font-body text-xl leading-[1.8] origin-top",
              log.type === 'user' ? "pl-8 border-l-2 border-magic/30 italic text-ink/80" : "text-ink text-ink-bleed"
            )}
          >
            {log.type === 'ai' || log.type === 'system' ? (
              <RenderMarkdown content={log.content} />
            ) : (
              <p>{log.content}</p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      
      {loading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center my-8"
        >
          <div className="w-2 h-2 bg-ink rounded-full animate-bounce [animation-delay:-0.3s] mx-1"></div>
          <div className="w-2 h-2 bg-ink rounded-full animate-bounce [animation-delay:-0.15s] mx-1"></div>
          <div className="w-2 h-2 bg-ink rounded-full animate-bounce mx-1"></div>
        </motion.div>
      )}
      
      <div ref={bottomRef} />
    </div>
  );
}

function RenderMarkdown({ content }: { content: string }) {
  // Simple markdown renderer for the demo
  // In production, use react-markdown or similar
  
  // Split by double newline for paragraphs
  const paragraphs = content.split('\n\n');

  return (
    <>
      {paragraphs.map((p, i) => {
        // Check for Headers
        if (p.startsWith('## ')) {
          return (
            <h2 key={i} className="font-title text-3xl text-blood mt-12 mb-6 border-b border-ink/10 pb-4 tracking-widest uppercase">
              {p.replace('## ', '')}
            </h2>
          );
        }
        
        // Check for System Hints (Italic)
        if (p.startsWith('*') && p.endsWith('*')) {
           return (
             <p key={i} className="font-meta text-sm text-ink/50 italic text-center my-4">
               {p.replace(/\*/g, '')}
             </p>
           )
        }

        // Regular Paragraph with Drop Cap logic for the first paragraph of a chapter?
        // For now just regular p
        return <p key={i} className="mb-6 indent-8 text-justify">{p}</p>;
      })}
    </>
  );
}
