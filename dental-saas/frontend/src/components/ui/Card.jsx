import React from 'react';

export default function Card({ children, className = '' }) {
    return (
        <div className={`bg-white rounded-3xl shadow-[0_25px_60px_rgba(37,99,235,0.25)] p-10 w-[420px] relative z-20 ${className}`}>
            {children}
        </div>
    );
}
