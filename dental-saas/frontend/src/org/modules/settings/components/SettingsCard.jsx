import React from "react";
import { Link } from "react-router-dom";

/**
 * SettingsCard.jsx — Core UI unit for the Settings Hub.
 */
export default function SettingsCard({ 
    icon: Icon, 
    title, 
    description, 
    path, 
    iconColor = "blue" // blue, emerald, purple, amber, rose, sky, slate
}) {
    // Icon color map
    const colorMap = {
        blue:    "text-blue-500 bg-blue-50",
        emerald: "text-emerald-500 bg-emerald-50",
        purple:  "text-purple-500 bg-purple-50",
        amber:   "text-amber-500 bg-amber-50",
        rose:    "text-rose-500 bg-rose-50",
        sky:     "text-sky-500 bg-sky-50",
        slate:   "text-slate-500 bg-slate-50",
    };
    const c = colorMap[iconColor] || colorMap.blue;

    return (
        <Link
            to={path}
            className="group flex flex-col p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-gray-200 transition-all duration-200 cursor-pointer"
        >
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${c} rounded-xl flex items-center justify-center p-2.5 transition-colors group-hover:bg-white border border-transparent group-hover:border-current`}>
                    <Icon className="w-full h-full" strokeWidth={2} />
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {title}
                </h3>
            </div>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed">
                {description}
            </p>
        </Link>
    );
}
