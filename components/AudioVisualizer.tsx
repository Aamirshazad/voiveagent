
import React, { useEffect, useState } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  isSpeaking: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, isSpeaking }) => {
  // Using more bars for a denser "high-tech" look
  const [bars, setBars] = useState<number[]>(new Array(24).fill(4));

  useEffect(() => {
    if (!isActive) {
      setBars(new Array(24).fill(4));
      return;
    }

    const interval = setInterval(() => {
      setBars(prev => prev.map(() => {
        const baseHeight = isSpeaking ? 16 : 6;
        const variance = isSpeaking ? 32 : 8;
        return Math.max(4, baseHeight + Math.random() * variance);
      }));
    }, 80); // Faster refresh for smoother look

    return () => clearInterval(interval);
  }, [isActive, isSpeaking]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-16 w-full opacity-90">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-all duration-150 ease-out ${
            isActive 
              ? isSpeaking ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]' : 'bg-emerald-500/50' 
              : 'bg-slate-800'
          }`}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
};

export default AudioVisualizer;
