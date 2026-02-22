import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode, Key } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  trigger: Key; // Value that triggers the transition when changed
}

export function PageTransition({ children, trigger }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={trigger}
        className="origin-left w-full"
        initial={{ 
          opacity: 0, 
          rotateY: -15, 
          filter: "blur(2px)",
          x: 20
        }}
        animate={{ 
          opacity: 1, 
          rotateY: 0, 
          filter: "blur(0px)",
          x: 0 
        }}
        exit={{ 
          opacity: 0, 
          rotateY: 10,
          filter: "blur(2px)",
          x: -20
        }}
        transition={{ 
          duration: 0.8, 
          ease: [0.22, 1, 0.36, 1] // Custom ease-out-quint for paper feel
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
