/**
 * AuditIntegrityPage.jsx
 * v19.0 — Immutable Audit Ledger Integrity Verification UI
 *
 * Token-aligned rewrite. No bg-slate-950 / standalone dark screen.
 * Integrated into PlatformLayout — no own min-h-screen.
 */
import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { platformApiClient } from '../../core/api/platformApiClient';
import PageContainer from '../../core/ui/PageContainer';
import Card, { CardHeader } from '../../core/ui/Card';
import { AlertBanner, LoadingState } from '../../core/ui/Feedback';
import Button from '../../core/ui/Button';

const AuditIntegrityPage = () => {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const runVerification = async () => {
        try {
            setLoading(true);
            setError(null);
            setResult(null);
            const { data } = await platformApiClient.audit.auditVerifyChainList();
            setResult(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Verification request failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageContainer
            title="Audit Chain Integrity"
            subtitle="Walks the audit ledger chronologically and recomputes SHA-256 hashes to verify no record has been tampered with"
            icon={ShieldCheck}
            actions={
                <Button
                    variant="primary"
                    size="md"
                    icon={RefreshCw}
                    loading={loading}
                    onClick={runVerification}
                >
                    {loading ? 'Scanning chain…' : 'Run Verification'}
                </Button>
            }
        >
            <div className="max-w-2xl space-y-6">
                {/* Error state */}
                <AlertBanner variant="error" message={error} />

                {/* Loading */}
                {loading && <LoadingState message="Walking audit ledger…" />}

                {/* Result */}
                {result && (
                    <Card variant={result.valid ? "success" : "danger"}>
                        {/* Status headline */}
                        <div className="flex items-center gap-4 mb-5">
                            {result.valid
                                ? <ShieldCheck className="w-10 h-10 text-emerald-500 shrink-0" />
                                : <ShieldAlert className="w-10 h-10 text-red-500 shrink-0" />
                            }
                            <div>
                                <p className={`text-2xl font-black tracking-tight ${result.valid ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {result.valid ? 'Chain Intact' : 'Chain Compromised'}
                                </p>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    {result.scannedEntries} entries scanned · Region: {result.regionCode}
                                </p>
                            </div>
                        </div>

                        {/* Tampered entry detail */}
                        {!result.valid && result.brokenAt && (
                            <div className="p-4 bg-white border border-red-200 rounded-xl font-mono text-xs text-slate-600 space-y-1.5">
                                <p className="text-red-600 font-bold text-sm mb-2">Tampered Entry Detected</p>
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                                    <span className="text-slate-400">Entry ID</span>
                                    <span className="text-slate-800">{result.brokenAt.entryId}</span>
                                    <span className="text-slate-400">Action</span>
                                    <span className="text-slate-800">{result.brokenAt.action}</span>
                                    <span className="text-slate-400">Created</span>
                                    <span className="text-slate-800">{new Date(result.brokenAt.createdAt).toISOString()}</span>
                                    <span className="text-slate-400">Expected</span>
                                    <span className="text-amber-600">{result.brokenAt.expectedHash?.slice(0, 32)}…</span>
                                    <span className="text-slate-400">Stored</span>
                                    <span className="text-red-600">{result.brokenAt.storedHash?.slice(0, 32)}…</span>
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <p className="text-[10px] text-slate-400 font-mono uppercase mt-4">
                            Verified at: {result.verifiedAt}
                        </p>
                    </Card>
                )}

                {/* Pre-run info card */}
                {!result && !loading && (
                    <Card variant="muted" className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 shrink-0">
                            <Search className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-700 mb-1">Ready to verify</p>
                            <p className="text-sm text-slate-500">
                                The verification process walks every audit entry in the ledger and validates
                                the cryptographic hash chain. Any tampering will break the chain and be
                                flagged with the exact entry ID.
                            </p>
                        </div>
                    </Card>
                )}
            </div>
        </PageContainer>
    );
};

export default AuditIntegrityPage;
