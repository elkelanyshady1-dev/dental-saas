/**
 * useChartActions.ts — Extracted from SnapshotEditor.tsx (P2-12)
 *
 * Centralizes all clinical chart action dispatchers.
 * Each action goes through dispatchClinicalAction() — NO direct service calls.
 *
 * DEPENDENCIES:
 *   - dispatchClinicalAction: coordinator that guards against duplicates
 *   - saveToHistory: per-action undo tracking
 *   - dispatch: reducer function for local state mutations
 *   - chartState: current chart state (teeth, archwires, etc.)
 *
 * INVARIANTS:
 *   - All mutations require active visit (guardVisit check)
 *   - All mutations go through saveToHistory() for undo tracking
 *   - All mutations dispatch to local reducer (UI state)
 *   - DB persistence happens optionally via onCommit callback
 */

import { useCallback, useMemo } from 'react';
import { dispatchClinicalAction } from '../utils/actionDispatcher';
import { ElasticSize, Appliance, PowerChainType, AccessoryType, LigatureType, IPRMarker, SpaceMarker } from '../types';

interface UseChartActionsParams {
  // Reducer dispatch
  dispatch: (action: any) => void;
  // Chart state (teeth, appliances, etc.)
  chartState: any;
  // Selected tooth IDs for bulk actions
  selectedToothIds: number[];
  // Case identifier
  caseId: string;
  // Patient identifier
  patientId: string;
  // Active visit session (gates all mutations)
  activeVisit: any;
  // Read-only mode flag
  isReadOnly: boolean;
  // Undo history tracking
  saveToHistory: () => void;
  // Log action for audit
  logAction: (description: string, toothId?: number) => void;
  // Clear selection after successful action
  setSelectedToothIds: (ids: number[]) => void;
}

