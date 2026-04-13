/**
 * commandRegistry.ts — Clinical Assistant Command Definitions
 *
 * Each command defines:
 *   - name: human label
 *   - patterns: regex matchers for input recognition
 *   - actionType: the ClinicalAction type to emit
 *   - requiresTooth: whether a tooth ID must be extracted
 *   - staticPayload: fixed payload fields (no tooth) for contextual commands
 *   - category: for suggestion grouping
 */

import type { ClinicalActionType } from '../utils/clinicalActionGuard';

export interface CommandDefinition {
  name: string;
  actionType: ClinicalActionType | 'BONDING_REBONDED' | 'BRACKET_REPOSITIONED' | 'POWERCHAIN_ACTIVATED';
  patterns: RegExp[];
  requiresTooth: boolean;
  staticPayload?: Record<string, unknown>;
  category: 'bonding' | 'appliance' | 'elastic' | 'contextual';
  /** Human-readable example for the suggestion bar */
  example: string;
  icon: string;
  aliases: string[];
  examples: string[];
  frequency: number;
}

export const COMMANDS: CommandDefinition[] = [
  // ── Bonding ──────────────────────────────────────────────────────────────
  {
    name: 'Rebond',
    actionType: 'SET_TOOTH_BONDING',
    patterns: [/\b(rebond(ed)?|re-bond(ed)?)\b/i],
    requiresTooth: true,
    staticPayload: { status: 'bracket', action: 'REBOND' },
    category: 'bonding',
    example: 'rebond UR5',
    icon: '🔄',
    aliases: ['rebond', 'reb', 'rb'],
    examples: ['rebond UR5', 'rebond 15'],
    frequency: 0,
  },
  {
    name: 'Debond',
    actionType: 'BONDING_REMOVED',
    patterns: [/\b(debond(ed)?|de-bond(ed)?|remove bracket)\b/i],
    requiresTooth: true,
    staticPayload: { status: 'healthy', action: 'DEBOND' },
    category: 'bonding',
    example: 'debond UL3',
    icon: '❌',
    aliases: ['debond', 'deb', 'db', 'remove bracket'],
    examples: ['debond UL3', 'debond 26'],
    frequency: 0,
  },
  {
    name: 'Bond',
    actionType: 'SET_TOOTH_BONDING',
    patterns: [/\b(bond(?!ed|ing|ed))\b/i, /\bplace bracket\b/i, /\bapply bracket\b/i],
    requiresTooth: true,
    staticPayload: { status: 'bracket', action: 'BOND' },
    category: 'bonding',
    example: 'bond UR4',
    icon: '🦷',
    aliases: ['bond', 'bo', 'place bracket', 'apply bracket'],
    examples: ['bond UR4', 'bond 24'],
    frequency: 0,
  },
  {
    name: 'Reposition bracket',
    actionType: 'SET_TOOTH_BONDING',
    patterns: [/\b(reposition(ed)?|adjust bracket|move bracket)\b/i],
    requiresTooth: true,
    staticPayload: { status: 'bracket', action: 'REPOSITION' },
    category: 'bonding',
    example: 'reposition LL6',
    icon: '📍',
    aliases: ['reposition', 'repo', 'adjust bracket', 'move bracket'],
    examples: ['reposition LL6', 'repo 36'],
    frequency: 0,
  },

  // ── Elastics ──────────────────────────────────────────────────────────────
  {
    name: 'Resume Class III elastics',
    actionType: 'ELASTIC_SET',
    patterns: [/resume\s+class\s*iii\s*(elastics?)?/i, /restart\s+class\s*iii/i],
    requiresTooth: false,
    staticPayload: { type: 'class_iii', mode: 'RESUME', fromTooth: 13, toTooth: 43 },
    category: 'elastic',
    example: 'resume class iii elastics',
    icon: '🔁',
    aliases: ['resume class iii', 'class 3', 'c3'],
    examples: ['resume class iii elastics'],
    frequency: 0,
  },
  {
    name: 'Resume Class II elastics',
    actionType: 'ELASTIC_SET',
    patterns: [/resume\s+class\s*ii\s*(elastics?)?/i, /restart\s+class\s*ii/i],
    requiresTooth: false,
    staticPayload: { type: 'class_ii', mode: 'RESUME', fromTooth: 16, toTooth: 46 },
    category: 'elastic',
    example: 'resume class ii elastics',
    icon: '🔁',
    aliases: ['resume class ii', 'class 2', 'c2'],
    examples: ['resume class ii elastics'],
    frequency: 0,
  },
  {
    name: 'Apply elastics',
    actionType: 'ELASTIC_SET',
    patterns: [/\b(apply|add|place)\s+elastics?\b/i],
    requiresTooth: false,
    staticPayload: { type: 'class_ii', fromTooth: 16, toTooth: 46 },
    category: 'elastic',
    example: 'apply elastics',
    icon: '⊃',
    aliases: ['apply elastics', 'add elastics', 'place elastics', 'elas'],
    examples: ['apply elastics'],
    frequency: 0,
  },

  // ── Power Chain ───────────────────────────────────────────────────────────
  {
    name: 'Activate powerchain',
    actionType: 'POWERCHAIN_SET',
    patterns: [/\b(activate|apply|add|place)\s+(pc|power ?chain)\b/i],
    requiresTooth: false,
    staticPayload: { type: 'full', arch: 'upper', color: '#7c3aed' },
    category: 'appliance',
    example: 'activate powerchain',
    icon: '🔗',
    aliases: ['activate powerchain', 'activate pc', 'add pc', 'apply pc'],
    examples: ['activate powerchain', 'activate pc'],
    frequency: 0,
  },
  {
    name: 'Remove powerchain',
    actionType: 'POWERCHAIN_REMOVED',
    patterns: [/\b(remove|take off)\s+(pc|power ?chain)\b/i],
    requiresTooth: false,
    staticPayload: {},
    category: 'appliance',
    example: 'remove powerchain',
    icon: '✂️',
    aliases: ['remove powerchain', 'remove pc', 'take off pc'],
    examples: ['remove powerchain', 'remove pc'],
    frequency: 0,
  },

  // ── IPR ───────────────────────────────────────────────────────────────────
  {
    name: 'IPR',
    actionType: 'IPR_MARKED',
    patterns: [/\bipr\b/i, /\binterproximal reduction\b/i],
    requiresTooth: true,
    staticPayload: { amount: 0.3 },
    category: 'contextual',
    example: 'ipr UR4',
    icon: '⚡',
    aliases: ['ipr', 'interproximal reduction'],
    examples: ['ipr UR4', 'ipr 24'],
    frequency: 0,
  },

];

/** Find the first command that matches the input text */
export function matchCommand(input: string): CommandDefinition | null {
  const trimmed = input.trim();
  for (const cmd of COMMANDS) {
    if (cmd.patterns.some(p => p.test(trimmed))) {
      return cmd;
    }
  }
  return null;
}

/** All unique suggestion examples for the hint list */
export const SUGGESTION_EXAMPLES = COMMANDS.map(c => ({
  label: c.example,
  icon:  c.icon,
  name:  c.name,
}));
