/**
 * Portal.tsx — Escape-hatch renderer for floating clinical UI
 *
 * Renders children into #portal-root (document.body sibling), completely
 * bypassing any parent stacking context (z-index, transform, filter, etc.).
 *
 * USE THIS for any floating panel that must appear above:
 *   - position:fixed modal overlays (e.g. OPG Reference Panel z-[1000])
 *   - Any container with transform / will-change / filter CSS
 *
 * RULES:
 *   - Children MUST use position:fixed with explicit coordinates (top/left)
 *   - Children MUST use z-[9999] or higher
 *   - NEVER use position:absolute inside a Portal child — it anchors to viewport
 *
 * @example
 *   <Portal>
 *     <div style={{ position:'fixed', top: y, left: x }} className="z-[9999]">
 *       <MyPanel />
 *     </div>
 *   </Portal>
 */

import { createPortal } from 'react-dom';
import { ReactNode } from 'react';

// Resolve the portal root once at module load (SSR-safe — null check below).
// Falls back to document.body if #portal-root is absent (e.g. unit tests).
const getPortalRoot = (): HTMLElement =>
  (document.getElementById('portal-root') as HTMLElement | null) ?? document.body;

interface PortalProps {
  children: ReactNode;
}

export const Portal = ({ children }: PortalProps) => {
  return createPortal(children, getPortalRoot());
};

export default Portal;
