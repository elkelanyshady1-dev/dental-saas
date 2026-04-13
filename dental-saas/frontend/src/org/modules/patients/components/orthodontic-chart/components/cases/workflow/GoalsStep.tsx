import React, { useState } from 'react';
import { 
  Target, Plus, Trash2,
  ArrowRight, Sparkles,
  GripVertical, Flag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecordSet } from '../../../types';

export interface TreatmentGoal {
  id: string;
  description: string;
  category: 'skeletal' | 'dental' | 'soft-tissue' | 'functional' | 'esthetic';
  priority: 'high' | 'medium' | 'low';
  linkedProblem: string;
  source: 'auto' | 'manual';
}

interface GoalsStepProps {
  data: RecordSet;
  goals: TreatmentGoal[];
  onGoalsChange: (goals: TreatmentGoal[]) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  skeletal:     { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100' },
  dental:       { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100' },
  'soft-tissue': { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
  functional:   { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-100' },
  esthetic:     { bg: 'bg-pink-50',   text: 'text-pink-600',   border: 'border-pink-100' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-500',
  low:    'bg-slate-400',
};

const GoalsStep: React.FC<GoalsStepProps> = ({ data, goals, onGoalsChange }) => {
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState<TreatmentGoal['category']>('dental');
  const [newGoalPriority, setNewGoalPriority] = useState<TreatmentGoal['priority']>('medium');

  const handleAddGoal = () => {
    if (!newGoalDesc.trim()) return;
    const newGoal: TreatmentGoal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      description: newGoalDesc.trim(),
      category: newGoalCategory,
      priority: newGoalPriority,
      linkedProblem: '',
      source: 'manual',
    };
    onGoalsChange([...goals, newGoal]);
    setNewGoalDesc('');
  };

  const handleRemoveGoal = (id: string) => {
    onGoalsChange(goals.filter(g => g.id !== id));
  };

  const handlePriorityChange = (id: string, priority: TreatmentGoal['priority']) => {
    onGoalsChange(goals.map(g => g.id === id ? { ...g, priority } : g));
  };

  const handleAutoGenerate = () => {
    const problemList = data.problemList;
    if (!problemList) return;

    const autoGoals: TreatmentGoal[] = [];
    const dev = problemList.developmental;

    if (dev?.apProblems?.skeletal === 'class2') {
      autoGoals.push({
        id: `auto-${Date.now()}-1`,
        description: 'Correct Class II skeletal discrepancy',
        category: 'skeletal',
        priority: 'high',
        linkedProblem: 'Skeletal Class II',
        source: 'auto',
      });
    }
    if (dev?.apProblems?.skeletal === 'class3') {
      autoGoals.push({
        id: `auto-${Date.now()}-2`,
        description: 'Address Class III skeletal relationship',
        category: 'skeletal',
        priority: 'high',
        linkedProblem: 'Skeletal Class III',
        source: 'auto',
      });
    }
    if (dev?.verticalProblems?.skeletal === 'deep-bite') {
      autoGoals.push({
        id: `auto-${Date.now()}-3`,
        description: 'Correct deep bite to achieve normal overbite',
        category: 'skeletal',
        priority: 'high',
        linkedProblem: 'Deep bite',
        source: 'auto',
      });
    }
    if (dev?.verticalProblems?.skeletal === 'open-bite') {
      autoGoals.push({
        id: `auto-${Date.now()}-4`,
        description: 'Close anterior open bite',
        category: 'skeletal',
        priority: 'high',
        linkedProblem: 'Open bite',
        source: 'auto',
      });
    }
    if (dev?.transverse?.skeletal) {
      autoGoals.push({
        id: `auto-${Date.now()}-5`,
        description: 'Resolve transverse skeletal discrepancy',
        category: 'skeletal',
        priority: 'medium',
        linkedProblem: 'Transverse discrepancy',
        source: 'auto',
      });
    }
    if (dev?.spaceEruption?.maxilla?.toLowerCase().includes('crowd') || 
        dev?.spaceEruption?.mandible?.toLowerCase().includes('crowd')) {
      autoGoals.push({
        id: `auto-${Date.now()}-6`,
        description: 'Relieve dental crowding and achieve alignment',
        category: 'dental',
        priority: 'high',
        linkedProblem: 'Crowding',
        source: 'auto',
      });
    }
    if (dev?.functional && !dev.functional.none) {
      autoGoals.push({
        id: `auto-${Date.now()}-7`,
        description: 'Restore functional occlusion',
        category: 'functional',
        priority: 'medium',
        linkedProblem: 'Functional problem',
        source: 'auto',
      });
    }

    // Merge: don't duplicate goals with same description
    const existingDescs = new Set(goals.map(g => g.description.toLowerCase()));
    const uniqueAutoGoals = autoGoals.filter(g => !existingDescs.has(g.description.toLowerCase()));
    onGoalsChange([...goals, ...uniqueAutoGoals]);
  };

  const sortedGoals = [...goals].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-600/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Treatment Goals</h3>
              <p className="text-indigo-200 text-xs">Define objectives based on identified problems</p>
            </div>
          </div>
          <button
            onClick={handleAutoGenerate}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-bold transition-all backdrop-blur-sm border border-white/10"
          >
            <Sparkles className="w-4 h-4" />
            Auto-Generate from Problems
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-4">
          {(['skeletal', 'dental', 'functional', 'esthetic'] as const).map(cat => {
            const count = goals.filter(g => g.category === cat).length;
            return (
              <div key={cat} className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-lg font-bold">{count}</span>
                <p className="text-[9px] text-indigo-200 uppercase tracking-widest mt-0.5 capitalize">{cat}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Goal List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Flag className="w-4 h-4 text-indigo-500" />
            Defined Goals ({goals.length})
          </h4>
        </div>

        <AnimatePresence>
          {sortedGoals.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                <Target className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-500 mb-1">No Goals Defined</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                Use "Auto-Generate from Problems" or add goals manually below.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {sortedGoals.map((goal, index) => {
                const catStyle = CATEGORY_COLORS[goal.category] || CATEGORY_COLORS.dental;
                return (
                  <motion.div
                    key={goal.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors group"
                  >
                    <GripVertical className="w-4 h-4 text-slate-300" />
                    <div className={`w-2 h-8 rounded-full ${PRIORITY_COLORS[goal.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700 truncate">{goal.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                          {goal.category}
                        </span>
                        {goal.linkedProblem && (
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <ArrowRight className="w-2.5 h-2.5" />
                            {goal.linkedProblem}
                          </span>
                        )}
                        {goal.source === 'auto' && (
                          <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            AUTO
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(['high', 'medium', 'low'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => handlePriorityChange(goal.id, p)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-bold uppercase transition-all border ${
                            goal.priority === p
                              ? `${PRIORITY_COLORS[p]} text-white border-transparent`
                              : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                          }`}
                          title={`Set ${p} priority`}
                        >
                          {p[0].toUpperCase()}
                        </button>
                      ))}
                      <button
                        onClick={() => handleRemoveGoal(goal.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Goal Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Plus className="w-3 h-3" />
          Add Custom Goal
        </h4>
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            type="text"
            value={newGoalDesc}
            onChange={(e) => setNewGoalDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
            placeholder="Describe treatment goal..."
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          />
          <select
            value={newGoalCategory}
            onChange={(e) => setNewGoalCategory(e.target.value as TreatmentGoal['category'])}
            className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          >
            <option value="skeletal">Skeletal</option>
            <option value="dental">Dental</option>
            <option value="soft-tissue">Soft Tissue</option>
            <option value="functional">Functional</option>
            <option value="esthetic">Esthetic</option>
          </select>
          <select
            value={newGoalPriority}
            onChange={(e) => setNewGoalPriority(e.target.value as TreatmentGoal['priority'])}
            className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          >
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <button
            onClick={handleAddGoal}
            disabled={!newGoalDesc.trim()}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md shadow-indigo-600/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Goal
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalsStep;
