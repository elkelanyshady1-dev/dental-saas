import React from 'react';
import { PhotoRecord, PrintLayout, PrintLayoutItem, PrintLayoutImageItem, PrintLayoutTextItem } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════════════════
   OrthoPrintCanvas (v1.0)

   PURPOSE
   ───────
   Pure renderer for a PrintLayout. Used in three contexts:

     1. EDITOR mode  — inside PrintLayoutCanvas (drag-and-drop editor)
                       → receives onItemMouseDown / onResizeMouseDown
                       → shows selection rings + resize handles

     2. PREVIEW mode — read-only preview shown before print / PDF export
                       → no event handlers, just pixels

     3. PRINT mode   — inside an off-screen div captured by html2canvas
                       → scale=1, no editor chrome, full-res imagery

   DATA CONTRACT
   ─────────────
   layout.items  →  PrintLayoutItem[]   (discriminated union: 'image' | 'text')
   photos        →  PhotoRecord[]       (indexed by id for O(1) lookup)
   scale         →  number              (1 = actual canvas size, 0.7 = zoomed out)
   editing       →  boolean             (true = editor chrome on)

   COORDINATE SYSTEM
   ─────────────────
   All item x/y/width/height are in LOGICAL canvas pixels (e.g. A4 = 1122×794).
   The `scale` prop transforms them to display pixels.
   For print output: scale=1 means logical px === display px.

   ═══════════════════════════════════════════════════════════════════════════ */

// ── Resize handle geometry ───────────────────────────────────────────────────

type HandleDir = 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's';

const RESIZE_HANDLES: { direction: HandleDir; cursor: string }[] = [
  { direction: 'se', cursor: 'cursor-se-resize' },
  { direction: 'sw', cursor: 'cursor-sw-resize' },
  { direction: 'ne', cursor: 'cursor-ne-resize' },
  { direction: 'nw', cursor: 'cursor-nw-resize' },
  { direction: 'e',  cursor: 'cursor-e-resize' },
  { direction: 'w',  cursor: 'cursor-w-resize' },
  { direction: 'n',  cursor: 'cursor-n-resize' },
  { direction: 's',  cursor: 'cursor-s-resize' },
];

