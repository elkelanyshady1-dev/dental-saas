import React from 'react';

export default function FeatureItem({ icon, title }) {
    return (
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                {icon}
            </div>
            <span className="text-slate-800 font-semibold text-lg">{title}</span>
        </div>
    );
}
