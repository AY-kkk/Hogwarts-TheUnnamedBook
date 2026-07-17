import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface QuillInputProps {
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  loading: boolean;
}

export function QuillInput({ input, setInput, onSend, loading }: QuillInputProps) {
  return (
    <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-parchment via-parchment to-transparent pb-8 pt-20 z-50">
      <div className="max-w-[800px] mx-auto relative px-4">
        {/* Ink Line */}
        <motion.div 
          className="absolute top-0 left-0 h-[2px] w-full bg-ink/20"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />
        
        {/* Input Area */}
        <div className="relative flex items-end gap-4">
           <textarea
             value={input}
             onChange={(e) => setInput(e.target.value)}
             maxLength={2000}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault();
                 onSend();
               }
             }}
             placeholder="挥动魔杖，书写你的行动..."
             className="w-full bg-transparent border-b-2 border-ink/30 focus:border-magic outline-none font-body text-xl py-4 pr-12 resize-none placeholder:text-ink/30 placeholder:italic transition-colors min-h-[60px] max-h-[120px]"
             disabled={loading}
           />
           
           <button
             onClick={onSend}
             disabled={loading || !input.trim()}
             className="mb-4 p-3 rounded-full bg-ink text-parchment hover:bg-magic hover:text-ink transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg"
           >
             <Send size={20} className="group-hover:rotate-45 transition-transform" />
           </button>
        </div>
        
        {/* Loading Indicator (Quill Animation placeholder) */}
        {loading && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 font-meta text-sm text-ink/40 italic animate-pulse">
            The quill is scratching...
          </div>
        )}
      </div>
    </div>
  );
}
