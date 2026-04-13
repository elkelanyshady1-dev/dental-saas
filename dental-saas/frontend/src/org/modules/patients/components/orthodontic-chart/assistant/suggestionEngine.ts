import type { ClinicalState } from '../utils/clinicalActionGuard';
import { COMMANDS } from './commandRegistry';

export interface SmartSuggestion {
  label: string;
  type: 'smart';
  icon: string;
  reason: string;
}

export function generateSmartSuggestions(chartState: ClinicalState): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];

  // 1. Case-based: Elastics
  // If no elastics are present, suggest class II or III
  if (!chartState.elastics || chartState.elastics.length === 0) {
    suggestions.push({
      label: 'apply elastics',
      type: 'smart',
      icon: '⊃',
      reason: 'No elastics active'
    });
  } else {
      // if elastics exist, suggest resume 
      suggestions.push({
        label: 'resume class ii elastics',
        type: 'smart',
        icon: '🔁',
        reason: 'Previously used in this case'
      });
  }

  // 2. Case-based: Powerchain
  // If upper arch has bonding but no powerchain
  if (!chartState.powerChains?.some(pc => pc.isUpper)) {
      suggestions.push({
          label: 'activate powerchain',
          type: 'smart',
          icon: '🔗',
          reason: 'Powerchain present but inactive'
      });
  }

  // 3. Bonding suggestions (generic empty state fallback to make sure we always have ideas)
  suggestions.push({
      label: 'rebond UR5',
      type: 'smart',
      icon: '🔄',
      reason: 'frequent action'
  });

  return suggestions.slice(0, 3);
}