export function useChartActions(params: UseChartActionsParams) {
  const {
    dispatch,
    chartState,
    selectedToothIds,
    caseId,
    patientId,
    activeVisit,
    isReadOnly,
    saveToHistory,
    logAction,
    setSelectedToothIds,
  } = params;

  // Guard: all mutations require active visit
  const guardVisit = useCallback(() => {
    if (!activeVisit || isReadOnly) {
      throw new Error('No active visit session — cannot perform clinical action');
    }
  }, [activeVisit, isReadOnly]);

  // ── Tooth Status Actions ──────────────────────────────────────────────

  const handleToothStatusChange = useCallback((status: string) => {
    try {
      guardVisit();
      const { upperTeeth, lowerTeeth } = chartState;
      const allTeeth = [...(upperTeeth ?? []), ...(lowerTeeth ?? [])];

      dispatchClinicalAction({
        action: {
          type: 'TOOTH_STATUS_CHANGED',
          payload: { status, teeth: selectedToothIds },
          timestamp: Date.now(),
          source: 'ui',
        },
        skipDuplicateCheck: true,
        onApply: () => {
          saveToHistory();
          selectedToothIds.forEach((toothId) => {
            const tooth = allTeeth.find((t) => t.id === toothId);
            if (!tooth) return;
            let finalStatus = status;
            if (tooth.type === 'molar' && status === 'bracket') finalStatus = 'molar-tube';
            else if (tooth.type !== 'molar' && (status === 'band' || status === 'molar-tube')) finalStatus = 'bracket';
            dispatch({ type: 'SET_TOOTH_STATUS', payload: { toothId, status: finalStatus } });
          });
          logAction(`Changed status to ${status}`, selectedToothIds[0]);
          setSelectedToothIds([]);
        },
      });
    } catch (err: any) {
      console.error('[useChartActions] handleToothStatusChange failed:', err?.message);
    }
  }, [dispatch, chartState, selectedToothIds, guardVisit, saveToHistory, logAction, setSelectedToothIds]);

  // ── Bracket/Bonding Actions ───────────────────────────────────────────

  /**
   * Single-tooth bracket application (from popup context menu)
   * Auto-corrects molar/non-molar types
   */
  const handleBracketApply = useCallback(
    (toothId: number, config: any) => {
      try {
        guardVisit();
        saveToHistory();
        const { upperTeeth, lowerTeeth } = chartState;
        const allTeeth = [...(upperTeeth ?? []), ...(lowerTeeth ?? [])];
        const tooth = allTeeth.find((t) => t.id === toothId);
        if (!tooth) return;

        let finalType = config.bracketType || 'bracket';
        if (tooth.type === 'molar' && finalType === 'bracket') finalType = 'molar-tube';
        else if (tooth.type !== 'molar' && (finalType === 'band' || finalType === 'molar-tube')) finalType = 'bracket';

        dispatch({
          type: 'SET_TOOTH_BONDING',
          payload: {
            toothId,
            status: finalType,
            prescription: config.prescription,
            slotSize: config.slotSize,
            brand: config.brand,
            bondingHeight: config.bondingHeight,
            bondingOption: config.bondingOption,
            prescriptionValues: config.prescriptionValues,
          },
        });
        logAction(`Applied ${finalType}: ${config.prescription} ${config.slotSize}`, toothId);
      } catch (err: any) {
        console.error('[useChartActions] handleBracketApply failed:', err?.message);
      }
    },
    [dispatch, chartState, guardVisit, saveToHistory, logAction]
  );

  /**
   * Debond: removes bracket from a single tooth
   * Optional reason is logged for audit
   */
  const handleDebond = useCallback(
    (toothId: number, reason?: string) => {
      try {
        guardVisit();
        saveToHistory();
        const { upperTeeth, lowerTeeth } = chartState;
        const allTeeth = [...(upperTeeth ?? []), ...(lowerTeeth ?? [])];
        const tooth = allTeeth.find((t) => t.id === toothId);
        if (!tooth) return;

        dispatch({
          type: 'SET_TOOTH_STATUS',
          payload: { toothId, status: 'healthy' },
        });
        logAction(`Debonded${reason ? ` (${reason})` : ''}`, toothId);
      } catch (err: any) {
        console.error('[useChartActions] handleDebond failed:', err?.message);
      }
    },
    [dispatch, chartState, guardVisit, saveToHistory, logAction]
  );

  // ── Archwire Actions ──────────────────────────────────────────────────

  const handleArchwireApply = useCallback(
    (arch: 'upper' | 'lower', config: any) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'ARCHWIRE_SET',
            payload: {
              arch,
              material: config.material,
              size: config.size,
              brand: config.brand,
              from: config.from,
              to: config.to,
              cinched: config.cinched,
            },
            timestamp: Date.now(),
            source: 'ui',
          },
          getState: () => {
            const { upperArchwire, lowerArchwire } = chartState;
            return { upperArchwire, lowerArchwire };
          },
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'SET_ARCHWIRE', payload: { arch, wire: config } });
            logAction(`Applied ${arch} archwire: ${config.material} ${config.size} (${config.brand})`);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleArchwireApply failed:', err?.message);
      }
    },
    [dispatch, chartState, guardVisit, saveToHistory, logAction]
  );

  const handleArchwireRemove = useCallback(
    (arch: 'upper' | 'lower') => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'ARCHWIRE_REMOVE',
            payload: { arch },
            timestamp: Date.now(),
            source: 'ui',
          },
          getState: () => {
            const { upperArchwire, lowerArchwire } = chartState;
            return { upperArchwire, lowerArchwire };
          },
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_ARCHWIRE', payload: { arch } });
            logAction(`Removed ${arch} archwire`);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleArchwireRemove failed:', err?.message);
      }
    },
    [dispatch, chartState, guardVisit, saveToHistory, logAction]
  );

  // ── Elastic Actions ───────────────────────────────────────────────────

  const handleElasticApply = useCallback(
    (config: { type: any; size: ElasticSize; teeth: number[] }) => {
      try {
        guardVisit();
        if (config.teeth.length < 2) {
          console.warn('[useChartActions] Elastics require at least 2 teeth');
          return;
        }

        dispatchClinicalAction({
          action: {
            type: 'ELASTIC_SET',
            payload: {
              teeth: config.teeth,
              type: config.type,
              size: config.size,
            },
            timestamp: Date.now(),
            source: 'ui',
          },
          getState: () => {
            const { elastics } = chartState;
            return { elastics };
          },
          onApply: () => {
            saveToHistory();
            const newElastic = {
              id: Math.random().toString(36).substr(2, 9),
              toothIds: config.teeth,
              type: config.type,
              size: config.size,
            };
            dispatch({ type: 'ADD_ELASTIC', payload: newElastic });
            logAction(`Added ${config.type} elastic (${config.size})`);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleElasticApply failed:', err?.message);
      }
    },
    [dispatch, chartState, guardVisit, saveToHistory, logAction]
  );

  const handleElasticRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'ELASTIC_REMOVED',
            payload: { elasticId: id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_ELASTIC', payload: id });
            logAction('Removed elastic');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleElasticRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  // ── Powerchain Actions ────────────────────────────────────────────────

  const handlePowerchainApply = useCallback(
    (config: { type: PowerChainType; color: string; teeth: number[]; miniscrewId?: string }) => {
      try {
        guardVisit();
        if (config.teeth.length < 2 && !config.miniscrewId) {
          console.warn('[useChartActions] Powerchains require at least 2 teeth or miniscrew anchor');
          return;
        }

        dispatchClinicalAction({
          action: {
            type: 'POWERCHAIN_SET',
            payload: {
              teeth: config.teeth,
              type: config.type,
              color: config.color,
              miniscrewId: config.miniscrewId,
            },
            timestamp: Date.now(),
            source: 'ui',
          },
          getState: () => {
            const { powerChains } = chartState;
            return { powerChains };
          },
          onApply: () => {
            saveToHistory();
            const isUpper = config.teeth[0] < 30;
            const newPC = {
              id: Math.random().toString(36).substr(2, 9),
              anchorTeeth: config.miniscrewId ? [config.teeth[config.teeth.length - 1]] : [config.teeth[0], config.teeth[config.teeth.length - 1]],
              activeTeeth: config.miniscrewId ? config.teeth.slice(0, -1) : config.teeth.slice(1, -1),
              type: config.type,
              color: config.color,
              direction: 'mesial' as const,
              isUpper,
              miniscrewId: config.miniscrewId,
            };
            dispatch({ type: 'ADD_POWERCHAIN', payload: newPC });
            logAction(`Added ${config.type} power chain`);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handlePowerchainApply failed:', err?.message);
      }
    },
    [dispatch, chartState, guardVisit, saveToHistory, logAction]
  );

  const handlePowerchainRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'POWERCHAIN_REMOVED',
            payload: { chainId: id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_POWERCHAIN', payload: id });
            logAction('Removed power chain');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handlePowerchainRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  // ── Accessory Actions ─────────────────────────────────────────────────

  const handleAccessorySet = useCallback(
    (config: { type: AccessoryType; toothIds: number[] }) => {
      try {
        guardVisit();
        if (config.toothIds.length === 0) {
          console.warn('[useChartActions] Accessories require at least 1 tooth');
          return;
        }

        dispatchClinicalAction({
          action: {
            type: 'ACCESSORY_SET',
            payload: { type: config.type, teeth: config.toothIds },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            const isUpper = config.toothIds[0] < 30;
            const newAccessory = {
              id: Math.random().toString(36).substr(2, 9),
              type: config.type,
              toothIds: config.toothIds,
              isUpper,
            };
            dispatch({ type: 'ADD_ACCESSORY', payload: newAccessory });
            logAction(`Added ${config.type.replace('-', ' ')}`);
            setSelectedToothIds([]);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleAccessorySet failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction, setSelectedToothIds]
  );

  const handleAccessoryRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'ACCESSORY_REMOVED',
            payload: { id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_ACCESSORY', payload: id });
            logAction('Removed accessory');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleAccessoryRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  // ── Ligature Actions ──────────────────────────────────────────────────

  const handleLigatureSet = useCallback(
    (config: { type: LigatureType; toothIds: number[] }) => {
      try {
        guardVisit();
        if (config.toothIds.length < 2) {
          console.warn('[useChartActions] Ligatures require at least 2 teeth');
          return;
        }

        const sorted = [...config.toothIds].sort((a, b) => a - b);
        const isUpper = sorted[0] < 30;

        dispatchClinicalAction({
          action: {
            type: 'LIGATURE_SET',
            payload: { toothId: sorted[0], ligatureType: config.type },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            const newLig = {
              id: Math.random().toString(36).substr(2, 9),
              toothIds: sorted,
              type: config.type,
              isUpper,
            };
            dispatch({ type: 'ADD_LIGATURE', payload: newLig });
            logAction(`Added ${config.type} ligature wire`);
            setSelectedToothIds([]);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleLigatureSet failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction, setSelectedToothIds]
  );

  const handleLigatureRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'LIGATURE_REMOVED',
            payload: { id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_LIGATURE', payload: id });
            logAction('Removed ligature wire');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleLigatureRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  // ── TAD/Miniscrew Actions ─────────────────────────────────────────────

  const handleTadInsert = useCallback(
    (config: { toothId: number; anchorType: string; brand: string; diameter: string; length: string }) => {
      try {
        guardVisit();
        const tempId = `temp-${Math.random().toString(36).substr(2, 9)}`;
        const newMiniscrew = {
          id: tempId,
          toothId: config.toothId,
          anchorType: config.anchorType,
          angle: 90,
          brand: config.brand,
          diameter: config.diameter,
          length: config.length,
        };

        dispatchClinicalAction({
          action: {
            type: 'TAD_INSERTED',
            payload: {
              toothId: config.toothId,
              position: config.anchorType,
            },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'PLACE_TAD', payload: newMiniscrew });
            logAction(`Placed miniscrew on tooth ${config.toothId}`, config.toothId);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleTadInsert failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  const handleTadRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'TAD_REMOVED',
            payload: { id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_TAD', payload: id });
            logAction('Removed miniscrew');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleTadRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  // ── IPR Actions ───────────────────────────────────────────────────────

  const handleIprMark = useCallback(
    (config: { toothId: number; amount: number }) => {
      try {
        guardVisit();
        const newIPR: IPRMarker = {
          id: Math.random().toString(36).substr(2, 9),
          toothId: config.toothId,
          amount: config.amount,
        };

        dispatchClinicalAction({
          action: {
            type: 'IPR_MARKED',
            payload: { toothId: config.toothId, amount: config.amount },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'ADD_IPR', payload: newIPR });
            logAction(`Added IPR (${config.amount}) to tooth ${config.toothId}`, config.toothId);
            setSelectedToothIds([]);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleIprMark failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction, setSelectedToothIds]
  );

  const handleIprRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'IPR_REMOVED',
            payload: { id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_IPR', payload: id });
            logAction('Removed IPR marker');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleIprRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  // ── Space Marker Actions ──────────────────────────────────────────────

  const handleSpaceMarkerSet = useCallback(
    (config: { toothId: number; type: string }) => {
      try {
        guardVisit();
        const newSpace: SpaceMarker = {
          id: Math.random().toString(36).substr(2, 9),
          toothId: config.toothId,
          anchorType: 'mesial',
          value: config.type,
        };

        dispatchClinicalAction({
          action: {
            type: 'SPACE_MARKED',
            payload: { toothId: config.toothId, location: config.type },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'ADD_SPACE', payload: newSpace });
            logAction(`Added space marker (${config.type}) to tooth ${config.toothId}`, config.toothId);
            setSelectedToothIds([]);
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleSpaceMarkerSet failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction, setSelectedToothIds]
  );

  const handleSpaceMarkerRemove = useCallback(
    (id: string) => {
      try {
        guardVisit();
        dispatchClinicalAction({
          action: {
            type: 'SPACE_REMOVED',
            payload: { id },
            timestamp: Date.now(),
            source: 'ui',
          },
          skipDuplicateCheck: true,
          onApply: () => {
            saveToHistory();
            dispatch({ type: 'REMOVE_SPACE', payload: id });
            logAction('Removed space marker');
          },
        });
      } catch (err: any) {
        console.error('[useChartActions] handleSpaceMarkerRemove failed:', err?.message);
      }
    },
    [dispatch, guardVisit, saveToHistory, logAction]
  );

  return useMemo(
    () => ({
      handleToothStatusChange,
      handleBracketApply,
      handleDebond,
      handleArchwireApply,
      handleArchwireRemove,
      handleElasticApply,
      handleElasticRemove,
      handlePowerchainApply,
      handlePowerchainRemove,
      handleAccessorySet,
      handleAccessoryRemove,
      handleLigatureSet,
      handleLigatureRemove,
      handleTadInsert,
      handleTadRemove,
      handleIprMark,
      handleIprRemove,
      handleSpaceMarkerSet,
      handleSpaceMarkerRemove,
    }),
    [
      handleToothStatusChange,
      handleBracketApply,
      handleDebond,
      handleArchwireApply,
      handleArchwireRemove,
      handleElasticApply,
      handleElasticRemove,
      handlePowerchainApply,
      handlePowerchainRemove,
      handleAccessorySet,
      handleAccessoryRemove,
      handleLigatureSet,
      handleLigatureRemove,
      handleTadInsert,
      handleTadRemove,
      handleIprMark,
      handleIprRemove,
      handleSpaceMarkerSet,
      handleSpaceMarkerRemove,
    ]
  );
}
