/**
 * StoragePage.tsx — Storage Settings page for the Settings Hub.
 *
 * Sections:
 *   1. Storage Usage Card    — quota bar, category breakdown
 *   2. Scheduled Backups     — backup policy form + retention display
 *   3. Data Exports Table    — trigger + manage export jobs
 *
 * PLANE: Organization
 * ROUTING: /settings/storage (mounted under org settings router)
 */

import StorageUsageCard from "@/org/modules/settings/components/StorageUsageCard";
import ExportJobsTable from "@/modules/org/settings/components/ExportJobsTable";
import BackupPolicyForm from "@/modules/org/settings/components/BackupPolicyForm";
import RetentionPolicyCard from "@/modules/org/settings/components/RetentionPolicyCard";
import Section from "@/design-system/layout/Section";
import Stack from "@/design-system/layout/Stack";
import Grid from "@/design-system/layout/Grid";

export default function StoragePage() {
    return (
        <Section>
            <Stack gap="lg">
                {/* ── Page Header ───────────────────────────────────────────── */}
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Storage &amp; Exports</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Monitor your storage usage, configure automated backups, and export organization data.
                    </p>
                </div>

                {/* ── Storage Usage ─────────────────────────────────────────── */}
                <StorageUsageCard />

                {/* ── Scheduled Backups ─────────────────────────────────────── */}
                <Stack gap="sm">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                        Scheduled Backups
                    </h2>
                    <Grid cols={{ base: 1, lg: 2 }} gap="md">
                        <BackupPolicyForm />
                        <RetentionPolicyCard />
                    </Grid>
                </Stack>

                {/* ── Data Exports ──────────────────────────────────────────── */}
                <ExportJobsTable />
            </Stack>
        </Section>
    );
}
