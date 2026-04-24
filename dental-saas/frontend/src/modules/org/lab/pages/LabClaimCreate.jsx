/**
 * LabClaimCreate — create a billing claim for a lab case.
 *
 * When the caller navigates here with `?caseId=...` the form is pre-populated
 * from the referenced case.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LabPageShell from "../components/LabPageShell";
import LabClaimForm from "../components/LabClaimForm";
import { useLabCase, useCreateClaim } from "../hooks/useLab";

export default function LabClaimCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const caseIdFromQuery = searchParams.get("caseId") || "";

    const { data: caseResp } = useLabCase(caseIdFromQuery);
    const seedCase = caseResp?.data;

    const createMut = useCreateClaim();
    const [apiError, setApiError] = useState(null);
    const [ready, setReady] = useState(!caseIdFromQuery);

    useEffect(() => {
        if (caseIdFromQuery && seedCase) setReady(true);
    }, [caseIdFromQuery, seedCase]);

    const initialValues = seedCase
        ? {
              caseId:        seedCase._id,
              caseCode:      seedCase.caseCode,
              labId:         seedCase.labId,
              labName:       seedCase.labName || seedCase.labDisplayName,
              applianceType: seedCase.applianceType,
              cost:          seedCase.cost,
          }
        : {};

    const onSubmit = async (payload) => {
        setApiError(null);
        try {
            await createMut.mutateAsync(payload);
            navigate("/org/lab/claims");
        } catch (err) {
            setApiError(
                err?.response?.data?.error?.message || err.message || "Failed to create claim"
            );
        }
    };

    return (
        <LabPageShell
            eyebrow="Lab"
            title="New claim"
            subtitle="Submit a billing claim for a completed lab case."
            breadcrumbs={[
                { label: "Lab", to: "/org/lab" },
                { label: "Claims", to: "/org/lab/claims" },
                { label: "New" },
            ]}
        >
            {!ready && (
                <div className="bg-card rounded-card shadow-card p-6 animate-pulse h-48" />
            )}
            {ready && (
                <LabClaimForm
                    initialValues={initialValues}
                    lockCaseFields={!!seedCase}
                    onSubmit={onSubmit}
                    onCancel={() => navigate("/org/lab/claims")}
                    pending={createMut.isPending}
                    apiError={apiError}
                />
            )}
        </LabPageShell>
    );
}
