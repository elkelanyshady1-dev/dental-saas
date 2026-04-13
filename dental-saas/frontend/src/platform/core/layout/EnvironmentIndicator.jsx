/**
 * EnvironmentIndicator.tsx
 * v11.1 Sovereign Governance — Safety Guard
 */

import React from 'react';

const EnvironmentIndicator = () => {
    const isProd = process.env.NODE_ENV === 'production';
    const environment = isProd ? 'PRODUCTION' : 'DEVELOPMENT';

    return (
        <div className={`
      w-full h-1 text-[10px] font-bold flex items-center justify-center tracking-[0.2em] z-50
      ${isProd ? 'bg-red-600' : 'bg-yellow-500 text-slate-900'}
    `}>
            {environment} SOVEREIGN NODE — USE WITH CAUTION
        </div>
    );
};

export default EnvironmentIndicator;
