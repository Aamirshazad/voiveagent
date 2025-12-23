
import React from 'react';
import { LearningModule } from '../types';
import { MODULE_DESCRIPTIONS } from '../constants';

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
      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 border group relative overflow-hidden text-left shadow-sm hover:shadow-md ${isActive
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400 shadow-lg shadow-emerald-500/20'
          : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
        }`}
    >
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r-full"></div>}

      <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl transition-all duration-200 ${isActive
          ? 'bg-white/20 border-2 border-white/40 backdrop-blur-sm shadow-lg'
          : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 group-hover:border-emerald-300 group-hover:scale-110'
        }`}>
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className={`text-sm font-bold leading-tight ${isActive ? 'text-white' : 'text-slate-800'}`}>
            {module}
          </p>
          {isActive && (
            <span className="px-2 py-0.5 bg-white/30 backdrop-blur-sm text-white text-xs font-semibold rounded-full border border-white/40">
              Active
            </span>
          )}
        </div>
        <p className={`text-xs leading-tight ${isActive ? 'text-emerald-50' : 'text-slate-500'}`}>
          {MODULE_DESCRIPTIONS[module]}
        </p>
      </div>

      {!isActive && (
        <div className="text-slate-300 group-hover:text-emerald-500 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </button>
  );
};

export default ModuleCard;