// Maps a handle direction to its absolute positioning style (in the item space)
function handleStyle(dir: HandleDir): React.CSSProperties {
  const H = 12; // handle size px
  const base: React.CSSProperties = {
    position: 'absolute',
    width: H,
    height: H,
    backgroundColor: '#7c3aed',
    border: '2px solid #fff',
    borderRadius: 3,
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    zIndex: 20,
    transform: 'translate(-50%, -50%)',
  };
  switch (dir) {
    case 'nw': return { ...base, top: 0, left: 0 };
    case 'n':  return { ...base, top: 0, left: '50%' };
    case 'ne': return { ...base, top: 0, left: '100%' };
    case 'w':  return { ...base, top: '50%', left: 0 };
    case 'e':  return { ...base, top: '50%', left: '100%' };
    case 'sw': return { ...base, top: '100%', left: 0 };
    case 's':  return { ...base, top: '100%', left: '50%' };
    case 'se': return { ...base, top: '100%', left: '100%' };
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface OrthoPrintCanvasProps {
  /** The layout to render */
  layout: PrintLayout;
  /** All PhotoRecord objects. Used to resolve recordId → url, transforms, label */
  photos: PhotoRecord[];
  /**
   * Display scale factor.
   * scale=1   → logical canvas px === display px  (for PDF capture / print)
   * scale=0.7 → zoomed-out view in the editor
   */
  scale?: number;

  // ── Editor-mode props (only used when editing=true) ──────────────────────

  /** When true: renders selection rings + resize handles */
  editing?: boolean;
  /** The currently selected item id (editor only) */
  selectedId?: string | null;
  /** Called on mousedown on an item body (for drag logic in parent) */
  onItemMouseDown?: (e: React.MouseEvent, itemId: string) => void;
  /** Called on mousedown on a resize handle */
  onResizeMouseDown?: (e: React.MouseEvent, itemId: string, direction: string) => void;
  /** Called on click of the canvas background (deselect) */
  onCanvasClick?: () => void;

  // ── Print/capture mode ───────────────────────────────────────────────────

  /** className applied to the root element */
  className?: string;
  /** Extra inline styles on root element (e.g. to position off-screen for capture) */
  style?: React.CSSProperties;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

const OrthoPrintCanvas = React.forwardRef<HTMLDivElement, OrthoPrintCanvasProps>(
  (
    {
      layout,
      photos,
      scale = 1,
      editing = false,
      selectedId = null,
      onItemMouseDown,
      onResizeMouseDown,
      onCanvasClick,
      className = '',
      style,
    },
    ref
  ) => {
    // Build O(1) index: recordId → PhotoRecord
    const photoIndex = React.useMemo(() => {
      const idx: Record<string, PhotoRecord> = {};
      photos.forEach(p => (idx[p.id] = p));
      return idx;
    }, [photos]);

    const { items, canvasWidth: W, canvasHeight: H } = layout;

    return (
      <div
        ref={ref}
        onClick={onCanvasClick}
        className={`relative bg-white ${className}`}
        style={{
          width: W * scale,
          height: H * scale,
          overflow: 'hidden',
          ...style,
        }}
      >
        {items.map(item => (
          <CanvasItem
            key={item.id}
            item={item}
            photoIndex={photoIndex}
            scale={scale}
            editing={editing}
            isSelected={editing && item.id === selectedId}
            onItemMouseDown={onItemMouseDown}
            onResizeMouseDown={onResizeMouseDown}
          />
        ))}
      </div>
    );
  }
);

OrthoPrintCanvas.displayName = 'OrthoPrintCanvas';

// ── Individual canvas item ───────────────────────────────────────────────────

interface CanvasItemProps {
  item: PrintLayoutItem;
  photoIndex: Record<string, PhotoRecord>;
  scale: number;
  editing: boolean;
  isSelected: boolean;
  onItemMouseDown?: (e: React.MouseEvent, itemId: string) => void;
  onResizeMouseDown?: (e: React.MouseEvent, itemId: string, direction: string) => void;
}

const CanvasItem: React.FC<CanvasItemProps> = ({
  item,
  photoIndex,
  scale,
  editing,
  isSelected,
  onItemMouseDown,
  onResizeMouseDown,
}) => {
  const { id, x, y, width, height } = item;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: x * scale,
    top: y * scale,
    width: width * scale,
    height: height * scale,
    zIndex: isSelected ? 10 : 0,
    userSelect: 'none',
  };

  const selectionRingStyle: React.CSSProperties =
    isSelected
      ? {
          outline: '2px solid #7c3aed',
          outlineOffset: 0,
          borderRadius: 2,
        }
      : {};

  if (item.type === 'image') {
    return <ImageItem
      item={item as PrintLayoutImageItem}
      photoIndex={photoIndex}
      containerStyle={containerStyle}
      selectionRingStyle={selectionRingStyle}
      scale={scale}
      editing={editing}
      isSelected={isSelected}
      onItemMouseDown={onItemMouseDown}
      onResizeMouseDown={onResizeMouseDown}
    />;
  }

  if (item.type === 'text') {
    return <TextItem
      item={item as PrintLayoutTextItem}
      containerStyle={containerStyle}
      selectionRingStyle={selectionRingStyle}
      editing={editing}
      isSelected={isSelected}
      onItemMouseDown={onItemMouseDown}
      onResizeMouseDown={onResizeMouseDown}
    />;
  }

  return null;
};

// ── Image item ───────────────────────────────────────────────────────────────

interface ImageItemProps {
  item: PrintLayoutImageItem;
  photoIndex: Record<string, PhotoRecord>;
  containerStyle: React.CSSProperties;
  selectionRingStyle: React.CSSProperties;
  scale: number;
  editing: boolean;
  isSelected: boolean;
  onItemMouseDown?: (e: React.MouseEvent, itemId: string) => void;
  onResizeMouseDown?: (e: React.MouseEvent, itemId: string, direction: string) => void;
}

const ImageItem: React.FC<ImageItemProps> = ({
  item,
  photoIndex,
  containerStyle,
  selectionRingStyle,
  scale,
  editing,
  isSelected,
  onItemMouseDown,
  onResizeMouseDown,
}) => {
  const photo = photoIndex[item.recordId];
  const fit = item.objectFit ?? 'contain';
  const showLabel = item.showLabel !== false;

  const imgTransform = photo
    ? `rotate(${photo.rotation || 0}deg) scaleX(${photo.flipH ? -1 : 1}) scaleY(${photo.flipV ? -1 : 1})`
    : undefined;

  return (
    <div
      style={{
        ...containerStyle,
        ...selectionRingStyle,
        overflow: 'hidden',
        cursor: editing ? (isSelected ? 'grab' : 'default') : 'default',
      }}
      onMouseDown={editing && onItemMouseDown ? (e) => onItemMouseDown(e, item.id) : undefined}
      className={editing && !isSelected ? 'hover-ring' : ''}
    >
      {/* Image */}
      {photo?.url ? (
        <img
          src={resolveFileUrl(photo.url)}
          alt={photo?.label ?? ''}
          draggable={false}
          style={{
            width: '100%',
            height: showLabel ? 'calc(100% - 22px)' : '100%',
            objectFit: fit,
            display: 'block',
            transform: imgTransform,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: Math.max(8, 10 * scale), fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
            {photo?.label ?? 'No image'}
          </span>
        </div>
      )}

      {/* Label bar */}
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 22,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
            paddingRight: 6,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontWeight: 700,
              fontSize: Math.max(7, 9 * scale),
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {photo?.label ?? ''}
          </span>
        </div>
      )}

      {/* Resize handles (editor only, selected only) */}
      {editing && isSelected && RESIZE_HANDLES.map(h => (
        <div
          key={h.direction}
          style={handleStyle(h.direction)}
          className={h.cursor}
          onMouseDown={
            onResizeMouseDown
              ? (e) => { e.preventDefault(); e.stopPropagation(); onResizeMouseDown(e, item.id, h.direction); }
              : undefined
          }
        />
      ))}
    </div>
  );
};

// ── Text item ────────────────────────────────────────────────────────────────

interface TextItemProps {
  item: PrintLayoutTextItem;
  containerStyle: React.CSSProperties;
  selectionRingStyle: React.CSSProperties;
  editing: boolean;
  isSelected: boolean;
  onItemMouseDown?: (e: React.MouseEvent, itemId: string) => void;
  onResizeMouseDown?: (e: React.MouseEvent, itemId: string, direction: string) => void;
}

const TextItem: React.FC<TextItemProps> = ({
  item,
  containerStyle,
  selectionRingStyle,
  editing,
  isSelected,
  onItemMouseDown,
  onResizeMouseDown,
}) => {
  return (
    <div
      style={{
        ...containerStyle,
        ...selectionRingStyle,
        display: 'flex',
        alignItems: 'flex-start',
        padding: '4px 6px',
        background: item.background ?? 'transparent',
        border: item.border ?? 'none',
        boxSizing: 'border-box',
        cursor: editing ? 'grab' : 'default',
        overflow: 'hidden',
      }}
      onMouseDown={editing && onItemMouseDown ? (e) => onItemMouseDown(e, item.id) : undefined}
    >
      <span
        style={{
          fontSize: item.fontSize ?? 14,
          fontWeight: item.fontWeight ?? 'normal',
          fontStyle: item.fontStyle ?? 'normal',
          fontFamily: item.fontFamily ?? 'Georgia, serif',
          color: item.color ?? '#1e293b',
          textAlign: item.textAlign ?? 'left',
          lineHeight: 1.4,
          width: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {item.content}
      </span>

      {/* Resize handles (editor only, selected only) */}
      {editing && isSelected && RESIZE_HANDLES.map(h => (
        <div
          key={h.direction}
          style={handleStyle(h.direction)}
          className={h.cursor}
          onMouseDown={
            onResizeMouseDown
              ? (e) => { e.preventDefault(); e.stopPropagation(); onResizeMouseDown(e, item.id, h.direction); }
              : undefined
          }
        />
      ))}
    </div>
  );
};

export default OrthoPrintCanvas;
