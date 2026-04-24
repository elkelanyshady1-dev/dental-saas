/**
 * LabPartnerEdit — edit an existing lab partner.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LabPageShell from "../components/LabPageShell";
import LabPartnerForm from "../components/LabPartnerForm";
import { useLabPartner, useUpdateLabPartner } from "../hooks/useLab";

export default function LabPartnerEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: resp, isLoading } = useLabPartner(id);
    const updateMut = useUpdateLabPartner();
    const [apiError, setApiError] = useState(null);

    const partner = resp?.data;

    const onSubmit = async (payload) => {
        setApiError(null);
        try {
            await updateMut.mutateAsync({ id, data: payload });
            navigate("/org/lab/directory");
        } catch (err) {
            setApiError(
                err?.response?.data?.error?.message || err.message || "Failed to update partner"
            );
        }
    };

    return (
        <LabPageShell
            eyebrow="Lab"
            title={partner ? `Edit ${partner.displayName}` : "Edit lab partner"}
            subtitle={partner ? partner.location : null}
            breadcrumbs={[
                { label: "Lab", to: "/org/lab" },
                { label: "Directory", to: "/org/lab/directory" },
                { label: partner?.displayName || "Edit" },
            ]}
        >
            {isLoading && <Skeleton />}
            {!isLoading && !partner && <NotFound />}
            {!isLoading && partner && (
                <LabPartnerForm
                    initialValues={partner}
                    onSubmit={onSubmit}
                    onCancel={() => navigate("/org/lab/directory")}
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
            <p className="text-text-muted">Lab partner not found.</p>
        </div>
    );
}
