/**
 * LabCaseCreate — start a new lab case.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LabPageShell from "../components/LabPageShell";
import LabCaseForm from "../components/LabCaseForm";
import { useCreateLabCase } from "../hooks/useLab";

export default function LabCaseCreate() {
    const navigate = useNavigate();
    const createMut = useCreateLabCase();
    const [apiError, setApiError] = useState(null);

    const onSubmit = async (payload) => {
        setApiError(null);
        try {
            const resp = await createMut.mutateAsync(payload);
            const id = resp?.data?._id || resp?._id;
            navigate(id ? `/org/lab-cases/${id}` : "/org/lab/kanban");
        } catch (err) {
            setApiError(
                err?.response?.data?.error?.message || err.message || "Failed to create lab case"
            );
        }
    };

    return (
        <LabPageShell
            eyebrow="Lab"
            title="New lab case"
            subtitle="Draft a new external appliance order."
            breadcrumbs={[
                { label: "Lab", to: "/org/lab" },
                { label: "New case" },
            ]}
        >
            <LabCaseForm
                mode="create"
                onSubmit={onSubmit}
                onCancel={() => navigate("/org/lab/kanban")}
                submitLabel="Create case"
                pending={createMut.isPending}
                apiError={apiError}
            />
        </LabPageShell>
    );
}
