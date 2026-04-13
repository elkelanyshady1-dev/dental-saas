/**
 * commandParser.ts — Clinical Command Parser
 *
 * Turns raw user input into a structured ParsedCommand:
 *   - recognized: true  → list of actions ready for preview + dispatch
 *   - recognized: false → rawText fallback to visit notes
 *
 * ARCHITECTURE:
 *   1. Match command from registry (regex)
 *   2. Extract tooth(s) via toothParser (if requiresTooth)
 *   3. Merge staticPayload + tooth data → structured action
 *   4. Return ParsedCommand
 */

import { matchCommand } from './commandRegistry';
import { parseAllTeeth, parseTooth, formatToothLabel } from './toothParser';
import type { ParsedTooth } from './toothParser';
import type { ClinicalActionType } from '../utils/clinicalActionGuard';

export interface ParsedAction {
  /** The ClinicalAction type to dispatch */
  type: ClinicalActionType | string;
  /** Full payload for the action */
  payload: Record<string, unknown>;
  /** Human-readable preview line */
  description: string;
  /** Parsed tooth info (if applicable) */
  tooth: ParsedTooth | null;
}

export interface ParsedCommand {
  recognized: true;
  commandName: string;
  icon: string;
  actions: ParsedAction[];
  rawText: string;
}

export interface UnrecognizedCommand {
  recognized: false;
  rawText: string;
}

export type CommandResult = ParsedCommand | UnrecognizedCommand;

/**
 * parseCommand
 *
 * Main entry point. Converts raw input text to a CommandResult.
 *
 * @param input - Raw user input (voice or text)
 * @returns CommandResult — recognized command with actions, or unrecognized fallback
 */
export function parseCommand(input: string): CommandResult {
  const trimmed = input.trim();
  if (!trimmed) return { recognized: false, rawText: trimmed };

  // ── Step 1: Match command from registry ─────────────────────────────────
  const cmd = matchCommand(trimmed);
  if (!cmd) {
    return { recognized: false, rawText: trimmed };
  }

  // ── Step 2: Tooth-required commands ─────────────────────────────────────
  if (cmd.requiresTooth) {
    const teeth = parseAllTeeth(trimmed);

    if (teeth.length === 0) {
      // Command recognized but tooth not parseable → ask user to clarify
      return { recognized: false, rawText: trimmed };
    }

    // Build one action per tooth
    const actions: ParsedAction[] = teeth.map((tooth) => {
      const payload: Record<string, unknown> = {
        ...(cmd.staticPayload ?? {}),
        toothId: tooth.toothNumberFDI,
        ...(tooth.surface ? { surface: tooth.surface } : {}),
      };

      const description = buildDescription(cmd.name, tooth);

      return {
        type: cmd.actionType as ClinicalActionType,
        payload,
        description,
        tooth,
      };
    });

    return {
      recognized: true,
      commandName: cmd.name,
      icon: cmd.icon,
      actions,
      rawText: trimmed,
    };
  }

  // ── Step 3: Non-tooth commands (elastics, powerchain, etc.) ─────────────
  const staticAction: ParsedAction = {
    type: cmd.actionType as ClinicalActionType,
    payload: { ...(cmd.staticPayload ?? {}) },
    description: buildStaticDescription(cmd),
    tooth: null,
  };

  return {
    recognized: true,
    commandName: cmd.name,
    icon: cmd.icon,
    actions: [staticAction],
    rawText: trimmed,
  };
}

// ─── Description builders ────────────────────────────────────────────────────

function buildDescription(commandName: string, tooth: ParsedTooth): string {
  const toothLabel = formatToothLabel(tooth);
  return `${commandName} ${toothLabel}`;
}

function buildStaticDescription(cmd: ReturnType<typeof matchCommand>): string {
  if (!cmd) return 'Unknown action';
  const p = cmd.staticPayload ?? {};
  if ('mode' in p) return `${cmd.name} (${p.mode})`;
  return cmd.name;
}
