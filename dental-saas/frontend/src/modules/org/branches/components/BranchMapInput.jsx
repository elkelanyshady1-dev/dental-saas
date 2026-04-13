/**
 * BranchMapInput.jsx — Branch Geolocation Picker (v32.3)
 * Provides address autocomplete + map marker selection.
 */
import { GoogleMap, Marker, useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

const containerStyle = {
  width: "100%",
  height: "300px",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
};

const defaultCenter = {
  lat: 30.0444, // Cairo default
  lng: 31.2357,
};

const libraries = ["places"];

export default function BranchMapInput({ value, onChange }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: libraries,
  });

  const [mapCenter, setMapCenter] = useState(value?.lat ? { lat: value.lat, lng: value.lng } : defaultCenter);
  const [marker, setMarker] = useState(value?.lat ? { lat: value.lat, lng: value.lng } : null);
  const autocompleteRef = useRef(null);

  // Sync with value if it changes externally
  useEffect(() => {
    if (value?.lat && value?.lng) {
      const loc = { lat: value.lat, lng: value.lng };
      setMapCenter(loc);
      setMarker(loc);
    }
  }, [value]);

  const onPlaceChanged = () => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();

    if (!place.geometry) return;

    const location = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      address: place.formatted_address || place.name || "",
    };

    setMapCenter({ lat: location.lat, lng: location.lng });
    setMarker({ lat: location.lat, lng: location.lng });
    onChange(location);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const location = {
            lat,
            lng,
            address: status === "OK" && results[0] ? results[0].formatted_address : "Current Location",
          };

          setMapCenter(location);
          setMarker(location);
          onChange(location);
        });
      },
      (error) => {
        console.error("Error getting location: ", error);
        toast.error("Location permission denied. Please allow location access in your browser settings.");
      }
    );
  };

  if (loadError) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
      ⚠ Error loading Google Maps API. Check your VITE_GOOGLE_MAPS_KEY and ensure Places API is enabled.
    </div>
  );
  
  if (!isLoaded) return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-xl gap-3">
      <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <span className="text-xs text-slate-400 font-medium tracking-wide">Loading Maps…</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
        📍 Branch Location & Map Pin
      </label>

      {/* Search Input */}
      <div className="relative mb-2">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg z-10 pointer-events-none">search</span>
        <Autocomplete 
          onLoad={(ref) => (autocompleteRef.current = ref)} 
          onPlaceChanged={onPlaceChanged}
        >
          <input
            type="text"
            placeholder="Search clinic address..."
            defaultValue={value?.address || ""}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
          />
        </Autocomplete>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 font-medium">
          Or click on map to set exact clinic location
        </p>
        <button
          type="button"
          onClick={handleUseMyLocation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">my_location</span>
          Use My GPS
        </button>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden shadow-sm relative group">
        <GoogleMap 
          mapContainerStyle={containerStyle} 
          center={mapCenter} 
          zoom={15}
          onClick={(e) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();

            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              if (status === "OK" && results[0]) {
                const location = {
                  lat,
                  lng,
                  address: results[0].formatted_address
                };
                setMapCenter(location);
                setMarker(location);
                onChange(location);
              } else {
                // Fallback if Geocoding fails
                const location = { lat, lng, address: "Custom Pin" };
                setMapCenter(location);
                setMarker(location);
                onChange(location);
              }
            });
          }}
          options={{
              disableDefaultUI: false,
              zoomControl: true,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
              styles: [
                  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
              ]
          }}
        >
          {marker && <Marker position={marker} animation={window.google?.maps?.Animation?.DROP} />}
        </GoogleMap>
        
        {marker && (
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white text-[10px] font-mono px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                {marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}
            </div>
        )}
      </div>

      {marker && (
          <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              Geolocation active for this branch
          </p>
      )}
    </div>
  );
}
