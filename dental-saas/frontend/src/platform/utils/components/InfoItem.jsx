import React from "react";
import { STATUS_TEXT_MAP } from "../../constants/statusStyles";

export function InfoItem({ label, value, isBold, isCaps, statusColor }) {
    return (
        <div className="flex flex-col">
            <span className="text-xs text-slate-500 mb-0.5">{label}</span>
            <span className={`text-[13px] ${isBold ? 'font-bold' : 'font-medium'} ${isCaps ? 'uppercase' : ''} ${statusColor ? (STATUS_TEXT_MAP[statusColor?.toLowerCase()] || 'text-slate-900') : 'text-slate-900'}`}>
                {value}
            </span>
        </div>
    );
}
