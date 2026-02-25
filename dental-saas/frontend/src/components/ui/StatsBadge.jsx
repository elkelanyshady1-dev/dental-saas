import React from 'react';

export default function StatsBadge({ icon, number, label }) {
    return (
        <div className="flex items-center gap-3">
            <div className="text-blue-600">
                {icon}
            </div>
            <div>
                <div className="font-bold text-2xl text-slate-900 leading-tight">{number}</div>
                <div className="text-slate-500 text-sm font-medium">{label}</div>
            </div>
        </div>
    );
}
