import React from 'react';
import { 
  Camera, BarChart3, AlertCircle, Target, 
  GitBranch, CheckCircle2, Check 
} from 'lucide-react';
import { motion } from 'motion/react';

export interface WorkflowStep {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 'records',  label: 'Records',   icon: Camera,       description: 'Capture photos, X-rays & STL scans' },
  { id: 'analysis', label: 'Analysis',  icon: BarChart3,    description: 'Review cephalometric & clinical analysis' },
  { id: 'problems', label: 'Problems',  icon: AlertCircle,  description: 'Define pathological & developmental problems' },
  { id: 'goals',    label: 'Goals',     icon: Target,       description: 'Set treatment objectives from problems' },
  { id: 'options',  label: 'Options',   icon: GitBranch,    description: 'Compare treatment approaches' },
  { id: 'final',    label: 'Final Plan', icon: CheckCircle2, description: 'Finalize & approve treatment plan' },
];

interface WorkflowStepperProps {
  currentStep: number;
  completedSteps: boolean[];
  onStepClick: (index: number) => void;
}

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ 
  currentStep, 
  completedSteps, 
  onStepClick 
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 lg:p-6">
      <div className="flex items-center justify-between overflow-x-auto scrollbar-hide gap-1">
        {WORKFLOW_STEPS.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = completedSteps[index];
          const isPast = index < currentStep;
          const isClickable = index <= currentStep || isCompleted;
          const Icon = step.icon;

          return (
            <React.Fragment key={step.id}>
              {/* Step Node */}
              <button
                onClick={() => isClickable && onStepClick(index)}
                disabled={!isClickable}
                className={`
                  flex flex-col items-center gap-2 min-w-[80px] lg:min-w-[100px] px-2 py-2 rounded-xl transition-all relative group
                  ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                  ${isActive ? 'bg-blue-50/80' : 'hover:bg-slate-50'}
                `}
              >
                {/* Circle */}
                <motion.div
                  animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                  transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center relative transition-all duration-300
                    ${isActive 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                      : isCompleted 
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : isPast
                          ? 'bg-slate-200 text-slate-500'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }
                  `}
                >
                  {isCompleted && !isActive ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-4.5 h-4.5" />
                  )}
                  {isActive && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping opacity-75" />
                  )}
                </motion.div>

                {/* Label */}
                <span className={`
                  text-[10px] lg:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors
                  ${isActive ? 'text-blue-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}
                `}>
                  {step.label}
                </span>

                {/* Step Number Badge */}
                <span className={`
                  absolute -top-1 -left-0.5 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center
                  ${isActive ? 'bg-blue-600 text-white' : isCompleted ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}
                `}>
                  {index + 1}
                </span>
              </button>

              {/* Connector Line */}
              {index < WORKFLOW_STEPS.length - 1 && (
                <div className="flex-1 min-w-[16px] max-w-[60px] h-0.5 relative mx-1 hidden sm:block">
                  <div className="absolute inset-0 bg-slate-200 rounded-full" />
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: index < currentStep || isCompleted ? '100%' : '0%' }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full"
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current Step Description */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
          {React.createElement(WORKFLOW_STEPS[currentStep].icon, { className: 'w-4 h-4' })}
        </div>
        <div>
          <span className="text-xs font-bold text-slate-700">
            Step {currentStep + 1}: {WORKFLOW_STEPS[currentStep].label}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {WORKFLOW_STEPS[currentStep].description}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default WorkflowStepper;
