
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
      className={`w-full flex items-center gap-3.5 p-3.5 rounded-lg transition-all duration-200 border group relative overflow-hidden text-left ${
        isActive 
          ? 'bg-indigo-600/10 border-indigo-500/40 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]' 
          : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
      }`}
    >
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500"></div>}
      
      <div className={`w-9 h-9 rounded flex-shrink-0 flex items-center justify-center text-lg transition-colors border ${
        isActive 
          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-200' 
          : 'bg-slate-950 border-slate-800 text-slate-500 group-hover:text-indigo-400 group-hover:border-slate-700'
      }`}>
        {icon}
      </div>
      
      <div>
        <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>
          Module
        </p>
        <p className={`text-[13px] font-medium leading-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>
          {module}
        </p>
      </div>
    </button>
  );
};

export default ModuleCard;
