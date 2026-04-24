/**
 * LabPartnerCreate — create a new lab partner.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LabPageShell from "../components/LabPageShell";
import LabPartnerForm from "../components/LabPartnerForm";
import { useCreateLabPartner } from "../hooks/useLab";

export default function LabPartnerCreate() {
    const navigate = useNavigate();
    const createMut = useCreateLabPartner();
    const [apiError, setApiError] = useState(null);

    const onSubmit = async (payload) => {
        setApiError(null);
        try {
            const resp = await createMut.mutateAsync(payload);
            navigate("/org/lab/directory");
            return resp;
        } catch (err) {
            setApiError(
                err?.response?.data?.error?.message || err.message || "Failed to create lab partner"
            );
        }
    };

    return (
        <LabPageShell
            eyebrow="Lab"
            title="Add lab partner"
            subtitle="Register a new external laboratory vendor."
            breadcrumbs={[
                { label: "Lab", to: "/org/lab" },
                { label: "Directory", to: "/org/lab/directory" },
                { label: "New partner" },
            ]}
        >
            <LabPartnerForm
                onSubmit={onSubmit}
                onCancel={() => navigate("/org/lab/directory")}
                submitLabel="Create partner"
                pending={createMut.isPending}
                apiError={apiError}
            />
        </LabPageShell>
    );
}
