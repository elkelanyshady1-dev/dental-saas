import { useMemo } from 'react';
import { useAutocomplete } from './useAutocomplete';
import { generateSmartSuggestions } from './suggestionEngine';
import { useUsageLearning } from './useUsageLearning';
import type { ClinicalState } from '../utils/clinicalActionGuard';
import { COMMANDS } from './commandRegistry';

export type CombinedSuggestion = {
  label: string;
  type: 'autocomplete' | 'smart' | 'frequent';
  icon: string;
  reason?: string;
  score: number;
};

export function useSuggestions(input: string, chartState: ClinicalState) {
  const autocomplete = useAutocomplete(input);
  const { getUsageScore, usage } = useUsageLearning();

  return useMemo(() => {
    const trimmed = input.trim();
    const suggestionsMap = new Map<string, CombinedSuggestion>();

    const recordSuggestion = (s: Omit<CombinedSuggestion, 'score'>, baseScore: number) => {
        const usageMultiplier = 1 + (getUsageScore(s.label) * 0.1); 
        const finalScore = baseScore * usageMultiplier;
        
        if (!suggestionsMap.has(s.label) || suggestionsMap.get(s.label)!.score < finalScore) {
            suggestionsMap.set(s.label, { ...s, score: finalScore });
        }
    };

    if (trimmed) {
      // 1. Autocomplete results (highest base score)
      autocomplete.forEach(s => {
        recordSuggestion(s, s.matchScore);
      });
    } else {
      // Empty input state
      
      // 1. Contextual Smart Suggestions
      const smart = generateSmartSuggestions(chartState);
      smart.forEach(s => {
          recordSuggestion(s, 100);
      });

      // 2. Most frequent overall 
      const frequentLabels = Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label);
        
      frequentLabels.forEach(label => {
          // Find icon
          let icon = '✦'; 
          COMMANDS.forEach(cmd => {
             if (cmd.examples.includes(label) || label.startsWith(cmd.name.toLowerCase())) {
                 icon = cmd.icon;
             } 
          });

          recordSuggestion({
              label,
              type: 'frequent',
              icon
          }, 80);
      });
    }

    // Sort all by derived score and take top 5
    return Array.from(suggestionsMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

  }, [input, autocomplete, chartState, getUsageScore, usage]);
}
