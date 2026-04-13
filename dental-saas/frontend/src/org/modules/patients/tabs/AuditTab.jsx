/**
 * AuditTab.jsx — Patient Audit Trail Tab
 *
 * Renders the AuditTimeline component scoped to a specific patient.
 * Used inside PatientLayout as one of the patient profile tabs.
 *
 * Access: Requires security.read capability (enforced by API).
 *
 * PLANE: Org only.
 */

import { useOutletContext, useParams } from 'react-router-dom';
import AuditTimeline from '../../../../modules/org/audit/components/AuditTimeline';

export default function AuditTab() {
    const { id } = useParams();

    return (
        <AuditTimeline
            entityId={id}
            entityType="Patient"
            maxHeight="calc(100vh - 220px)"
        />
    );
}
