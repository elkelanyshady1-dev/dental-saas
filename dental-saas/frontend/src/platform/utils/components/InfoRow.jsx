import React from "react";

export function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-xs uppercase text-slate-500 tracking-wider font-semibold mb-1">{label}</p>
            <p className="text-sm font-medium text-slate-700">{value}</p>
        </div>
    );
}
