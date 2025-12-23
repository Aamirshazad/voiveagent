
import React from 'react';
import { Scenario } from '../types';

interface ScenarioCardProps {
  scenario: Scenario;
  isActive: boolean;
  onClick: () => void;
  icon: string;
}

const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, isActive, onClick, icon }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all border-2 w-full h-32 ${
        isActive 
          ? 'bg-blue-50 border-blue-500 shadow-md transform scale-105' 
          : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <span className="text-3xl mb-2">{icon}</span>
      <span className={`text-sm font-semibold text-center ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>
        {scenario}
      </span>
    </button>
  );
};

export default ScenarioCard;
