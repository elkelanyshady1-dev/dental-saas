import { useState, useEffect, useCallback } from "react";
import { platformOrgService } from "@/platform/services/platformOrgService";

/**
 * useOrgBilling
 *
 * v22.0 — Fetches credit balance from LedgerEngine API.
 * Summary creditBalance is now real, not hardcoded to 0.
 *
 * Returns { invoices, summary, contract, contracts, payments, ledger, loading, error, refresh }
 */
export function useOrgBilling(orgId) {
    const [data, setData] = useState({
        invoices: [], contracts: [], payments: [], ledger: [],
        creditBalance: 0, credits: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [invoicesData, contractsData, paymentsData, ledgerData, creditsData] = await Promise.all([
                platformOrgService.getInvoices(orgId),
                platformOrgService.getContracts(orgId).catch(() => []),
                platformOrgService.getPayments(orgId, { limit: 20 }).catch(() => []),
                platformOrgService.getLedger(orgId, { limit: 30 }).catch(() => []),
                platformOrgService.getCredits(orgId).catch(() => ({ creditBalance: 0, credits: [] }))
            ]);
            setData({
                invoices: invoicesData,
                contracts: contractsData,
                payments: paymentsData,
                ledger: ledgerData,
                creditBalance: creditsData.creditBalance ?? 0,
                credits: creditsData.credits ?? []
            });
            setError(null);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to fetch billing data");
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { refresh(); }, [refresh]);

    const invoices = data.invoices || [];
    const contracts = data.contracts || [];
    const payments = data.payments || [];
    const ledger = data.ledger || [];

    // ── Compute summary client-side from invoices + server credit balance ──
    const activeContract = contracts.find(c => c.contractStatus === "active") || null;
    const summary = invoices.length > 0 ? {
        totalRevenue: invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.totalAmount || 0), 0),
        paidCount: invoices.filter(i => i.status === "paid").length,
        openCount: invoices.filter(i => i.status === "open").length,
        currency: invoices[0]?.currency || "USD",
        // Contract-level fields forwarded from the active contract if available
        contractId: activeContract?._id,
        contractStatus: activeContract?.contractStatus,
        lockedPrice: activeContract?.lockedPrice,
        billingInterval: activeContract?.billingInterval,
        billingCycle: activeContract?.billingCycle,
        effectiveFrom: activeContract?.effectiveFrom,
        effectiveTo: activeContract?.effectiveTo,
        autoRenew: activeContract?.autoRenew,
        // v22.0: Real credit balance from LedgerEngine
        creditBalance: data.creditBalance,
    } : null;

    return {
        invoices,
        summary,
        contract: activeContract,
        contracts,
        payments,
        ledger,
        loading,
        error,
        refresh
    };
}

