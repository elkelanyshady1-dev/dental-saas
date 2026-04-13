/**
 * OrthoCapabilityGate.tsx — Capability-Based Access Control for Orthodontics Module
 *
 * Wraps orthodontic UI actions behind capability checks.
 * Uses the global CapabilityContext, NOT role-based checks.
 *
 * ARCHITECTURE:
 * - Single source of truth: JWT token (includes permissions[] array)
 * - Frontend validates against permissions via useCapability hook
 * - NO hardcoded role checks (e.g., role === 'admin')
 * - Fallback UI shown if permission denied
 *
 * USAGE:
 *   <OrthoCapabilityGate permission="orthodontics.full">
 *     <BondButton />
 *   </OrthoCapabilityGate>
 *
 *   Or use the hook directly:
 *   const ortho = useOrthoCapability();
 *   if (ortho.canManageTads) <TadPanel />
 */

import React from 'react';
import { useCapability } from '@/hooks/useCapability';

export interface OrthoCapabilityGateProps {
  /**
   * Required permission key (e.g., "orthodontics.full", "tads.manage")
   */
  permission: string;

  /**
   * Optional fallback UI shown if permission denied
   * Default: null (renders nothing)
   */
  fallback?: React.ReactNode;

  /**
   * Children to render if permission granted
   */
  children: React.ReactNode;
}

/**
 * OrthoCapabilityGate Component
 *
 * Checks if user has the required capability before rendering children.
 * Follows RBAC patterns: capability-based, not role-based.
 */
export function OrthoCapabilityGate({
  permission,
  fallback = null,
  children,
}: OrthoCapabilityGateProps) {
  const hasPermission = useCapability(permission);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export interface OrthoCapabilitySet {
  canManage: boolean;
  canRead: boolean;
  canManageTads: boolean;
  canManageBonding: boolean;
  canManageSequence: boolean;
  canRequestAnalysis: boolean;
  canUploadScans: boolean;
}

/**
 * useOrthoCapability Hook
 *
 * Provides semantic capability checks for the orthodontics module.
 * Fallback logic: specific permission OR canManage (super-permission).
 *
 * USAGE:
 *   const ortho = useOrthoCapability();
 *   if (ortho.canManageTads) {
 *     return <TadPanel />;
 *   }
 */
export function useOrthoCapability(): OrthoCapabilitySet {
  const canManage = useCapability('orthodontics.full');
  const canRead = useCapability('orthodontics.read');
  const canManageTads = useCapability('tads.manage') || canManage;
  const canManageBonding = useCapability('bonding.manage') || canManage;
  const canManageSequence = useCapability('sequence.manage') || canManage;
  const canRequestAnalysis = useCapability('analysis.request') || canManage;
  const canUploadScans = useCapability('scans.upload') || canManage;

  return {
    canManage,
    canRead,
    canManageTads,
    canManageBonding,
    canManageSequence,
    canRequestAnalysis,
    canUploadScans,
  };
}

export default OrthoCapabilityGate;
