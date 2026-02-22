
import { motion, AnimatePresence } from 'framer-motion';
import { HOUSE_CONFIG, DEFAULT_THEME } from '../../lib/constants';
import { Shield } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HouseCrestProps {
  house?: string;
  className?: string;
}

export function HouseCrest({ house, className }: HouseCrestProps) {
  // Determine the theme based on the house
  // If house is undefined/empty, we don't show anything (as per requirement 1)
  // If house is provided but not in config, we show default grey placeholder (as per requirement 7)
  
  const getTheme = () => {
    if (!house) return null; // No house selected
    const theme = HOUSE_CONFIG[house];
    if (theme) return theme;
    return DEFAULT_THEME; // Unknown house -> Default theme
  };

  const theme = getTheme();

  return (
    <div className={cn("relative w-24 h-24 flex items-center justify-center", className)}>
      <AnimatePresence mode="wait">
        {theme ? (
          <motion.div
            key={house || 'unknown'}
            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
            transition={{ duration: 0.3 }} // 300ms transition
            className="relative w-full h-full flex items-center justify-center"
          >
            {/* Background Glow */}
            <div 
              className="absolute inset-0 rounded-full opacity-20 blur-xl"
              style={{ backgroundColor: theme.primary }}
            />

            {/* Crest Image or Placeholder */}
            {theme.crest ? (
              <img 
                src={theme.crest} 
                alt={`${house} Crest`} 
                className="w-full h-full object-contain drop-shadow-lg"
                onError={(e) => {
                  // Fallback if image fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('fallback-active');
                }}
              />
            ) : (
              // Default Grey Placeholder (SVG)
              <Shield 
                className="w-full h-full text-gray-400 opacity-50" 
                strokeWidth={1}
              />
            )}
            
            {/* Fallback for image error (handled via CSS class logic above or conditional rendering) */}
            {/* We can also just render the Shield if theme is DEFAULT_THEME */}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
