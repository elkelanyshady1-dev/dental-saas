import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { countries } from './countryList';

/**
 * SearchableCountrySelect
 * A lightweight searchable dropdown for ISO country selection.
 */
export default function SearchableCountrySelect({ value, onChange, error }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    // Filter countries based on search
    const filteredCountries = useMemo(() => {
        if (!search) return countries;
        const lowSearch = search.toLowerCase();
        return countries.filter(c =>
            c.name.toLowerCase().includes(lowSearch) ||
            c.code.toLowerCase().includes(lowSearch)
        );
    }, [search]);

    // Current selected country object
    const selectedCountry = useMemo(() =>
        countries.find(c => c.code === value),
        [value]);

    // Handle clicks outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && activeIndex >= 0) {
            const el = document.getElementById(`country-option-${activeIndex}`);
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, isOpen]);

    const handleSelect = (country) => {
        onChange(country.code);
        setSearch('');
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => (prev < filteredCountries.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && filteredCountries[activeIndex]) {
                    handleSelect(filteredCountries[activeIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
            case 'Tab':
                setIsOpen(false);
                break;
            default:
                break;
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <div
                className={`relative w-full bg-slate-800 border ${error ? 'border-red-500/50 ring-1 ring-red-500/20' : 'border-slate-700'} rounded-xl cursor-text transition-all focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50`}
                onClick={() => {
                    setIsOpen(true);
                    inputRef.current?.focus();
                }}
            >
                <div className="flex items-center px-4 py-2.5">
                    {selectedCountry ? (
                        <span className="text-slate-100 text-sm flex items-center gap-2">
                            <span>{selectedCountry.flag}</span>
                            <span>{selectedCountry.name} ({selectedCountry.code})</span>
                        </span>
                    ) : (
                        <span className="text-slate-600 text-sm">Select a country...</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-[60] mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 origin-top">
                    {/* Search Input */}
                    <div className="p-2 border-b border-slate-800">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full bg-slate-800 border-none rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:ring-1 focus:ring-blue-500/50 outline-none"
                                placeholder="Search countries..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setActiveIndex(0);
                                }}
                                onKeyDown={handleKeyDown}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Results List */}
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map((country, index) => (
                                <button
                                    key={country.code}
                                    id={`country-option-${index}`}
                                    type="button"
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${index === activeIndex ? 'bg-blue-600 text-white' :
                                        country.code === value ? 'bg-blue-500/10 text-blue-400' : 'text-slate-300 hover:bg-slate-800'
                                        }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelect(country);
                                    }}
                                    onMouseMove={() => setActiveIndex(index)}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-base">{country.flag}</span>
                                        <span>{country.name}</span>
                                        <span className={`text-xs ${index === activeIndex ? 'text-blue-100' : 'text-slate-500'}`}>({country.code})</span>
                                    </div>
                                    {country.code === value && <Check className="w-4 h-4" />}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm text-slate-500">No countries found</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {error && (
                <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1 animate-in slide-in-from-top-1 duration-200">
                    {error}
                </p>
            )}
        </div>
    );
}
