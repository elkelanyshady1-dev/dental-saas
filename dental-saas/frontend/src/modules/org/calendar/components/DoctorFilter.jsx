/**
 * DoctorFilter.jsx — Doctor Selector for Calendar Filtering
 */
import { useState, useEffect } from "react";
import { appointmentsApi } from "../api/appointments.api";

export default function DoctorFilter({ value, onChange }) {
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        appointmentsApi.getDoctors()
            .then((res) => {
                setDoctors(res.data?.users || res.data?.data || res.data || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="relative group">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-14 pl-12 pr-10 rounded-2xl text-xs font-black uppercase tracking-widest bg-surface-low border-none text-text-primary focus:ring-2 focus:ring-brand-primary/10 transition-all duration-300 appearance-none min-w-[200px] cursor-pointer"
            >
                <option value="">All Practitioners</option>
                {loading ? (
                    <option disabled>Loading...</option>
                ) : (
                    doctors.map((d) => {
                        const name = d.firstName
                            ? `Dr. ${d.firstName} ${d.lastName || ""}`.trim()
                            : d.name || d.email;
                        return (
                            <option key={d._id} value={d._id}>{name}</option>
                        );
                    })
                )}
            </select>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">🩺</div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
    );
}
