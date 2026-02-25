import React from 'react';

export default function Button({ children, className = '', ...props }) {
    return (
        <button
            className={`w-full h-14 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold shadow-lg transition flex items-center justify-center ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
