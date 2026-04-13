import React, { useState } from 'react';
import { 
  GitBranch, Plus, Trash2, CheckCircle2,
  Clock, ThumbsUp, ThumbsDown, Star,
  Zap, Shield, DollarSign, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TreatmentGoal } from './GoalsStep';

export interface TreatmentOption {
  id: string;
  title: string;
  description: string;
  approach: 'conservative' | 'moderate' | 'aggressive' | 'surgical' | 'custom';
  pros: string[];
  cons: string[];
  estimatedDuration: string;
  complexity: 'low' | 'medium' | 'high';
  isRecommended: boolean;
}

interface TreatmentOptionsStepProps {
  goals: TreatmentGoal[];
  options: TreatmentOption[];
  selectedOptionId: string | null;
  onOptionsChange: (options: TreatmentOption[]) => void;
  onSelectOption: (id: string) => void;
}

const APPROACH_STYLES: Record<string, { gradient: string; text: string; icon: React.ElementType }> = {
  conservative: { gradient: 'from-emerald-500 to-emerald-600', text: 'text-emerald-600', icon: Shield },
  moderate:     { gradient: 'from-blue-500 to-blue-600',   text: 'text-blue-600',   icon: Zap },
  aggressive:   { gradient: 'from-orange-500 to-orange-600', text: 'text-orange-600', icon: Zap },
  surgical:     { gradient: 'from-red-500 to-red-600',     text: 'text-red-600',     icon: Star },
  custom:       { gradient: 'from-purple-500 to-purple-600', text: 'text-purple-600', icon: GitBranch },
};

const DEFAULT_OPTIONS: TreatmentOption[] = [
  {
    id: 'opt-conservative',
    title: 'Conservative Approach',
    description: 'Non-extraction treatment with expansion and alignment. Minimal intervention with focus on natural growth guidance.',
    approach: 'conservative',
    pros: ['Preserves all teeth', 'Lower patient discomfort', 'Shorter active treatment'],
    cons: ['May not fully resolve crowding', 'Higher relapse risk', 'Limited skeletal correction'],
    estimatedDuration: '18-24 months',
    complexity: 'low',
    isRecommended: false,
  },
  {
    id: 'opt-moderate',
    title: 'Moderate Approach',
    description: 'Fixed appliance therapy with possible IPR or selective extraction. Balanced approach for comprehensive correction.',
    approach: 'moderate',
    pros: ['Good skeletal correction', 'Balanced outcome', 'Predictable results'],
    cons: ['Longer treatment time', 'Extraction may be needed', 'More appointments'],
    estimatedDuration: '24-30 months',
    complexity: 'medium',
    isRecommended: true,
  },
  {
    id: 'opt-aggressive',
    title: 'Comprehensive Approach',
    description: 'Full fixed appliances with extraction, TADs, or orthognathic consideration for maximum correction.',
    approach: 'aggressive',
    pros: ['Maximum correction possible', 'Stable long-term result', 'Addresses all problems'],
    cons: ['Longer treatment', 'Higher cost', 'More complex mechanics'],
    estimatedDuration: '30-36 months',
    complexity: 'high',
    isRecommended: false,
  },
];

const TreatmentOptionsStep: React.FC<TreatmentOptionsStepProps> = ({
  goals,
  options,
  selectedOptionId,
  onOptionsChange,
  onSelectOption,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customDuration, setCustomDuration] = useState('');

  const handleSeedDefaults = () => {
    const existingIds = new Set(options.map(o => o.id));
    const newDefaults = DEFAULT_OPTIONS.filter(d => !existingIds.has(d.id));
    if (newDefaults.length > 0) {
      onOptionsChange([...options, ...newDefaults]);
    }
  };

  const handleAddCustom = () => {
    if (!customTitle.trim()) return;
    const newOption: TreatmentOption = {
      id: `opt-custom-${Date.now()}`,
      title: customTitle.trim(),
      description: customDesc.trim(),
      approach: 'custom',
      pros: [],
      cons: [],
      estimatedDuration: customDuration || 'TBD',
      complexity: 'medium',
      isRecommended: false,
    };
    onOptionsChange([...options, newOption]);
    setCustomTitle('');
    setCustomDesc('');
    setCustomDuration('');
    setShowAddForm(false);
  };

  const handleRemoveOption = (id: string) => {
    onOptionsChange(options.filter(o => o.id !== id));
    if (selectedOptionId === id) {
      onSelectOption('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Treatment Options</h3>
              <p className="text-slate-400 text-xs">Compare approaches to address {goals.length} defined goal{goals.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {options.length === 0 && (
              <button
                onClick={handleSeedDefaults}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-xl text-xs font-bold transition-all border border-blue-400/20"
              >
                <Zap className="w-4 h-4" />
                Generate Standard Options
              </button>
            )}
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10"
            >
              <Plus className="w-4 h-4" />
              Custom Option
            </button>
          </div>
        </div>
        {selectedOptionId && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-300">
              Selected: {options.find(o => o.id === selectedOptionId)?.title}
            </span>
          </div>
        )}
      </div>

      {/* Add Custom Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-700">Add Custom Treatment Option</h4>
                <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Option title..."
                  className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                <input
                  type="text"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="Description..."
                  className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="Duration (e.g., 24 months)"
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <button
                    onClick={handleAddCustom}
                    disabled={!customTitle.trim()}
                    className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all disabled:opacity-50 shadow-md"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Options Grid */}
      {options.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
            <GitBranch className="w-8 h-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-500 mb-1">No Treatment Options</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Generate standard options or create a custom treatment option.
          </p>
          <button
            onClick={handleSeedDefaults}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md"
          >
            <Zap className="w-4 h-4" />
            Generate Standard Options
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {options.map((option, index) => {
            const isSelected = selectedOptionId === option.id;
            const style = APPROACH_STYLES[option.approach] || APPROACH_STYLES.custom;
            const ApproachIcon = style.icon;

            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`
                  bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all cursor-pointer group
                  ${isSelected 
                    ? 'border-blue-500 shadow-lg shadow-blue-500/10 ring-2 ring-blue-500/20' 
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                  }
                `}
                onClick={() => onSelectOption(option.id)}
              >
                {/* Header */}
                <div className={`bg-gradient-to-r ${style.gradient} p-4 relative`}>
                  {option.isRecommended && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-md text-[8px] font-bold uppercase tracking-wider text-white border border-white/20">
                      ★ Recommended
                    </span>
                  )}
                  <div className="flex items-center gap-3 text-white">
                    <ApproachIcon className="w-5 h-5" />
                    <div>
                      <h4 className="font-bold text-sm">{option.title}</h4>
                      <p className="text-[10px] opacity-80 capitalize">{option.approach} approach</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">{option.description}</p>

                  {/* Duration + Complexity */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-bold">{option.estimatedDuration}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span className="font-bold capitalize">{option.complexity} cost</span>
                    </div>
                  </div>

                  {/* Pros */}
                  {option.pros.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Advantages</span>
                      {option.pros.map((pro, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                          <ThumbsUp className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                          <span>{pro}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cons */}
                  {option.cons.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Considerations</span>
                      {option.cons.map((con, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                          <ThumbsDown className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                          <span>{con}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Select Button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveOption(option.id); }}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className={`
                      flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                      ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}
                    `}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isSelected ? 'Selected' : 'Select This Option'}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TreatmentOptionsStep;
