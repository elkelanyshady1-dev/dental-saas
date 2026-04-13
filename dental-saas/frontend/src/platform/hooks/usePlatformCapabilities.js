/**
 * usePlatformCapabilities.js
 * v21.0 — Context Consumer (Shared State)
 *
 * This hook now reads from PlatformCapabilitiesContext instead of
 * maintaining independent state. All consumers (PlatformBoot,
 * RequireCapability, Sidebar, etc.) share the SAME capability state.
 *
 * The fetch logic lives in PlatformCapabilitiesProvider.
 */
import { useContext } from "react";
import { PlatformCapabilitiesContext } from "../core/providers/PlatformCapabilitiesProvider";

export function usePlatformCapabilities() {
    const context = useContext(PlatformCapabilitiesContext);
    if (!context) {
        throw new Error("usePlatformCapabilities must be used inside PlatformCapabilitiesProvider");
    }
    return context;
}
