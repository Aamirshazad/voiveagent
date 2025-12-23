
import React from 'react';
import { LearningModule } from '../types';

interface ModuleCardProps {
  module: LearningModule;
  isActive: boolean;
  onClick: () => void;
  icon: string;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ module, isActive, onClick, icon }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-5 p-5 rounded-2xl transition-all border-2 w-full text-left group relative overflow-hidden ${
        isActive 
          ? 'bg-blue-600 border-blue-500 shadow-2xl shadow-blue-600/20 transform translate-x-2' 
          : 'bg-slate-800/40 border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800'
      }`}
    >
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-white"></div>}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all duration-300 ${isActive ? 'bg-white/20 rotate-3 scale-110' : 'bg-slate-700 group-hover:bg-blue-500/10'}`}>
        {icon}
      </div>
      <div>
        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
          Career Track
        </p>
        <p className={`text-[14px] font-black leading-tight tracking-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>
          {module}
        </p>
      </div>
    </button>
  );
};

export default ModuleCard;
