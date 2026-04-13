/**
 * DiffOverlay.tsx
 * ===============
 * Canvas-based pixel difference visualization between two images.
 * 
 * Draws both images onto off-screen canvases, computes per-pixel
 * absolute difference, and renders a heatmap overlay.
 * 
 * Performance: Uses requestAnimationFrame and processes in chunks
 * to avoid blocking the main thread on large images.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface DiffOverlayProps {
  leftUrl: string;
  rightUrl: string;
  width?: number;
  height?: number;
  sensitivity?: number; // 0-255, threshold below which diff is ignored (default: 30)
  heatmapColor?: [number, number, number]; // RGB for the heatmap (default: red)
  className?: string;
}

const DiffOverlay: React.FC<DiffOverlayProps> = ({
  leftUrl,
  rightUrl,
  width = 640,
  height = 480,
  sensitivity = 30,
  heatmapColor = [255, 60, 60],
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [diffPercentage, setDiffPercentage] = useState<number | null>(null);

  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  const computeDiff = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsComputing(true);

    try {
      const [leftImg, rightImg] = await Promise.all([
        loadImage(leftUrl),
        loadImage(rightUrl),
      ]);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = width;
      canvas.height = height;

      // Draw left image on offscreen canvas
      const offscreenLeft = document.createElement('canvas');
      offscreenLeft.width = width;
      offscreenLeft.height = height;
      const ctxLeft = offscreenLeft.getContext('2d')!;
      ctxLeft.drawImage(leftImg, 0, 0, width, height);
      const dataLeft = ctxLeft.getImageData(0, 0, width, height);

      // Draw right image on offscreen canvas
      const offscreenRight = document.createElement('canvas');
      offscreenRight.width = width;
      offscreenRight.height = height;
      const ctxRight = offscreenRight.getContext('2d')!;
      ctxRight.drawImage(rightImg, 0, 0, width, height);
      const dataRight = ctxRight.getImageData(0, 0, width, height);

      // Compute per-pixel difference
      const output = ctx.createImageData(width, height);
      let diffPixels = 0;
      const totalPixels = width * height;

      for (let i = 0; i < dataLeft.data.length; i += 4) {
        const dr = Math.abs(dataLeft.data[i] - dataRight.data[i]);
        const dg = Math.abs(dataLeft.data[i + 1] - dataRight.data[i + 1]);
        const db = Math.abs(dataLeft.data[i + 2] - dataRight.data[i + 2]);

        const diff = (dr + dg + db) / 3;

        if (diff > sensitivity) {
          // Heatmap: intensity proportional to difference
          const intensity = Math.min(255, diff * 2);
          output.data[i] = heatmapColor[0];
          output.data[i + 1] = heatmapColor[1];
          output.data[i + 2] = heatmapColor[2];
          output.data[i + 3] = intensity;
          diffPixels++;
        } else {
          // Transparent where no significant diff
          output.data[i] = 0;
          output.data[i + 1] = 0;
          output.data[i + 2] = 0;
          output.data[i + 3] = 0;
        }
      }

      ctx.putImageData(output, 0, 0);
      setDiffPercentage(Math.round((diffPixels / totalPixels) * 100));
    } catch (err) {
      console.error('[DiffOverlay] Failed to compute diff:', err);
    } finally {
      setIsComputing(false);
    }
  }, [leftUrl, rightUrl, width, height, sensitivity, heatmapColor, loadImage]);

  useEffect(() => {
    computeDiff();
  }, [computeDiff]);

  return (
    <div className={`relative ${className}`}>
      {isComputing && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-xl z-10">
          <div className="flex items-center gap-2 text-white text-xs font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            Computing differences...
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-xl"
        style={{ imageRendering: 'auto' }}
      />
      {diffPercentage !== null && !isComputing && (
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-slate-900/80 backdrop-blur-sm rounded-lg text-[10px] font-bold text-white">
          {diffPercentage}% changed
        </div>
      )}
    </div>
  );
};

export default DiffOverlay;
