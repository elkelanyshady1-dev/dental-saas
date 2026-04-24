/**
 * STLViewer.tsx — full interactive STL viewer for the drawer.
 *
 * Rotate / Zoom / Pan via @react-three/drei's OrbitControls.
 * Used ONLY inside the drawer (never in the grid card) per Phase 3 rules.
 *
 * Fallbacks:
 *   - signedUrl missing → "Model unavailable"
 *   - fetch/parse error → "Failed to load 3D model"
 *
 * Deps required:
 *   npm install three @react-three/fiber @react-three/drei
 */

import React, { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export interface STLViewerProps {
    url: string;
    /** Download target filename surfaced on the fallback button. */
    fileName?: string | null;
    /** Optional height class override — defaults to the drawer's preview slot. */
    className?: string;
}

const STLViewer: React.FC<STLViewerProps> = ({ url, fileName, className }) => {
    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [error, setError] = useState(false);

    // 🚨 MEMORY SAFETY
    //   BufferGeometry holds GPU buffers that are NOT garbage-collected
    //   by JS — three.js requires an explicit .dispose() call. The
    //   second effect below (keyed on `geometry`) handles disposal
    //   through React's standard cleanup cycle: every time `geometry`
    //   changes, the previous cleanup disposes the outgoing value;
    //   unmount disposes the final value. We never dispose manually in
    //   this loader to avoid double-free.
    useEffect(() => {
        let cancelled = false;
        setError(false);
        if (!url) {
            setError(true);
            return () => { /* noop */ };
        }
        const loader = new STLLoader();
        loader.load(
            url,
            (geo) => {
                if (cancelled) {
                    // Effect already torn down — dispose this orphan so
                    // the late async callback doesn't leak a buffer
                    // that React will never see.
                    geo.dispose();
                    return;
                }
                geo.center();
                geo.computeBoundingSphere();
                setGeometry(geo);
            },
            undefined,
            () => {
                if (!cancelled) setError(true);
            }
        );
        return () => {
            cancelled = true;
        };
    }, [url]);

    // Disposal side-channel — runs before the next render (on geometry
    // change) AND on unmount, covering both url-swap and tear-down.
    useEffect(() => {
        return () => {
            if (geometry) geometry.dispose();
        };
    }, [geometry]);

    const wrapperClass = className ?? "w-full h-80 rounded-xl bg-slate-900/95 shadow-sm border border-slate-200 overflow-hidden";

    if (error) {
        return (
            <div className="w-full px-6 py-8 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col items-center text-center text-slate-600">
                <p className="text-sm font-semibold text-slate-800">Failed to load 3D model</p>
                <p className="text-xs text-slate-500 mt-1">
                    The file may be unavailable or the link has expired.
                </p>
                {url ? (
                    <a
                        href={url}
                        download={fileName ?? undefined}
                        className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                        Download file
                    </a>
                ) : null}
            </div>
        );
    }

    if (!geometry) {
        return (
            <div className={wrapperClass}>
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-300">
                    Loading 3D model…
                </div>
            </div>
        );
    }

    const radius = geometry.boundingSphere?.radius ?? 50;

    return (
        <div className={wrapperClass}>
            <Canvas
                camera={{
                    position: [0, 0, radius * 2.5],
                    near:     Math.max(0.1, radius / 1000),
                    far:      Math.max(1000, radius * 10),
                }}
                gl={{ antialias: true }}
            >
                <ambientLight intensity={0.8} />
                <directionalLight position={[10, 10, 10]} intensity={0.9} />
                <directionalLight position={[-10, -5, -5]} intensity={0.25} />
                <mesh geometry={geometry}>
                    <meshStandardMaterial color="#E5E7EB" metalness={0.2} roughness={0.6} />
                </mesh>
                <OrbitControls enableZoom enablePan enableRotate makeDefault />
            </Canvas>
        </div>
    );
};

export default STLViewer;
