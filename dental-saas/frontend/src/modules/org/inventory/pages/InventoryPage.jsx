/**
 * InventoryPage.jsx — Inventory Workspace (Org Plane)
 *
 * Tab layout: Dashboard | Items | Purchase Orders | Alerts
 *
 * Zero-Trust Compliant:
 *   - useCapability() gates at component level
 *   - All data via React Query hooks → DTO-shaped responses
 *   - No manual refetch — invalidation is hook-managed
 */

import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
    CubeIcon,
    ClipboardDocumentListIcon,
    ExclamationTriangleIcon,
    ChartBarIcon,
    PlusIcon,
} from "@heroicons/react/24/outline";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useInventoryAlerts } from "../hooks/useInventory";

import InventoryDashboard from "../components/InventoryDashboard";
import InventoryItemsTable from "../components/InventoryItemsTable";
import PurchaseOrdersTable from "../components/PurchaseOrdersTable";
import AlertsPanel from "../components/AlertsPanel";

import ItemFormDrawer from "../components/ItemFormDrawer";
import ItemDetailDrawer from "../components/ItemDetailDrawer";
import StockOperationsModal from "../components/StockOperationsModal";
import CreatePODrawer from "../components/CreatePODrawer";
import PODetailDrawer from "../components/PODetailDrawer";

import "./InventoryPage.css";

const TABS = [
    { key: "dashboard", label: "Overview", icon: ChartBarIcon },
    { key: "items", label: "Items", icon: CubeIcon },
    { key: "orders", label: "Purchase Orders", icon: ClipboardDocumentListIcon },
    { key: "alerts", label: "Alerts", icon: ExclamationTriangleIcon },
];

export default function InventoryPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const canCreate = useCapability(P.INVENTORY_CREATE);
    const canUpdate = useCapability(P.INVENTORY_UPDATE);

    const activeTab = searchParams.get("tab") || "dashboard";
    const setTab = (key) => setSearchParams({ tab: key }, { replace: true });

    // Badge counts for tab headers
    const { data: alertsResp } = useInventoryAlerts();
    const alertsCount = useMemo(() => {
        const list = alertsResp?.items || alertsResp?.data || alertsResp || [];
        return Array.isArray(list) ? list.length : 0;
    }, [alertsResp]);

    // ── Panel/drawer state (lifted so actions from any tab can open them) ────
    const [itemFormState, setItemFormState] = useState({ open: false, item: null });
    const [itemDetailId, setItemDetailId] = useState(null);
    const [stockOp, setStockOp] = useState({ open: false, item: null, mode: "add" });
    const [poFormOpen, setPoFormOpen] = useState(false);
    const [poDetail, setPoDetail] = useState(null);

    const openCreateItem = () => setItemFormState({ open: true, item: null });
    const openEditItem = (item) => setItemFormState({ open: true, item });
    const openItemDetail = (item) => setItemDetailId(item?._id || item);
    const openStockOp = (item, mode = "add") => setStockOp({ open: true, item, mode });

    const openCreatePO = () => setPoFormOpen(true);
    const openPODetail = (po) => setPoDetail(po);

    return (
        <div className="inv-page">
            {/* ── Page Header ── */}
            <div className="inv-page-header">
                <div>
                    <h1>Inventory</h1>
                    <p>Track supplies, stock levels, and purchase orders.</p>
                </div>
                <div className="inv-header-actions">
                    {canCreate && (
                        <button className="inv-btn outline" onClick={openCreatePO}>
                            <ClipboardDocumentListIcon className="w-4 h-4" />
                            New Purchase Order
                        </button>
                    )}
                    {canCreate && (
                        <button className="inv-btn primary" onClick={openCreateItem}>
                            <PlusIcon className="w-4 h-4" />
                            Add Item
                        </button>
                    )}
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="inv-tabs" role="tablist">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const isActive = activeTab === t.key;
                    const count = t.key === "alerts" ? alertsCount : null;
                    return (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={isActive}
                            className={`inv-tab ${isActive ? "active" : ""}`}
                            onClick={() => setTab(t.key)}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                            {count > 0 && <span className="inv-tab-count">{count}</span>}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ── */}
            {activeTab === "dashboard" && (
                <InventoryDashboard
                    onOpenItem={openItemDetail}
                    onOpenCreatePO={openCreatePO}
                    onGoAlerts={() => setTab("alerts")}
                    onGoItems={() => setTab("items")}
                />
            )}

            {activeTab === "items" && (
                <InventoryItemsTable
                    onCreate={openCreateItem}
                    onEdit={openEditItem}
                    onView={openItemDetail}
                    onStockOp={openStockOp}
                    canCreate={canCreate}
                    canUpdate={canUpdate}
                />
            )}

            {activeTab === "orders" && (
                <PurchaseOrdersTable
                    onCreate={openCreatePO}
                    onView={openPODetail}
                    canCreate={canCreate}
                />
            )}

            {activeTab === "alerts" && (
                <AlertsPanel
                    onOpenItem={openItemDetail}
                    onAddStock={(item) => openStockOp(item, "add")}
                    onCreatePO={openCreatePO}
                />
            )}

            {/* ── Drawers / Modals ── */}
            {itemFormState.open && (
                <ItemFormDrawer
                    item={itemFormState.item}
                    onClose={() => setItemFormState({ open: false, item: null })}
                />
            )}

            {itemDetailId && (
                <ItemDetailDrawer
                    itemId={itemDetailId}
                    onClose={() => setItemDetailId(null)}
                    onEdit={(item) => {
                        setItemDetailId(null);
                        openEditItem(item);
                    }}
                    onStockOp={(item, mode) => {
                        setItemDetailId(null);
                        openStockOp(item, mode);
                    }}
                    canUpdate={canUpdate}
                />
            )}

            {stockOp.open && (
                <StockOperationsModal
                    item={stockOp.item}
                    initialMode={stockOp.mode}
                    onClose={() => setStockOp({ open: false, item: null, mode: "add" })}
                />
            )}

            {poFormOpen && (
                <CreatePODrawer
                    onClose={() => setPoFormOpen(false)}
                />
            )}

            {poDetail && (
                <PODetailDrawer
                    po={poDetail}
                    onClose={() => setPoDetail(null)}
                    canUpdate={canUpdate}
                />
            )}
        </div>
    );
}
