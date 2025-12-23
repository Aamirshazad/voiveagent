
import React, { useEffect, useState } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  isSpeaking: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, isSpeaking }) => {
  const [bars, setBars] = useState<number[]>(new Array(15).fill(4));

  useEffect(() => {
    if (!isActive) {
      setBars(new Array(15).fill(4));
      return;
    }

    const interval = setInterval(() => {
      setBars(bars.map(() => Math.max(4, Math.random() * (isSpeaking ? 40 : 15))));
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, isSpeaking]);

  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`wave-bar w-1 rounded-full ${isActive ? 'bg-blue-500' : 'bg-slate-300'}`}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
};

export default AudioVisualizer;
