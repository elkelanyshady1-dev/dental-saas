import { useMemo } from 'react';
import { COMMANDS } from './commandRegistry';

export interface AutocompleteSuggestion {
  label: string;
  type: 'autocomplete';
  icon: string;
  matchScore: number;
}

export function useAutocomplete(input: string) {
  return useMemo(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return [];

    const suggestions: AutocompleteSuggestion[] = [];

    COMMANDS.forEach(cmd => {
      // Check exact prefix matches first
      let bestMatchScore = 0;
      let matchedExample = '';

      // Score against examples for rich output
      cmd.examples.forEach(example => {
        const lowerEx = example.toLowerCase();
        if (lowerEx.startsWith(trimmed)) {
          bestMatchScore = Math.max(bestMatchScore, 100);
          matchedExample = example;
        } else if (lowerEx.includes(trimmed)) {
          bestMatchScore = Math.max(bestMatchScore, 50);
          matchedExample = example;
        }
      });
      
      // Score against aliases
      cmd.aliases.forEach(alias => {
         const lowerAlias = alias.toLowerCase();
         if (lowerAlias.startsWith(trimmed)) {
             bestMatchScore = Math.max(bestMatchScore, 80);
             // Pick the first example as representative if we matched an alias
             if (!matchedExample && cmd.examples.length > 0) matchedExample = cmd.examples[0];
         } else if (lowerAlias.includes(trimmed)) {
             bestMatchScore = Math.max(bestMatchScore, 30);
             if (!matchedExample && cmd.examples.length > 0) matchedExample = cmd.examples[0];
         }
      });

      if (bestMatchScore > 0 && matchedExample) {
        suggestions.push({
          label: matchedExample,
          type: 'autocomplete',
          icon: cmd.icon,
          matchScore: bestMatchScore
        });
      }
    });

    // Sort by match score descending, then alphabetically 
    return suggestions
      .sort((a, b) => b.matchScore - a.matchScore || a.label.localeCompare(b.label))
      .slice(0, 5);
      
  }, [input]);
}
