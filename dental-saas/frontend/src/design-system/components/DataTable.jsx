/**
 * DataTable.jsx — Governed Data Table Component
 *
 * Renders a structured table with consistent headers, row styling,
 * hover states, and empty-state handling.
 *
 * Usage:
 *   <DataTable
 *     columns={["Name", "Status", "Price"]}
 *     rows={data}
 *     renderRow={(row, idx) => (
 *       <tr key={row._id}>
 *         <td>{row.name}</td>
 *         <td><Badge status={row.status} /></td>
 *         <td>{row.price}</td>
 *       </tr>
 *     )}
 *     emptyMessage="No versions yet."
 *   />
 */
import React from "react";

const TH_STYLE = {
    textAlign: "left",
    padding: "0.6rem 1rem",
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#94a3b8",
    fontWeight: 600,
    background: "rgba(15,23,42,0.5)",
    borderBottom: "1px solid rgba(51,65,85,0.6)",
    whiteSpace: "nowrap",
};

export function DataTable({
    columns = [],
    rows = [],
    renderRow,
    loading = false,
    emptyMessage = "No data.",
    className = "",
    style,
}) {
    return (
        <div
            className={["overflow-hidden rounded-xl backdrop-blur-md", className].filter(Boolean).join(" ")}
            style={{
                background: "rgba(22,32,52,0.92)",
                border: "1px solid rgba(71,85,105,0.6)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                ...style,
            }}
        >
            {loading ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "#475569", fontSize: "0.875rem" }}>
                    Loading…
                </div>
            ) : rows.length === 0 ? (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "#475569", fontSize: "0.875rem" }}>
                    {emptyMessage}
                </div>
            ) : (
                <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                        {columns.length > 0 && (
                            <thead>
                                <tr>
                                    {columns.map(col => (
                                        <th key={typeof col === "string" ? col : col.key} style={TH_STYLE}>
                                            {typeof col === "string" ? col : col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {rows.map((row, idx) => renderRow(row, idx))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default DataTable;
