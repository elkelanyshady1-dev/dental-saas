/**
 * useGoogleMaps.js — Dynamic Google Maps JS SDK loader (v32.1)
 *
 * Loads the Maps JavaScript API + Places library on demand.
 * Uses a module-level singleton promise to prevent duplicate script tags.
 *
 * Usage:
 *   const { isLoaded, isError } = useGoogleMaps();
 *   if (isLoaded) { new window.google.maps.places.Autocomplete(...) }
 */
import { useState, useEffect } from "react";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || "";

let _loadPromise = null;

function loadMapsScript() {
    if (_loadPromise) return _loadPromise;

    // Already loaded
    if (window.google?.maps?.places) {
        _loadPromise = Promise.resolve();
        return _loadPromise;
    }

    _loadPromise = new Promise((resolve, reject) => {
        if (!MAPS_KEY || MAPS_KEY === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
            reject(new Error("VITE_GOOGLE_MAPS_KEY is not configured. Add your key to .env"));
            return;
        }

        const callbackName = "__gmapsLoaded_" + Date.now();
        window[callbackName] = () => { resolve(); delete window[callbackName]; };

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&callback=${callbackName}&loading=async`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error("Failed to load Google Maps SDK"));
        document.head.appendChild(script);
    });

    return _loadPromise;
}

export function useGoogleMaps() {
    const [isLoaded, setIsLoaded] = useState(!!window.google?.maps?.places);
    const [isError, setIsError]   = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        if (isLoaded) return;

        loadMapsScript()
            .then(() => setIsLoaded(true))
            .catch(err => {
                setIsError(true);
                setErrorMsg(err.message);
                // Reset singleton so caller can retry after key is configured
                _loadPromise = null;
            });
    }, [isLoaded]);

    return { isLoaded, isError, errorMsg };
}
