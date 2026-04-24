/**
 * STLPreview.tsx — lightweight auto-rotating STL preview for the grid card.
 *
 * RULES (see Phase 3 brief):
 *   - No OrbitControls — user cannot manipulate the preview.
 *   - Auto-rotate only, driven by R3F's integrated render loop (useFrame).
 *   - Canvas is pointer-events: none so @dnd-kit drag handlers on the
 *     parent PhotoCard still activate (drag = LINK, unchanged).
 *   - Fallback UI on load failure: "3D preview unavailable".
 *
 * Deps required (run once in the repo):
 *   npm install three @react-three/fiber @react-three/drei
 */

import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

function RotatingMesh({ geometry }: { geometry: THREE.BufferGeometry }) {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((_state, delta) => {
        if (ref.current) {
            // ~0.6 rad/s so the mesh rotates visibly but calmly on the card.
            ref.current.rotation.y += 0.6 * delta;
        }
    });
    return (
        <mesh ref={ref} geometry={geometry}>
            <meshStandardMaterial color="#9CA3AF" metalness={0.3} roughness={0.6} />
        </mesh>
    );
}

export interface STLPreviewProps {
    url: string;
}

const STLPreview: React.FC<STLPreviewProps> = ({ url }) => {
    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [error, setError] = useState(false);

    // 🚨 MEMORY SAFETY — three.js BufferGeometry holds GPU buffers that
    //    are NOT garbage-collected. The second effect below disposes
    //    through React's cleanup cycle; we never dispose inline here to
    //    avoid double-free.
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
                    geo.dispose(); // orphan from a late callback — free it.
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

    // Disposal side-channel — runs on every geometry change AND on
    // unmount, keeping GPU buffer ownership tied to the React lifecycle.
    useEffect(() => {
        return () => {
            if (geometry) geometry.dispose();
        };
    }, [geometry]);

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-50 text-xs text-slate-400">
                3D preview unavailable
            </div>
        );
    }

    if (!geometry) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-50 text-xs text-slate-400">
                Loading…
            </div>
        );
    }

    const radius = geometry.boundingSphere?.radius ?? 50;

    return (
        <Canvas
            // pointer-events: none lets the parent PhotoCard keep receiving
            // drag / click events from @dnd-kit without the Canvas intercepting.
            style={{ pointerEvents: "none" }}
            camera={{ position: [0, 0, radius * 2.5], far: Math.max(1000, radius * 10) }}
            frameloop="always"
            // Anti-aliasing off on the card preview — faster on low-end GPUs
            // and the difference is barely visible at thumbnail size.
            gl={{ antialias: false }}
        >
            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 10]} />
            <RotatingMesh geometry={geometry} />
        </Canvas>
    );
};

export default STLPreview;
