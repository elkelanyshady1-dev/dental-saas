/**
 * index.js — Design System Barrel Export v2.0
 *
 * Single import path for all design-system symbols.
 *
 * Usage:
 *   import { Card, Button, Badge, tokens, useTokens } from "@/design-system";
 *   import { Stack, Grid, Section, PageLayout }       from "@/design-system";
 */

// ── Tokens ──────────────────────────────────────────────────────────────────
export { tokens, STATUS_TOKENS, VISIBILITY_TOKENS } from "./tokens";

// ── Token Hook ──────────────────────────────────────────────────────────────
export { useTokens } from "./useTokens";

// ── Registry ────────────────────────────────────────────────────────────────
export {
    UI_REGISTRY,
    isRegistered,
    registeredComponents,
    componentsByCategory,
} from "./uiRegistry";

// ── Guardian ────────────────────────────────────────────────────────────────
export { UIGuard } from "./UIGuard";

// ── Contrast Utility ────────────────────────────────────────────────────────
export { ensureContrast, contrastRatio, APPROVED_PAIRS } from "./contrastGuard";

// ── UI Components ────────────────────────────────────────────────────────────
export { Card } from "./components/Card";
export { Button } from "./components/Button";
export { Badge } from "./components/Badge";
export { Surface } from "./components/Surface";
export { StatCard } from "./components/StatCard";
export { SectionHeader } from "./components/SectionHeader";
export { DataTable } from "./components/DataTable";
export { Input } from "./components/Input";
export { FeatureItem } from "./components/FeatureItem";
export { StatsBadge } from "./components/StatsBadge";

// ── Layout Primitives (v2.0) ─────────────────────────────────────────────────
export { PageLayout } from "./layout/PageLayout";
export { Section } from "./layout/Section";
export { Stack } from "./layout/Stack";
export { Grid } from "./layout/Grid";
