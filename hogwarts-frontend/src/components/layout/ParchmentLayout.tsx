import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { HOUSE_CONFIG, DEFAULT_THEME } from '../../lib/constants';

interface ParchmentLayoutProps {
  children: React.ReactNode;
  className?: string;
  isMemoryBarExpanded: boolean;
  house?: string;
  onBackToMain?: () => void;
}

export function ParchmentLayout({ children, className, isMemoryBarExpanded, house, onBackToMain }: ParchmentLayoutProps) {
  // Use House Config for theme, fallback to default if no house or unknown house
  const theme = house ? (HOUSE_CONFIG[house] || DEFAULT_THEME) : DEFAULT_THEME;
  const accentColor = theme.primary;

  return (
    <div className="relative min-h-screen w-full bg-[#E8DFC5] overflow-hidden">
      {/* Background Texture */}
      <div 
        className="absolute inset-0 bg-noise opacity-[0.05] pointer-events-none z-0"
      />
      
      {/* Main Content Area */}
      <motion.main 
        className={cn(
          "relative z-10 h-full min-h-screen flex flex-col pt-20 transition-all duration-300 ease-in-out",
          isMemoryBarExpanded ? "ml-[360px]" : "ml-[80px]"
        )}
      >
        {/* Book Spine Shadow with House Tint */}
        <div 
          className="fixed top-0 left-0 w-12 h-full pointer-events-none z-20" 
          style={{
            background: `linear-gradient(to right, ${accentColor}20, transparent)`
          }}
        />

        {/* Game Title Header */}
        <div className="absolute top-8 w-full text-center z-30 pointer-events-none opacity-40">
           <h1 className="font-title text-xl tracking-[0.2em] text-ink uppercase">
             Hogwarts: The Nameless Book
           </h1>
           <div className="w-24 h-[1px] bg-ink/30 mx-auto mt-2" />
        </div>

        {onBackToMain && (
          <button
            type="button"
            onClick={onBackToMain}
            aria-label="返回主界面"
            className="fixed top-6 right-6 z-[60] pointer-events-auto px-4 py-2 rounded-full border border-ink/20 bg-[#F4EBD0]/90 text-ink/80 hover:text-ink hover:bg-[#F4EBD0] transition-colors shadow-lg font-ui text-sm"
          >
            返回主界面
          </button>
        )}
        
        <div className={cn("max-w-4xl mx-auto px-8 md:px-12 w-full pt-12", className)}>
           {children}
        </div>
      </motion.main>
    </div>
  );
}
