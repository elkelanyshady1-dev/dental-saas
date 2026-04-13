import React, { useState, useEffect } from 'react';
import { portalApi } from '@/modules/patientDomain/shared/api/patientDomain.api';
import {
    CheckCircleIcon,
    MapPinIcon,
    CalendarDaysIcon,
    ClockIcon,
    ChevronRightIcon,
    ChevronLeftIcon
} from '@heroicons/react/24/outline';

const steps = ['Branch', 'Date', 'Time', 'Confirm'];

export default function BookingPage() {
    const [currentStep, setCurrentStep] = useState(0);
    const [branches, setBranches] = useState([
        { _id: 'b1', name: 'Downtown Medical Center', address: '123 Main St, Dubai' },
        { _id: 'b2', name: 'Marina Dental Health', address: 'Al Marsa St, Dubai' }
    ]);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [slots, setSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Fetch slots when branch and date are selected
    useEffect(() => {
        if (selectedBranch && selectedDate) {
            fetchSlots();
        }
    }, [selectedBranch, selectedDate]);

    const fetchSlots = async () => {
        setLoading(true);
        try {
            // In real app: const data = await portalApi.get(`/portal/booking/slots?branchId=${selectedBranch._id}&date=${selectedDate}`);
            // Mocking response for UI flow
            setTimeout(() => {
                setSlots([
                    { time: '09:00', startTime: new Date() },
                    { time: '09:30', startTime: new Date() },
                    { time: '10:00', startTime: new Date() },
                    { time: '11:00', startTime: new Date() },
                    { time: '14:00', startTime: new Date() },
                ]);
                setLoading(false);
            }, 800);
        } catch (err) {
            setLoading(false);
        }
    };

    const handleBooking = async () => {
        setLoading(true);
        try {
            // await portalApi.post('/portal/booking/request', { branchId: selectedBranch._id, startTime: selectedSlot.startTime });
            setTimeout(() => {
                setSuccess(true);
                setLoading(false);
            }, 1500);
        } catch (err) {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="bg-white rounded-[40px] p-12 text-center shadow-xl border border-slate-100 max-w-xl mx-auto space-y-6">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircleIcon className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-black text-slate-900">Request Submitted!</h2>
                <p className="text-slate-500 font-bold px-6 leading-relaxed">
                    Your booking request for <span className="text-slate-900">{selectedSlot.time}</span> at <span className="text-slate-900">{selectedBranch.name}</span> has been received.
                    We will notify you via SMS once confirmed.
                </p>
                <button
                    onClick={() => window.location.href = '/portal/dashboard'}
                    className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:shadow-xl transition-all active:scale-95"
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-10">
            <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Book an Appointment</h2>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">Step {currentStep + 1} of 4: {steps[currentStep]}</p>
            </div>

            {/* Progress Multi-step Indicator */}
            <div className="relative flex justify-between">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 -z-10 rounded-full" />
                <div
                    className="absolute top-1/2 left-0 h-1 bg-blue-600 -translate-y-1/2 -z-10 rounded-full transition-all duration-500"
                    style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                />
                {steps.map((step, idx) => (
                    <div key={step} className="flex flex-col items-center gap-2 group">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black transition-all duration-300 border-4 border-slate-50 ${idx <= currentStep ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-300'
                            }`}>
                            {idx < currentStep ? <CheckCircleIcon className="w-6 h-6" /> : idx + 1}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-8 md:p-12 min-h-[400px] flex flex-col justify-between">

                {currentStep === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {branches.map(branch => (
                            <button
                                key={branch._id}
                                onClick={() => { setSelectedBranch(branch); setCurrentStep(1); }}
                                className={`p-8 text-left rounded-3xl border-2 transition-all hover:shadow-lg ${selectedBranch?._id === branch._id ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'
                                    }`}
                            >
                                <MapPinIcon className="w-8 h-8 text-blue-600 mb-4" />
                                <h4 className="font-black text-slate-900 text-lg mb-1">{branch.name}</h4>
                                <p className="text-slate-400 font-bold text-sm tracking-tight">{branch.address}</p>
                            </button>
                        ))}
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="flex flex-col items-center gap-10">
                        <div className="w-full max-w-sm">
                            <label className="block text-slate-400 font-black uppercase text-xs tracking-widest mb-4">Select Preferred Date</label>
                            <input
                                type="date"
                                className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 transition-colors font-bold text-lg"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                            />
                        </div>
                        {selectedDate && (
                            <button
                                onClick={() => setCurrentStep(2)}
                                className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black shadow-lg hover:shadow-xl transition-all shadow-slate-200"
                            >
                                Next: View Availability
                            </button>
                        )}
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {loading ? <div className="col-span-full py-10 text-center text-slate-400 animate-pulse font-bold">Scanning availability...</div> : (
                                slots.map(slot => (
                                    <button
                                        key={slot.time}
                                        onClick={() => { setSelectedSlot(slot); setCurrentStep(3); }}
                                        className={`py-4 rounded-xl border-2 font-black transition-all ${selectedSlot?.time === slot.time ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-300'
                                            }`}
                                    >
                                        {slot.time}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="max-w-md mx-auto space-y-10 w-full text-center">
                        <div className="p-8 bg-blue-50 rounded-[32px] border border-blue-100 space-y-6">
                            <CalendarDaysIcon className="w-12 h-12 text-blue-600 mx-auto" />
                            <div className="space-y-1">
                                <p className="text-blue-600 font-black uppercase text-xs tracking-widest leading-loose">Booking Summary</p>
                                <h4 className="text-2xl font-black text-slate-900">{selectedBranch.name}</h4>
                                <p className="text-slate-500 font-bold">{selectedDate} at {selectedSlot.time}</p>
                            </div>
                        </div>

                        <button
                            disabled={loading}
                            onClick={handleBooking}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[20px] font-black text-xl shadow-2xl shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                            {loading ? 'Confirming...' : 'Confirm Request'}
                        </button>
                    </div>
                )}

                {/* Navigation Buttons footer */}
                <div className="flex justify-between items-center mt-12 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <button
                        onClick={() => setCurrentStep(prev => prev - 1)}
                        disabled={currentStep === 0 || loading}
                        className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-bold disabled:opacity-30 p-2"
                    >
                        <ChevronLeftIcon className="w-5 h-5" />
                        Back
                    </button>
                    {currentStep < 3 && selectedBranch && (
                        <span className="text-slate-400 text-xs font-bold font-mono">
                            {selectedBranch.name}
                        </span>
                    )}
                </div>

            </div>
        </div>
    );
}
