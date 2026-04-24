/**
 * LabCaseEdit — edit an existing lab case (non-status fields).
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LabPageShell from "../components/LabPageShell";
import LabCaseForm from "../components/LabCaseForm";
import { useLabCase, useUpdateLabCase } from "../hooks/useLab";

export default function LabCaseEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: resp, isLoading } = useLabCase(id);
    const updateMut = useUpdateLabCase(id);
    const [apiError, setApiError] = useState(null);

    const labCase = resp?.data;

    const onSubmit = async (payload) => {
        setApiError(null);
        try {
            await updateMut.mutateAsync(payload);
            navigate(`/org/lab-cases/${id}`);
        } catch (err) {
            setApiError(
                err?.response?.data?.error?.message || err.message || "Failed to update case"
            );
        }
    };

    return (
        <LabPageShell
            eyebrow="Lab"
            title={labCase ? `Edit ${labCase.caseCode}` : "Edit case"}
            subtitle={labCase ? `${labCase.labDisplayName} — ${labCase.patientDisplayName}` : null}
            breadcrumbs={[
                { label: "Lab", to: "/org/lab" },
                { label: "Cases", to: "/org/lab/kanban" },
                { label: labCase?.caseCode || "Edit", to: `/org/lab-cases/${id}` },
                { label: "Edit" },
            ]}
        >
            {isLoading && <Skeleton />}
            {!isLoading && !labCase && <NotFound />}
            {!isLoading && labCase && (
                <LabCaseForm
                    mode="edit"
                    initialValues={labCase}
                    onSubmit={onSubmit}
                    onCancel={() => navigate(`/org/lab-cases/${id}`)}
                    submitLabel="Save changes"
                    pending={updateMut.isPending}
                    apiError={apiError}
                />
            )}
        </LabPageShell>
    );
}

function Skeleton() {
    return (
        <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-card rounded-card shadow-card p-6 animate-pulse h-32" />
            ))}
        </div>
    );
}

function NotFound() {
    return (
        <div className="bg-card rounded-card shadow-card p-10 text-center">
            <p className="text-text-muted">Lab case not found.</p>
        </div>
    );
}
