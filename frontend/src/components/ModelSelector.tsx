import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const MODELS = [
  { id: 'sonnet-4', label: 'Sonnet 4', badge: 'fast' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', badge: 'best' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', badge: null },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', badge: null },
  { id: 'deepseek3-2', label: 'DeepSeek 3.2', badge: null },
  { id: 'claude', label: 'Claude', badge: null },
  { id: 'llama3', label: 'Llama 3', badge: 'open' },
  { id: 'mistral-devstral-2', label: 'Mistral Devstral 2', badge: 'code' },
  { id: 'nova-lite', label: 'Nova Lite', badge: 'fast' },
  { id: 'nova-pro', label: 'Nova Pro', badge: null },
];

const ModelSelector: React.FC = () => {
  const { selectedModel, setSelectedModel } = useAppStore();

  const currentModel = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  return (
    <div className="relative">
      <div className="relative inline-flex items-center">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="appearance-none bg-[#1c2128] text-[#e6edf3] text-[11px] pl-2.5 pr-7 py-1.5 rounded-md border border-[#30363d] hover:border-[#484f58] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 outline-none transition-all duration-200 cursor-pointer font-medium"
        >
          {MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
              {model.badge ? ` (${model.badge})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          size={11}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none"
        />
      </div>
      {currentModel.badge && (
        <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-[#1f6feb22] text-[#58a6ff] font-medium uppercase tracking-wider">
          {currentModel.badge}
        </span>
      )}
    </div>
  );
};

export default ModelSelector;
