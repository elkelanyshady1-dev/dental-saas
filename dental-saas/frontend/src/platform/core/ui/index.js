/**
 * index.js
 * Platform UI Primitives — Barrel Export
 *
 * Import from this file for all platform UI components:
 *   import { Card, StatusBadge, PageContainer, Button, ConfirmDialog } from '@/platform/core/ui';
 */

export { default as PageContainer } from "./PageContainer";
export { default as Card, CardHeader } from "./Card";
export { StatusBadge, OrgStatusBadge, LiveBadge } from "./StatusBadge";
export { default as Button } from "./Button";
export { AlertBanner, ErrorState, LoadingState, EmptyState } from "./Feedback";
export { default as ConfirmDialog } from "./ConfirmDialog";
