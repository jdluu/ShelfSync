import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface RoleSelectionProps {
  onSelect: (role: 'host' | 'client') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">ShelfSync</h1>
          <p className="text-slate-400">Choose your device role</p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => onSelect('host')}
            className="group flex flex-col items-center gap-4 p-8 bg-slate-800 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500 rounded-2xl transition-all text-left"
          >
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <Monitor className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold">Host (Desktop)</h3>
              <p className="text-sm text-slate-400">Share your Calibre library with other devices.</p>
            </div>
          </button>

          <button
            onClick={() => onSelect('client')}
            className="group flex flex-col items-center gap-4 p-8 bg-slate-800 hover:bg-green-600/20 border border-slate-700 hover:border-green-500 rounded-2xl transition-all text-left"
          >
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
              <Smartphone className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold">Client (Mobile)</h3>
              <p className="text-sm text-slate-400">Sync and download books from a ShelfSync host.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
