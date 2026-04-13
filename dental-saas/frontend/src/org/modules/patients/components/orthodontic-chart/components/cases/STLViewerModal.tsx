import React from 'react';
import {
  Box,
  X,
  RotateCcw,
  Maximize2,
  ZoomIn,
  Volume2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

/* ═══════════════════════════════════════════════════════════════
   STLViewerModal — Full-screen 3D STL model viewer.
   Extracted from OrthoRecordsTab for lazy loading (performance win).
   ═══════════════════════════════════════════════════════════════ */

const STLModel = ({ url }: { url: string }) => {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial 
        color="#ffffff" 
        roughness={0.1} 
        metalness={0.9} 
        emissive="#111111"
        envMapIntensity={2}
      />
    </mesh>
  );
};

export interface STLViewerModalProps {
  isOpen: boolean;
  selectedStl: { id: string; name: string; url: string } | null;
  onClose: () => void;
}

const STLViewerModal: React.FC<STLViewerModalProps> = ({
  isOpen,
  selectedStl,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && selectedStl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-slate-900 rounded-[40px] shadow-2xl w-full max-w-6xl h-full max-h-[85vh] overflow-hidden flex flex-col border border-white/10"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-900/50 backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedStl.name}</h3>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3D STL Model Viewer</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={onClose}
                  className="p-3 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* 3D Canvas Area */}
            <div className="flex-1 relative bg-slate-950">
              <Canvas shadows camera={{ position: [0, 0, 150], fov: 50 }}>
                <color attach="background" args={['#020617']} />
                <ambientLight intensity={0.1} />
                <spotLight position={[100, 100, 100]} angle={0.15} penumbra={1} intensity={3} castShadow />
                <pointLight position={[-100, -100, -100]} intensity={2} />
                <directionalLight position={[0, 100, 0]} intensity={1.5} />
                <React.Suspense fallback={null}>
                  <Stage environment="city" intensity={1}>
                    <STLModel url={selectedStl.url} />
                  </Stage>
                </React.Suspense>
                <OrbitControls makeDefault />
              </Canvas>

              {/* Controls Overlay */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-white/60">
                      <RotateCcw className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase">Rotate</span>
                    </div>
                    <span className="text-[9px] text-white/30">Left Click</span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-white/60">
                      <Maximize2 className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase">Pan</span>
                    </div>
                    <span className="text-[9px] text-white/30">Right Click</span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-white/60">
                      <ZoomIn className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase">Zoom</span>
                    </div>
                    <span className="text-[9px] text-white/30">Scroll</span>
                  </div>
                </div>
              </div>

              {/* Loading Indicator (Suspense) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                <Box className="w-32 h-32 text-white animate-pulse" />
              </div>
            </div>

            {/* Footer Info */}
            <div className="p-6 bg-slate-900 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Hardware Accelerated</span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-white/40" />
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Standard STL Format</span>
                </div>
              </div>
              <p className="text-[10px] text-white/30 italic">Use mouse to interact with the 3D model</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default STLViewerModal;
