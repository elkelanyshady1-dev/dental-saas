import React from "react";

export function Spinner() {
    return (
        <div className="flex items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-medium">Loading...</p>
        </div>
    );
}
