import { useState, useEffect } from "react";
// In the future this should fetch from a global email logs endpoint.
// For now, it serves as a placeholder for the Enterprise UI requirement.

export default function SystemEmailPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mail Gateway Logs</h1>
                <p className="text-gray-500 mt-1 text-sm">Global visibility into platform transactional email dispatches</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4 border border-blue-100">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">Global Mail Logging Coming Soon</h3>
                <p className="text-gray-500 text-sm max-w-md">Currently, Email Delivery logs are visible specifically inside each Organization's Billing tab for high security.</p>
            </div>
        </div>
    );
}
