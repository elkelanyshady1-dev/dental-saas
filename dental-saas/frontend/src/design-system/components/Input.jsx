/**
 * Input.jsx — Design System Input Component
 * v2.1 — Added description and inputClassName props
 */
import React from "react";

export function Input({ icon, label, error, description, className = "", inputClassName = "", ...props }) {
    return (
        <div className={`w-full ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {label}
                </label>
            )}
            <div className="relative w-full">
                {icon && (
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        {icon}
                    </div>
                )}
                <input
                    className={`w-full h-14 rounded-xl border border-slate-200 px-4 text-slate-900
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        placeholder:text-slate-400 transition
                        disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
                        ${icon ? "pl-11" : ""}
                        ${error ? "border-red-400 focus:ring-red-500" : ""}
                        ${inputClassName}`}
                    {...props}
                />
            </div>
            {description && !error && (
                <p className="mt-1 text-xs text-slate-400">{description}</p>
            )}
            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
}

export default Input;
