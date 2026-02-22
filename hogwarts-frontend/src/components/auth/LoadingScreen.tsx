
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HouseCrest } from '../ui/HouseCrest';

interface LoadingScreenProps {
  onComplete: () => void;
}

const LOADING_TEXTS = [
  "正在整理分院帽的思绪...",
  "正在擦拭魔杖...",
  "正在打开活点地图...",
  "正在呼唤守护神..."
];

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        // Random increment
        return prev + Math.random() * 5;
      });
    }, 100);

    const textTimer = setInterval(() => {
      setTextIndex(prev => (prev + 1) % LOADING_TEXTS.length);
    }, 1500);

    return () => {
      clearInterval(timer);
      clearInterval(textTimer);
    };
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      setTimeout(onComplete, 500);
    }
  }, [progress, onComplete]);

  return (
    <div className="fixed inset-0 bg-hogwarts-bg z-50 flex flex-col items-center justify-center text-parchment-100 font-title">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <HouseCrest house="Hogwarts" className="w-32 h-32 opacity-80" />
      </motion.div>

      <motion.div
        key={textIndex}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="text-xl mb-6 tracking-widest text-magic-gold"
      >
        {LOADING_TEXTS[textIndex]}
      </motion.div>

      {/* Magic Progress Bar */}
      <div className="w-64 h-1 bg-hogwarts-dark rounded-full overflow-hidden border border-white/10 relative">
        <motion.div 
          className="h-full bg-gradient-to-r from-magic-dark via-magic-gold to-magic-light shadow-[0_0_10px_#C5A059]"
          style={{ width: `${progress}%` }}
        />
        {/* Particle effect could go here */}
      </div>
      
      <div className="mt-2 text-xs text-parchment-300 font-ui">
        {Math.floor(progress)}%
      </div>
    </div>
  );
}
