import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Trash2, LayoutGrid, ZoomIn, ZoomOut, Save, Download,
  Printer, Type, Image as ImageIcon, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, ChevronDown, Lock, Unlock,
  Copy, Eye, EyeOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  PhotoRecord, PrintLayout, PrintLayoutItem,
  PrintLayoutImageItem, PrintLayoutTextItem,
} from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';
import OrthoPrintCanvas from './OrthoPrintCanvas';

/* ═══════════════════════════════════════════════════════════════════════════
   PrintLayoutCanvas v2.0 — Full Visual Layout Editor

   FEATURES
   ─────────
   • Drag & drop photos / text blocks onto A4 canvas
   • 8-point resize handles per item
   • Snap-to-grid (10px, toggleable)
   • Aspect-ratio lock per item
   • Inline text editing (double-click)
   • Font size / weight / style / align controls (right panel)
   • objectFit toggle for images (contain / cover)
   • showLabel toggle per image
   • Layer visibility toggle
   • Duplicate item
   • Keyboard: Delete = remove selected, Escape = deselect
   • Auto layout fills all uploaded photos into equal grid
   • Zoom 30%–150% with keyboard shortcuts (Ctrl+/-)
   • Save → PUT /workflow → workflowData.printLayout
   • Print / Export PDF from canvas toolbar

   ARCHITECTURE
   ─────────────
   All rendering is delegated to <OrthoPrintCanvas> — this component
   only manages editor state (selection, drag, resize, panels).

   COORDINATE SPACE
   ─────────────────
   Logical canvas: A4 landscape 1122×794 px
   Display coords = logical × zoom
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 1122;
const CANVAS_H = 794;
const MIN_W    = 60;
const MIN_H    = 40;
const SNAP_PX  = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function snapTo(v: number, grid: number) { return Math.round(v / grid) * grid; }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function buildAutoLayout(photos: PhotoRecord[]): PrintLayoutImageItem[] {
  if (!photos.length) return [];
  const cols  = Math.ceil(Math.sqrt(photos.length));
  const itemW = Math.floor((CANVAS_W - (cols + 1) * SNAP_PX) / cols);
  const itemH = Math.floor(itemW * 0.75); // 4:3 default
  return photos.map((photo, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      id: uid(),
      type: 'image' as const,
      recordId: photo.id,
      x: SNAP_PX + col * (itemW + SNAP_PX),
      y: SNAP_PX + row * (itemH + SNAP_PX),
      width: itemW,
      height: itemH,
      objectFit: 'contain' as const,
      showLabel: true,
    };
  });
}

// ── Resize handle geometry ────────────────────────────────────────────────────

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: { dir: HandleDir; cursor: string; style: React.CSSProperties }[] = [
  { dir: 'nw', cursor: 'nw-resize', style: { top: -5,     left: -5     } },
  { dir: 'n',  cursor: 'n-resize',  style: { top: -5,     left: '50%', transform: 'translateX(-50%)' } },
  { dir: 'ne', cursor: 'ne-resize', style: { top: -5,     right: -5    } },
  { dir: 'e',  cursor: 'e-resize',  style: { top: '50%',  right: -5,   transform: 'translateY(-50%)' } },
  { dir: 'se', cursor: 'se-resize', style: { bottom: -5,  right: -5    } },
  { dir: 's',  cursor: 's-resize',  style: { bottom: -5,  left: '50%', transform: 'translateX(-50%)' } },
  { dir: 'sw', cursor: 'sw-resize', style: { bottom: -5,  left: -5     } },
  { dir: 'w',  cursor: 'w-resize',  style: { top: '50%',  left: -5,    transform: 'translateY(-50%)' } },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface PrintLayoutCanvasProps {
  isOpen: boolean;
  photos: PhotoRecord[];
  initialLayout?: PrintLayout | null;
  patientName?: string;
  onSave: (layout: PrintLayout) => Promise<void>;
  onPrint: () => void;
  onExportPdf: () => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PrintLayoutCanvas: React.FC<PrintLayoutCanvasProps> = ({
  isOpen, photos, initialLayout, patientName,
  onSave, onPrint, onExportPdf, onClose,
}) => {

  // ── State ──────────────────────────────────────────────────────────────────

  const [items,      setItems]      = useState<PrintLayoutItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom,       setZoom]       = useState(0.72);
  const [snapOn,     setSnapOn]     = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const photoMap = React.useMemo(() => {
    const m: Record<string, PhotoRecord> = {};
    photos.forEach(p => (m[p.id] = p));
    return m;
  }, [photos]);

  const selectedItem = items.find(i => i.id === selectedId) ?? null;

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    setItems(
      initialLayout?.items?.length
        ? initialLayout.items
        : buildAutoLayout(photos)
    );
    setSelectedId(null);
    setEditingTextId(null);
  }, [isOpen, initialLayout, photos]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') { setSelectedId(null); setEditingTextId(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setItems(prev => prev.filter(i => i.id !== selectedId));
        setSelectedId(null);
      }
      if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1)));
      }
      if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, selectedId]);

  // ── Drag ───────────────────────────────────────────────────────────────────

  const dragRef = useRef<{
    itemId: string; startCX: number; startCY: number; origX: number; origY: number;
    aspectLocked: boolean; origW: number; origH: number;
  } | null>(null);

  const startDrag = useCallback((e: React.MouseEvent, itemId: string) => {
    if (editingTextId === itemId) return;
    e.preventDefault(); e.stopPropagation();
    setSelectedId(itemId);
    const item = items.find(i => i.id === itemId)!;
    dragRef.current = {
      itemId, startCX: e.clientX, startCY: e.clientY,
      origX: item.x, origY: item.y,
      aspectLocked: false, origW: item.width, origH: item.height,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      let nx = dragRef.current.origX + (ev.clientX - dragRef.current.startCX) / zoom;
      let ny = dragRef.current.origY + (ev.clientY - dragRef.current.startCY) / zoom;
      if (snapOn) { nx = snapTo(nx, SNAP_PX); ny = snapTo(ny, SNAP_PX); }
      setItems(prev => prev.map(it => {
        if (it.id !== dragRef.current!.itemId) return it;
        return { ...it, x: clamp(nx, 0, CANVAS_W - it.width), y: clamp(ny, 0, CANVAS_H - it.height) };
      }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [items, zoom, snapOn, editingTextId]);

  // ── Resize ─────────────────────────────────────────────────────────────────

  const resizeRef = useRef<{
    itemId: string; dir: HandleDir;
    startCX: number; startCY: number;
    origX: number; origY: number; origW: number; origH: number;
    aspectRatio: number; aspectLocked: boolean;
  } | null>(null);

  const startResize = useCallback((e: React.MouseEvent, itemId: string, dir: HandleDir) => {
    e.preventDefault(); e.stopPropagation();
    const item = items.find(i => i.id === itemId)!;
    resizeRef.current = {
      itemId, dir, startCX: e.clientX, startCY: e.clientY,
      origX: item.x, origY: item.y, origW: item.width, origH: item.height,
      aspectRatio: item.width / item.height,
      aspectLocked: aspectLockedIds.has(itemId),
    };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const rs = resizeRef.current;
      const dx = (ev.clientX - rs.startCX) / zoom;
      const dy = (ev.clientY - rs.startCY) / zoom;
      const d  = rs.dir;
      setItems(prev => prev.map(it => {
        if (it.id !== rs.itemId) return it;
        let { x, y, width, height } = it;
        if (d.includes('e')) width  = Math.max(MIN_W, rs.origW + dx);
        if (d.includes('s')) height = Math.max(MIN_H, rs.origH + dy);
        if (d.includes('w')) { const nw = Math.max(MIN_W, rs.origW - dx); x = rs.origX + rs.origW - nw; width = nw; }
        if (d.includes('n')) { const nh = Math.max(MIN_H, rs.origH - dy); y = rs.origY + rs.origH - nh; height = nh; }
        if (rs.aspectLocked) {
          if (d.includes('e') || d.includes('w')) height = width / rs.aspectRatio;
          else                                     width  = height * rs.aspectRatio;
        }
        if (snapOn) { width = snapTo(width, SNAP_PX); height = snapTo(height, SNAP_PX); }
        x = clamp(x, 0, CANVAS_W - MIN_W);
        y = clamp(y, 0, CANVAS_H - MIN_H);
        width  = clamp(width,  MIN_W, CANVAS_W - x);
        height = clamp(height, MIN_H, CANVAS_H - y);
        return { ...it, x, y, width, height };
      }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [items, zoom, snapOn]);

  // Aspect lock set
  const [aspectLockedIds, setAspectLockedIds] = useState<Set<string>>(new Set());
  const toggleAspectLock = (id: string) => {
    setAspectLockedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Item actions ───────────────────────────────────────────────────────────

  const addPhoto = useCallback((recordId: string) => {
    // If already on canvas → select it
    const existing = items.find(i => i.type === 'image' && (i as PrintLayoutImageItem).recordId === recordId);
    if (existing) { setSelectedId(existing.id); return; }
    const newItem: PrintLayoutImageItem = {
      id: uid(), type: 'image', recordId,
      x: SNAP_PX, y: SNAP_PX, width: 220, height: 165,
      objectFit: 'contain', showLabel: true,
    };
    setItems(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
  }, [items]);

  const addTextBlock = useCallback(() => {
    const newItem: PrintLayoutTextItem = {
      id: uid(), type: 'text', content: 'Double-click to edit',
      x: 50, y: 50, width: 240, height: 60,
      fontSize: 18, fontWeight: 'bold', color: '#1e293b',
      textAlign: 'left', fontFamily: 'Georgia, serif',
    };
    setItems(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
  }, []);

  const addPatientHeader = useCallback(() => {
    const header: PrintLayoutTextItem = {
      id: uid(), type: 'text',
      content: patientName || 'Patient Name',
      x: 10, y: 10, width: 400, height: 44,
      fontSize: 22, fontWeight: 'bold', color: '#0f172a',
      textAlign: 'left', fontFamily: 'Georgia, serif',
    };
    const date: PrintLayoutTextItem = {
      id: uid(), type: 'text',
      content: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      x: CANVAS_W - 220, y: 14, width: 210, height: 36,
      fontSize: 13, fontWeight: 'normal', color: '#64748b',
      textAlign: 'right', fontFamily: 'system-ui, sans-serif',
    };
    setItems(prev => [...prev, header, date]);
    setSelectedId(header.id);
  }, [patientName]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const src = items.find(i => i.id === selectedId);
    if (!src) return;
    const copy: PrintLayoutItem = { ...src, id: uid(), x: src.x + 16, y: src.y + 16 };
    setItems(prev => [...prev, copy]);
    setSelectedId(copy.id);
  }, [selectedId, items]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setItems(prev => prev.filter(i => i.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  // Visibility
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const toggleVisibility = (id: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Update single field on selected item ───────────────────────────────────

  const updateSelected = useCallback(<K extends keyof PrintLayoutItem>(key: K, value: PrintLayoutItem[K]) => {
    if (!selectedId) return;
    setItems(prev => prev.map(it => it.id === selectedId ? { ...it, [key]: value } as PrintLayoutItem : it));
  }, [selectedId]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave({ items, canvasWidth: CANVAS_W, canvasHeight: CANVAS_H, updatedAt: new Date().toISOString() });
    } finally {
      setIsSaving(false);
    }
  }, [items, onSave]);

  // ── Zoom helpers ───────────────────────────────────────────────────────────

  const zoomIn  = () => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1)));
  const zoomOut = () => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)));

  // ── Visible items (exclude hidden) for OrthoPrintCanvas ───────────────────

  const visibleItems = items.filter(i => !hiddenIds.has(i.id));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[400] flex flex-col bg-[#0f1117]"
        >
          {/* ── Top Bar ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-2.5 bg-[#161b27] border-b border-white/8 shrink-0 gap-3">

            {/* Left: close + title */}
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-all shrink-0">
                <X className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">Layout Editor</p>
                <p className="text-[10px] text-slate-500 truncate">{patientName} — A4 Landscape</p>
              </div>
            </div>

            {/* Centre: toolbar actions */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">

              {/* Snap */}
              <button
                onClick={() => setSnapOn(s => !s)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${
                  snapOn ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'
                }`}
              >
                ⊞ Snap {snapOn ? 'ON' : 'OFF'}
              </button>

              {/* Auto Layout */}
              <button
                onClick={() => { setItems(buildAutoLayout(photos)); setSelectedId(null); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-[10px] font-bold rounded-lg transition-all"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Auto Grid
              </button>

              {/* Add header */}
              <button
                onClick={addPatientHeader}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-[10px] font-bold rounded-lg transition-all"
              >
                <Type className="w-3.5 h-3.5" />
                Header
              </button>

              {/* Add text */}
              <button
                onClick={addTextBlock}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-[10px] font-bold rounded-lg transition-all"
              >
                <Type className="w-3.5 h-3.5" />
                Text Box
              </button>

              <div className="w-px h-5 bg-white/10" />

              {/* Zoom */}
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-1.5 py-1">
                <button onClick={zoomOut} className="text-slate-400 hover:text-white transition-all">
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-bold text-white tabular-nums w-8 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button onClick={zoomIn} className="text-slate-400 hover:text-white transition-all">
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-5 bg-white/10" />

              {/* Delete selected */}
              {selectedId && (
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 border border-red-500/25 text-red-400 text-[10px] font-bold rounded-lg hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
              {selectedId && (
                <button
                  onClick={duplicateSelected}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-bold rounded-lg hover:bg-white/10 transition-all"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
              )}
            </div>

            {/* Right: print / pdf / save */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onPrint}     className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/10 text-white text-[10px] font-bold rounded-lg hover:bg-white/15 transition-all"><Printer className="w-3.5 h-3.5"/>Print</button>
              <button onClick={onExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/10 text-white text-[10px] font-bold rounded-lg hover:bg-white/15 transition-all"><Download className="w-3.5 h-3.5"/>PDF</button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold rounded-lg disabled:opacity-50 transition-all shadow-lg shadow-violet-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving…' : 'Save Layout'}
              </button>
            </div>
          </div>

          {/* ── Workspace ─────────────────────────────────────────────────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── Left Panel: photo strip + layers ──────────────────────── */}
            <LeftPanel
              photos={photos}
              items={items}
              hiddenIds={hiddenIds}
              selectedId={selectedId}
              onAddPhoto={addPhoto}
              onSelectItem={setSelectedId}
              onToggleVisibility={toggleVisibility}
            />

            {/* ── Canvas area ───────────────────────────────────────────── */}
            <div
              className="flex-1 overflow-auto bg-[#0f1117] flex items-center justify-center p-10"
              onClick={() => { setSelectedId(null); setEditingTextId(null); }}
            >
              {/* A4 page shadow */}
              <div
                style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, flexShrink: 0 }}
                className="relative shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
              >
                {/* Canvas white surface */}
                <div
                  className="absolute inset-0 bg-white overflow-hidden"
                  style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}
                >
                  {/* Dot grid */}
                  {snapOn && (
                    <svg className="absolute inset-0 pointer-events-none opacity-[0.07]"
                      width={CANVAS_W * zoom} height={CANVAS_H * zoom}>
                      <defs>
                        <pattern id="dot" x={0} y={0}
                          width={SNAP_PX * zoom} height={SNAP_PX * zoom}
                          patternUnits="userSpaceOnUse">
                          <circle cx={SNAP_PX * zoom / 2} cy={SNAP_PX * zoom / 2} r={0.9} fill="#6366f1" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#dot)" />
                    </svg>
                  )}

                  {/* Items rendered by OrthoPrintCanvas (WYSIWYG) */}
                  <OrthoPrintCanvas
                    layout={{ items: visibleItems, canvasWidth: CANVAS_W, canvasHeight: CANVAS_H }}
                    photos={photos}
                    scale={zoom}
                    editing={false}
                  />

                  {/* Editor overlay: drag handles + resize handles */}
                  {items.map(item => {
                    if (hiddenIds.has(item.id)) return null;
                    const isSelected = item.id === selectedId;
                    const isEditingText = item.id === editingTextId;

                    return (
                      <div
                        key={item.id}
                        style={{
                          position: 'absolute',
                          left: item.x * zoom,
                          top: item.y * zoom,
                          width: item.width * zoom,
                          height: item.height * zoom,
                          zIndex: isSelected ? 20 : 10,
                          cursor: isEditingText ? 'text' : 'grab',
                        }}
                        onMouseDown={e => { e.stopPropagation(); startDrag(e, item.id); }}
                        onClick={e => { e.stopPropagation(); setSelectedId(item.id); }}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          if (item.type === 'text') setEditingTextId(item.id);
                        }}
                      >
                        {/* Selection ring */}
                        {isSelected && (
                          <div className="absolute inset-0 ring-2 ring-violet-500 ring-offset-0 pointer-events-none rounded-[1px]" />
                        )}

                        {/* Inline text editor overlay */}
                        {isEditingText && item.type === 'text' && (() => {
                          const t = item as PrintLayoutTextItem;
                          return (
                            <textarea
                              autoFocus
                              defaultValue={t.content}
                              onBlur={e => {
                                updateSelected('content' as any, e.target.value);
                                setEditingTextId(null);
                              }}
                              onClick={e => e.stopPropagation()}
                              onMouseDown={e => e.stopPropagation()}
                              style={{
                                position: 'absolute', inset: 0,
                                fontSize: (t.fontSize ?? 14) * zoom,
                                fontWeight: t.fontWeight ?? 'normal',
                                fontStyle: t.fontStyle ?? 'normal',
                                fontFamily: t.fontFamily ?? 'Georgia, serif',
                                color: t.color ?? '#1e293b',
                                textAlign: t.textAlign ?? 'left',
                                background: 'rgba(255,255,255,0.95)',
                                border: '2px dashed #7c3aed',
                                borderRadius: 2,
                                padding: '4px 6px',
                                resize: 'none',
                                outline: 'none',
                                lineHeight: 1.4,
                                overflow: 'hidden',
                              }}
                            />
                          );
                        })()}

                        {/* Resize handles — only when selected and not editing text */}
                        {isSelected && !isEditingText && HANDLES.map(h => (
                          <div
                            key={h.dir}
                            onMouseDown={e => { e.stopPropagation(); startResize(e, item.id, h.dir); }}
                            style={{
                              position: 'absolute',
                              width: 10, height: 10,
                              background: '#7c3aed',
                              border: '2px solid #fff',
                              borderRadius: 2,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                              zIndex: 30,
                              cursor: `${h.cursor}`,
                              ...h.style,
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Page border glow */}
                <div className="absolute inset-0 ring-1 ring-white/10 pointer-events-none" />
                <div className="absolute -top-5 left-0 text-[9px] font-bold text-slate-600 uppercase tracking-widest select-none">
                  A4 Landscape — {CANVAS_W}×{CANVAS_H}
                </div>
              </div>
            </div>

            {/* ── Right Panel: properties ──────────────────────────────── */}
            <RightPanel
              selectedItem={selectedItem}
              aspectLockedIds={aspectLockedIds}
              onToggleAspectLock={toggleAspectLock}
              onUpdate={updateSelected}
              onDelete={deleteSelected}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Left Panel ────────────────────────────────────────────────────────────────

interface LeftPanelProps {
  photos: PhotoRecord[];
  items: PrintLayoutItem[];
  hiddenIds: Set<string>;
  selectedId: string | null;
  onAddPhoto: (id: string) => void;
  onSelectItem: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  photos, items, hiddenIds, selectedId, onAddPhoto, onSelectItem, onToggleVisibility,
}) => {
  const [tab, setTab] = useState<'photos' | 'layers'>('photos');

  return (
    <div className="w-48 bg-[#161b27] border-r border-white/8 flex flex-col shrink-0">
      {/* Tab headers */}
      <div className="flex border-b border-white/8">
        {(['photos', 'layers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
              tab === t ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'photos' ? <ImageIcon className="w-3 h-3 inline mr-1" /> : null}
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-2">
        {tab === 'photos' ? (
          <>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-1 mb-2">
              Click to add to canvas
            </p>
            {photos.map(photo => {
              const onCanvas = items.some(i => i.type === 'image' && (i as PrintLayoutImageItem).recordId === photo.id);
              return (
                <button
                  key={photo.id}
                  onClick={() => onAddPhoto(photo.id)}
                  className={`w-full rounded-lg overflow-hidden text-left border-2 transition-all ${
                    onCanvas ? 'border-violet-500' : 'border-white/8 hover:border-white/20'
                  }`}
                >
                  <div className="aspect-[5/3] bg-slate-800 relative">
                    {photo.url ? (
                      <img
                        src={resolveFileUrl(photo.url)}
                        alt={photo.label}
                        className="w-full h-full object-cover"
                        style={{ transform: `rotate(${photo.rotation || 0}deg) scaleX(${photo.flipH ? -1 : 1}) scaleY(${photo.flipV ? -1 : 1})` }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-slate-600" />
                      </div>
                    )}
                    {onCanvas && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-violet-500 ring-1 ring-white" />
                    )}
                  </div>
                  <div className="px-1.5 py-1 bg-slate-800/80">
                    <p className="text-[9px] font-bold text-slate-300 uppercase truncate">{photo.label}</p>
                  </div>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-1 mb-2">
              {items.length} layer{items.length !== 1 ? 's' : ''}
            </p>
            {[...items].reverse().map(item => {
              const isHidden = hiddenIds.has(item.id);
              const isSelected = item.id === selectedId;
              const label = item.type === 'image'
                ? ((item as PrintLayoutImageItem).recordId)
                : ((item as PrintLayoutTextItem).content.slice(0, 20));
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectItem(item.id)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-[10px] font-bold transition-all ${
                    isSelected ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="text-slate-600 shrink-0">
                    {item.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <Type className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    onClick={e => { e.stopPropagation(); onToggleVisibility(item.id); }}
                    className="p-0.5 rounded hover:bg-white/10 transition-all"
                  >
                    {isHidden ? <EyeOff className="w-3 h-3 text-slate-600" /> : <Eye className="w-3 h-3 text-slate-500" />}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

// ── Right Panel ───────────────────────────────────────────────────────────────

interface RightPanelProps {
  selectedItem: PrintLayoutItem | null;
  aspectLockedIds: Set<string>;
  onToggleAspectLock: (id: string) => void;
  onUpdate: <K extends keyof PrintLayoutItem>(key: K, value: PrintLayoutItem[K]) => void;
  onDelete: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  selectedItem, aspectLockedIds, onToggleAspectLock, onUpdate, onDelete,
}) => {
  if (!selectedItem) {
    return (
      <div className="w-52 bg-[#161b27] border-l border-white/8 flex items-center justify-center shrink-0">
        <p className="text-[10px] text-slate-600 text-center px-4">Select an item to edit its properties</p>
      </div>
    );
  }

  const isImage  = selectedItem.type === 'image';
  const isText   = selectedItem.type === 'text';
  const img      = isImage ? (selectedItem as PrintLayoutImageItem) : null;
  const txt      = isText  ? (selectedItem as PrintLayoutTextItem)  : null;
  const locked   = aspectLockedIds.has(selectedItem.id);

  return (
    <div className="w-52 bg-[#161b27] border-l border-white/8 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-3 pt-3 pb-2 border-b border-white/8">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
          {isImage ? '📷 Image' : '✏️ Text'} Properties
        </p>
      </div>

      <div className="flex-1 p-3 space-y-4">

        {/* Position & Size */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Position & Size</p>
            <button
              onClick={() => onToggleAspectLock(selectedItem.id)}
              title={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              className={`p-1 rounded transition-all ${locked ? 'text-violet-400' : 'text-slate-600 hover:text-slate-300'}`}
            >
              {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'X', key: 'x', max: CANVAS_W },
              { label: 'Y', key: 'y', max: CANVAS_H },
              { label: 'W', key: 'width',  max: CANVAS_W },
              { label: 'H', key: 'height', max: CANVAS_H },
            ].map(({ label, key, max }) => (
              <div key={key}>
                <label className="text-[9px] text-slate-500 font-bold block mb-0.5">{label}</label>
                <input
                  type="number"
                  value={Math.round((selectedItem as any)[key])}
                  min={key === 'width' ? MIN_W : key === 'height' ? MIN_H : 0}
                  max={max}
                  onChange={e => onUpdate(key as any, Number(e.target.value))}
                  className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[11px] text-white font-bold text-right outline-none focus:border-violet-400/60 transition-all"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Image options */}
        {isImage && img && (
          <section>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Image</p>
            <div className="space-y-2">
              {/* objectFit */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Object Fit</label>
                <div className="flex gap-1">
                  {(['contain', 'cover', 'fill'] as const).map(fit => (
                    <button
                      key={fit}
                      onClick={() => onUpdate('objectFit' as any, fit)}
                      className={`flex-1 py-1 rounded text-[9px] font-bold uppercase border transition-all ${
                        img.objectFit === fit
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {fit}
                    </button>
                  ))}
                </div>
              </div>
              {/* showLabel */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={img.showLabel !== false}
                  onChange={e => onUpdate('showLabel' as any, e.target.checked)}
                  className="accent-violet-500"
                />
                <span className="text-[10px] text-slate-300 font-bold">Show label bar</span>
              </label>
            </div>
          </section>
        )}

        {/* Text options */}
        {isText && txt && (
          <section>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Text</p>
            <div className="space-y-2">
              {/* content */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Content</label>
                <textarea
                  value={txt.content}
                  onChange={e => onUpdate('content' as any, e.target.value)}
                  rows={3}
                  className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-md text-[11px] text-white outline-none focus:border-violet-400/60 resize-none transition-all"
                />
              </div>

              {/* Font size */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Font Size (px)</label>
                <input
                  type="number" min={8} max={120}
                  value={txt.fontSize ?? 14}
                  onChange={e => onUpdate('fontSize' as any, Number(e.target.value))}
                  className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[11px] text-white font-bold text-right outline-none focus:border-violet-400/60"
                />
              </div>

              {/* Bold / Italic */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Style</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => onUpdate('fontWeight' as any, txt.fontWeight === 'bold' ? 'normal' : 'bold')}
                    className={`px-3 py-1 rounded text-[11px] border font-bold transition-all ${
                      txt.fontWeight === 'bold' ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    <Bold className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onUpdate('fontStyle' as any, txt.fontStyle === 'italic' ? 'normal' : 'italic')}
                    className={`px-3 py-1 rounded text-[11px] border transition-all ${
                      txt.fontStyle === 'italic' ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    <Italic className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Align */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Alignment</label>
                <div className="flex gap-1">
                  {([ ['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight] ] as const).map(([align, Icon]) => (
                    <button
                      key={align}
                      onClick={() => onUpdate('textAlign' as any, align)}
                      className={`flex-1 py-1.5 flex items-center justify-center rounded border transition-all ${
                        txt.textAlign === align
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={txt.color ?? '#1e293b'}
                    onChange={e => onUpdate('color' as any, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-white/10 bg-transparent"
                  />
                  <input
                    type="text"
                    value={txt.color ?? '#1e293b'}
                    onChange={e => onUpdate('color' as any, e.target.value)}
                    className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[11px] text-white font-mono outline-none focus:border-violet-400/60"
                  />
                </div>
              </div>

              {/* Font family */}
              <div>
                <label className="text-[9px] text-slate-500 font-bold block mb-1">Font</label>
                <select
                  value={txt.fontFamily ?? 'Georgia, serif'}
                  onChange={e => onUpdate('fontFamily' as any, e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-white/10 rounded-md text-[11px] text-white outline-none focus:border-violet-400/60"
                >
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="system-ui, sans-serif">System UI</option>
                  <option value="'Courier New', monospace">Courier</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {/* Delete */}
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold hover:bg-red-500/20 transition-all mt-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Item
        </button>
      </div>
    </div>
  );
};

export default PrintLayoutCanvas;
