import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth mouse movement for parallax
  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  // Parallax transform values
  const bgX = useTransform(smoothX, [-0.5, 0.5], ['-2%', '2%']);
  const bgY = useTransform(smoothY, [-0.5, 0.5], ['-2%', '2%']);
  
  const midX = useTransform(smoothX, [-0.5, 0.5], ['-5%', '5%']);
  const midY = useTransform(smoothY, [-0.5, 0.5], ['-5%', '5%']);
  
  const frontX = useTransform(smoothX, [-0.5, 0.5], ['-8%', '8%']);
  const frontY = useTransform(smoothY, [-0.5, 0.5], ['-8%', '8%']);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY, currentTarget } = e;
    const { width, height } = currentTarget.getBoundingClientRect();
    
    // Normalize coordinates to -0.5 to 0.5
    const x = (clientX / width) - 0.5;
    const y = (clientY / height) - 0.5;
    
    mouseX.set(x);
    mouseY.set(y);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-[#0a0a12] cursor-none"
      onMouseMove={handleMouseMove}
    >
      {/* --- Layer 1: Background (Sky/Castle Silhouette) --- */}
      <motion.div 
        className="absolute inset-[-5%] w-[110%] h-[110%] bg-cover bg-center bg-no-repeat z-0 opacity-80"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1547756536-cde3673fa2e5?q=80&w=2641&auto=format&fit=crop")', // Misty mountains/castle vibe
          x: bgX, 
          y: bgY,
          filter: 'brightness(0.6) contrast(1.2) sepia(0.2) hue-rotate(200deg)'
        }}
      />
      
      {/* Fog Overlay 1 */}
      <motion.div
        className="absolute inset-0 z-10 opacity-30 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent 40%, #0a0a12 100%)',
        }}
      />

      {/* --- Layer 2: Midground (Floating Rocks / Magic Particles) --- */}
      <motion.div 
        className="absolute inset-[-5%] w-[110%] h-[110%] z-20 pointer-events-none"
        style={{ x: midX, y: midY }}
      >
        {/* Simulated particles/magic dust */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-purple-400 rounded-full blur-[2px] opacity-60 animate-pulse" />
        <div className="absolute top-1/3 right-1/3 w-3 h-3 bg-blue-300 rounded-full blur-[4px] opacity-40 animate-pulse delay-700" />
        <div className="absolute bottom-1/3 left-1/2 w-1 h-1 bg-white rounded-full blur-[1px] opacity-80 animate-ping delay-1000" />
      </motion.div>

      {/* --- Layer 3: Foreground (Wizard / Cliff) --- */}
      {/* Using a gradient mask to simulate standing on a cliff edge looking out */}
      <motion.div 
        className="absolute bottom-0 left-0 right-0 h-[40vh] z-30 pointer-events-none"
        style={{ x: frontX, y: frontY }}
      >
        <div className="w-full h-full bg-gradient-to-t from-black via-[#0a0a12] to-transparent opacity-90" />
        {/* Wizard Silhouette (CSS Shape) */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-32 h-64 bg-black opacity-80 blur-[1px] rounded-t-full" 
             style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}>
           {/* Cape flow */}
           <div className="absolute bottom-10 -right-10 w-20 h-40 bg-black opacity-60 blur-md transform rotate-12" />
        </div>
      </motion.div>

      {/* --- UI Content --- */}
      <div className="relative z-40 flex flex-col items-center justify-center h-full text-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
          className="mb-8"
        >
          <h2 className="text-xl md:text-2xl text-blue-200/60 font-serif tracking-[0.5em] uppercase mb-4 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
            Welcome to
          </h2>
          <h1 className="text-5xl md:text-8xl font-serif text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500 tracking-wider drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] filter brightness-125">
            Hogwarts<br/>Simulator
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
        >
          <button
            onClick={onEnter}
            className="group relative px-12 py-4 bg-transparent overflow-hidden rounded-full border border-white/20 hover:border-white/50 transition-all duration-500 ease-out"
          >
            {/* Button Background Glow */}
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Button Text */}
            <span className="relative z-10 flex items-center gap-3 text-lg font-serif text-gray-300 group-hover:text-white tracking-widest uppercase transition-colors duration-300">
              Begin Journey
              <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform duration-300" />
            </span>
            
            {/* Shine Effect */}
            <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
          </button>
        </motion.div>
      </div>

      {/* Custom Cursor Follower */}
      <CustomCursor />
      
      {/* Noise Overlay */}
      <div className="absolute inset-0 z-50 pointer-events-none opacity-[0.03] mix-blend-overlay"
           style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
    </div>
  );
};

// Custom Magic Cursor Component
const CustomCursor = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const updateCursor = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', updateCursor);
    return () => window.removeEventListener('mousemove', updateCursor);
  }, []);

  return (
    <div 
      className="fixed top-0 left-0 w-8 h-8 pointer-events-none z-[100] mix-blend-screen"
      style={{ 
        transform: `translate(${position.x - 16}px, ${position.y - 16}px)`
      }}
    >
      <div className="absolute inset-0 bg-blue-400 rounded-full blur-[8px] opacity-50 animate-pulse" />
      <div className="absolute inset-2 bg-white rounded-full blur-[2px] opacity-80" />
    </div>
  );
};

export default LandingPage;
