import React from 'react';

export default function Input({ icon, className = '', ...props }) {
    return (
        <div className="relative w-full">
            {icon && (
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    {icon}
                </div>
            )}
            <input
                className={`w-full h-14 rounded-xl border border-slate-200 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${icon ? 'pl-11' : ''} ${className}`}
                {...props}
            />
        </div>
    );
}
