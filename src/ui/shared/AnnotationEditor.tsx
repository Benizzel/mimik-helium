import {
  ArrowUpRight,
  ChevronDown,
  Circle as CircleIcon,
  CopyPlus,
  Crop,
  Eraser,
  EyeOff,
  Minus,
  MoveVertical,
  PenTool,
  Redo2,
  RotateCcw,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { updateScreenshotEdits } from '@/core/guides/service';
import type { Screenshot, ScreenshotBounds } from '@/core/guides/types';
import { drawAnnotation } from '@/core/screenshot/draw';
import {
  annotationBounds,
  cropTo,
  type Handle,
  hitTest,
  moveAnnotation,
  resizeAnnotation,
  resolveTarget,
} from '@/core/screenshot/geometry';
import type {
  Annotation,
  ArrowEnd,
  FontFamily,
  LineWidth,
  ScreenshotEdits,
  TargetBorder,
} from '@/core/screenshot/types';
import {
  ARROW_ENDS,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  FONT_FAMILIES,
  FONT_FAMILY_ORDER,
  LINE_WIDTH_ORDER,
  MAX_FONT_SIZE,
  MAX_LINE_HEIGHT,
  MIN_FONT_SIZE,
  MIN_LINE_HEIGHT,
  SHAPE_COLORS,
  TARGET_COLORS,
} from '@/core/screenshot/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';

type EditorMode = 'crop' | 'annotate' | 'redact';
type EditorTool = 'crop' | 'box' | 'ellipse' | 'arrow' | 'line' | 'freehand' | 'text' | 'redact' | 'eraser';

interface AnnotationEditorProps {
  screenshot: Screenshot;
  tool: 'annotate' | 'redact' | 'crop' | 'target';
  onDone: (edits: ScreenshotEdits) => void;
  onCancel: () => void;
}

interface TextEditorState {
  x: number;
  y: number;
  left: number;
  top: number;
}

type DragState =
  | { mode: 'move'; id: string; lastX: number; lastY: number }
  | { mode: 'resize'; id: string; handle: Handle; lastX: number; lastY: number }
  | { mode: 'crop'; start: { x: number; y: number }; rect: ScreenshotBounds }
  | { mode: 'cropResize'; handle: Handle; rect: ScreenshotBounds; lastX: number; lastY: number }
  | { mode: 'cropMove'; rect: ScreenshotBounds; lastX: number; lastY: number }
  | { mode: 'draw'; start: { x: number; y: number }; shape: Annotation };

const COLORS = ['#4F46E5', '#DC2626', '#059669', '#F59E0B', '#1E1B4B'];
const MIN_SHAPE_SIZE = 6;
const MIN_CROP_SIZE = 20;
const HANDLE_DISPLAY_SIZE = 10;
const HANDLE_HIT_PX = 10;
const HISTORY_LIMIT = 49;

function clampNumber(raw: string | number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

interface StepperProps {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  width: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onChange: (value: number) => void;
}

function Stepper({ title, value, min, max, step, decimals = 0, width, prefix, suffix, onChange }: StepperProps) {
  const round = (n: number) => Number(n.toFixed(decimals));
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-primary-foreground/10 h-6 px-1" title={title}>
      {prefix}
      <button
        type="button"
        aria-label="-"
        onClick={() => onChange(round(clampNumber(value - step, min, max)))}
        className="w-4 h-5 rounded text-primary-foreground/70 hover:bg-primary-foreground/15 text-[13px] leading-none"
      >
        &minus;
      </button>
      <input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(round(clampNumber(e.target.value, min, max)))}
        className={`${width} bg-transparent text-center text-[11px] tabular-nums text-primary-foreground outline-none`}
      />
      <button
        type="button"
        aria-label="+"
        onClick={() => onChange(round(clampNumber(value + step, min, max)))}
        className="w-4 h-5 rounded text-primary-foreground/70 hover:bg-primary-foreground/15 text-[13px] leading-none"
      >
        +
      </button>
      {suffix}
    </div>
  );
}
const SELECTION_GAP = 6;
const DRAFT_ID = 'draft';
const TARGET_ID = 'click-target';

const TOOLS: { id: EditorTool; icon: ComponentType<{ size?: number }>; labelKey: string }[] = [
  { id: 'crop', icon: Crop, labelKey: 'annotationEditor.toolCrop' },
  { id: 'box', icon: Square, labelKey: 'annotationEditor.toolBox' },
  { id: 'ellipse', icon: CircleIcon, labelKey: 'annotationEditor.toolEllipse' },
  { id: 'arrow', icon: ArrowUpRight, labelKey: 'annotationEditor.toolArrow' },
  { id: 'line', icon: Minus, labelKey: 'annotationEditor.toolLine' },
  { id: 'freehand', icon: PenTool, labelKey: 'annotationEditor.toolFreehand' },
  { id: 'text', icon: Type, labelKey: 'annotationEditor.toolText' },
  { id: 'redact', icon: EyeOff, labelKey: 'annotationEditor.toolRedact' },
  { id: 'eraser', icon: Eraser, labelKey: 'annotationEditor.toolEraser' },
];

function modeForTool(tool: EditorTool): EditorMode {
  if (tool === 'crop') return 'crop';
  if (tool === 'redact') return 'redact';
  return 'annotate';
}

function cursorFor(mode: EditorMode, tool: EditorTool, hovering: boolean, grabbing: boolean): string {
  if (grabbing) return 'grabbing';
  if (mode !== 'annotate') return 'crosshair';
  if (hovering) return 'grab';
  if (tool === 'eraser') return 'pointer';
  if (tool === 'text') return 'text';
  return 'crosshair';
}

function handleCorners(b: ScreenshotBounds): [Handle, number, number][] {
  return [
    ['nw', b.x, b.y],
    ['ne', b.x + b.width, b.y],
    ['sw', b.x, b.y + b.height],
    ['se', b.x + b.width, b.y + b.height],
  ];
}

function isResizable(a: Annotation): boolean {
  return a.type === 'box' || a.type === 'redact' || a.type === 'target';
}

function selectionBounds(a: Annotation, scale: number): ScreenshotBounds {
  const inset = SELECTION_GAP * scale;
  const b = annotationBounds(a);
  return { x: b.x - inset, y: b.y - inset, width: b.width + inset * 2, height: b.height + inset * 2 };
}

function hitHandle(b: ScreenshotBounds, x: number, y: number, radius: number): Handle | null {
  for (const [handle, hx, hy] of handleCorners(b)) {
    if (Math.abs(x - hx) <= radius && Math.abs(y - hy) <= radius) return handle;
  }
  return null;
}

export default function AnnotationEditor({ screenshot, tool, onDone, onCancel }: AnnotationEditorProps) {
  const [activeTool, setActiveTool] = useState<EditorTool>(
    tool === 'crop' ? 'crop' : tool === 'redact' ? 'redact' : 'box',
  );
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    const existing = screenshot.edits?.annotations ?? [];
    const t = resolveTarget(screenshot);
    if (!t) return existing;
    return [
      ...existing,
      { id: TARGET_ID, type: 'target', x: t.x, y: t.y, w: t.width, h: t.height, color: t.color, border: t.border },
    ];
  });
  const [viewport, setViewport] = useState<ScreenshotBounds | undefined>(screenshot.edits?.viewport);
  const [selectedId, setSelectedId] = useState<string | null>(tool === 'target' ? TARGET_ID : null);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [cropDraft, setCropDraft] = useState<ScreenshotBounds | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textValue, setTextValue] = useState('');
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetPicker, setTargetPicker] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [hue, setHue] = useState(0);
  const [grabbing, setGrabbing] = useState(false);

  const [fill] = useState('transparent');
  const [lineWidth] = useState<LineWidth>('ms');
  const [radius] = useState(0);
  const [arrowEnd] = useState<ArrowEnd>('arrow-solid');
  const [fontFamily, setFontFamily] = useState<FontFamily>('sans-serif');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);

  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const pushHistory = useCallback(() => {
    setPast((p) => [...p.slice(-HISTORY_LIMIT), annotationsRef.current]);
    setFuture([]);
  }, []);

  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [annotationsRef.current, ...f]);
    setAnnotations(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };

  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, annotationsRef.current]);
    setAnnotations(future[0]);
    setFuture((f) => f.slice(1));
  };

  const mode = modeForTool(activeTool);
  const selected = annotations.find((a) => a.id === selectedId);
  const selectedTarget = selected?.type === 'target' ? selected : null;

  const patchSelected = (patch: Record<string, unknown>) => {
    if (!selectedId || selectedId === TARGET_ID) return;
    pushHistory();
    setAnnotations((prev) => prev.map((a) => (a.id === selectedId ? ({ ...a, ...patch } as Annotation) : a)));
  };

  const updateTarget = (patch: { color?: string; border?: TargetBorder }) => {
    setAnnotations((prev) => prev.map((a) => (a.id === TARGET_ID && a.type === 'target' ? { ...a, ...patch } : a)));
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const getScale = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const rect = canvas.getBoundingClientRect();
    return rect.width ? canvas.width / rect.width : 1;
  }, []);

  const toImageSpace = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | null = null;
    setBitmap(null);
    createImageBitmap(screenshot.blob).then((bmp) => {
      if (cancelled) {
        bmp.close();
        return;
      }
      loaded = bmp;
      setBitmap(bmp);
    });
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [screenshot.blob]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        setSelectedId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        pushHistory();
        setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, pushHistory]);

  useEffect(() => {
    const sel = annotationsRef.current.find((a) => a.id === selectedId);
    if (!sel) {
      setAnchor(null);
      return;
    }
    const b = annotationBounds(sel);
    setAnchor({ x: b.x + b.width / 2, y: b.y + b.height });
  }, [selectedId]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const loop = () => {
      setHue((h) => (h + 3) % 360);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!textEditor) return;
    const id = requestAnimationFrame(() => textInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [textEditor]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !bitmap) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const a of annotations) {
      const pulsing = a.type === 'target' && a.id !== selectedId;
      drawAnnotation(ctx, pulsing ? { ...a, color: `hsl(${hue} 85% 58%)` } : a, 0, 0);
    }
    if (draft) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      drawAnnotation(ctx, draft, 0, 0);
      ctx.restore();
    }

    const scale = getScale();

    if (mode === 'crop') {
      const frame = cropDraft ?? viewport ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
      ctx.save();
      ctx.fillStyle = 'rgba(30, 27, 75, 0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(frame.x, frame.y, frame.width, frame.height);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
      const hs = HANDLE_DISPLAY_SIZE * scale;
      ctx.fillStyle = '#FFFFFF';
      for (const [, hx, hy] of handleCorners(frame)) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      ctx.restore();
    }

    const sel = annotations.find((a) => a.id === selectedId);
    if (sel) {
      const b = selectionBounds(sel, scale);
      ctx.save();
      ctx.strokeStyle = '#4F46E5';
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      if (isResizable(sel)) {
        const handleSize = HANDLE_DISPLAY_SIZE * scale;
        ctx.fillStyle = '#4F46E5';
        for (const [, hx, hy] of handleCorners(b)) {
          ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        }
      }
      ctx.restore();
    }
  }, [annotations, draft, cropDraft, selectedId, bitmap, getScale, mode, viewport, hue]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImageSpace(e);

    if (mode === 'crop') {
      const scale = getScale();
      const frame = viewport ?? { x: 0, y: 0, width: screenshot.width, height: screenshot.height };
      const handle = hitHandle(frame, p.x, p.y, HANDLE_HIT_PX * scale);
      if (handle) {
        dragRef.current = { mode: 'cropResize', handle, rect: frame, lastX: p.x, lastY: p.y };
        setCropDraft(frame);
        return;
      }
      if (p.x > frame.x && p.x < frame.x + frame.width && p.y > frame.y && p.y < frame.y + frame.height) {
        dragRef.current = { mode: 'cropMove', rect: frame, lastX: p.x, lastY: p.y };
        setCropDraft(frame);
        return;
      }
      const rect: ScreenshotBounds = { x: p.x, y: p.y, width: 0, height: 0 };
      dragRef.current = { mode: 'crop', start: p, rect };
      setCropDraft(rect);
      return;
    }

    if (mode === 'redact') {
      const shape: Annotation = { id: DRAFT_ID, type: 'redact', x: p.x, y: p.y, w: 0, h: 0, style: 'blur' };
      dragRef.current = { mode: 'draw', start: p, shape };
      setDraft(shape);
      return;
    }

    const current = annotations.find((a) => a.id === selectedId);
    if (current && isResizable(current)) {
      const scale = getScale();
      const handle = hitHandle(selectionBounds(current, scale), p.x, p.y, HANDLE_HIT_PX * scale);
      if (handle) {
        pushHistory();
        dragRef.current = { mode: 'resize', id: current.id, handle, lastX: p.x, lastY: p.y };
        return;
      }
    }

    const hit = hitTest(annotations, p.x, p.y);
    if (hit) {
      pushHistory();
      setSelectedId(hit.id);
      dragRef.current = { mode: 'move', id: hit.id, lastX: p.x, lastY: p.y };
      setGrabbing(true);
      return;
    }
    setSelectedId(null);

    if (activeTool === 'eraser') {
      const hit = hitTest(annotations, p.x, p.y);
      if (hit && hit.id !== TARGET_ID) {
        pushHistory();
        setAnnotations((prev) => prev.filter((a) => a.id !== hit.id));
      }
      return;
    }

    if (activeTool === 'text') {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      setTextEditor({
        x: p.x,
        y: p.y + fontSize,
        left: rect ? e.clientX - rect.left : 0,
        top: rect ? e.clientY - rect.top : 0,
      });
      setTextValue('');
      return;
    }

    let shape: Annotation;
    if (activeTool === 'box') {
      shape = { id: DRAFT_ID, type: 'box', x: p.x, y: p.y, w: 0, h: 0, color, fill, lineWidth, radius };
    } else if (activeTool === 'ellipse') {
      shape = { id: DRAFT_ID, type: 'ellipse', x: p.x, y: p.y, w: 0, h: 0, color, fill, lineWidth };
    } else if (activeTool === 'arrow' || activeTool === 'line') {
      shape = {
        id: DRAFT_ID,
        type: 'arrow',
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        color,
        lineWidth,
        end: activeTool === 'line' ? 'none' : arrowEnd,
      };
    } else {
      shape = { id: DRAFT_ID, type: 'freehand', points: [p.x, p.y], color, lineWidth };
    }
    dragRef.current = { mode: 'draw', start: p, shape };
    setDraft(shape);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      if (mode === 'annotate') {
        const p = toImageSpace(e);
        setHovering(Boolean(hitTest(annotations, p.x, p.y)));
      }
      return;
    }
    const p = toImageSpace(e);

    if (drag.mode === 'move' || drag.mode === 'resize') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      drag.lastX = p.x;
      drag.lastY = p.y;
      const next = annotationsRef.current.map((a) => {
        if (a.id !== drag.id) return a;
        return drag.mode === 'move' ? moveAnnotation(a, dx, dy) : resizeAnnotation(a, drag.handle, dx, dy);
      });
      setAnnotations(next);
      const moved = next.find((a) => a.id === drag.id);
      if (moved) {
        const b = annotationBounds(moved);
        setAnchor({ x: b.x + b.width / 2, y: b.y + b.height });
      }
      return;
    }

    if (drag.mode === 'cropResize') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      drag.lastX = p.x;
      drag.lastY = p.y;
      const left = drag.handle === 'nw' || drag.handle === 'sw';
      const top = drag.handle === 'nw' || drag.handle === 'ne';
      const r = drag.rect;
      const next: ScreenshotBounds = {
        x: left ? r.x + dx : r.x,
        y: top ? r.y + dy : r.y,
        width: Math.max(MIN_CROP_SIZE, left ? r.width - dx : r.width + dx),
        height: Math.max(MIN_CROP_SIZE, top ? r.height - dy : r.height + dy),
      };
      drag.rect = cropTo(next, { width: screenshot.width, height: screenshot.height });
      setCropDraft(drag.rect);
      return;
    }

    if (drag.mode === 'cropMove') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      drag.lastX = p.x;
      drag.lastY = p.y;
      drag.rect = cropTo(
        { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy },
        { width: screenshot.width, height: screenshot.height },
      );
      setCropDraft(drag.rect);
      return;
    }

    if (drag.mode === 'crop') {
      const rect: ScreenshotBounds = {
        x: Math.min(drag.start.x, p.x),
        y: Math.min(drag.start.y, p.y),
        width: Math.abs(p.x - drag.start.x),
        height: Math.abs(p.y - drag.start.y),
      };
      drag.rect = rect;
      setCropDraft(rect);
      return;
    }

    const shape = drag.shape;
    let next: Annotation = shape;
    if (shape.type === 'box' || shape.type === 'ellipse' || shape.type === 'redact') {
      next = {
        ...shape,
        x: Math.min(drag.start.x, p.x),
        y: Math.min(drag.start.y, p.y),
        w: Math.abs(p.x - drag.start.x),
        h: Math.abs(p.y - drag.start.y),
      };
    } else if (shape.type === 'arrow') {
      next = { ...shape, x2: p.x, y2: p.y };
    } else if (shape.type === 'freehand') {
      next = { ...shape, points: [...shape.points, p.x, p.y] };
    }
    drag.shape = next;
    setDraft(next);
  };

  const handlePointerUp = () => {
    setGrabbing(false);
    const settled = annotations.find((a) => a.id === selectedId);
    if (settled) {
      const b = annotationBounds(settled);
      setAnchor({ x: b.x + b.width / 2, y: b.y + b.height });
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.mode === 'crop' || drag.mode === 'cropResize' || drag.mode === 'cropMove') {
      setCropDraft(null);
      const rect = drag.rect;
      if (rect.width < MIN_CROP_SIZE || rect.height < MIN_CROP_SIZE) return;
      setViewport(cropTo(rect, { width: screenshot.width, height: screenshot.height }));
      return;
    }

    if (drag.mode === 'draw') {
      setDraft(null);
      const shape = drag.shape;
      if (shape.type === 'freehand') {
        if (shape.points.length < 4) return;
      } else if (shape.type === 'box' || shape.type === 'ellipse' || shape.type === 'redact') {
        if (shape.w < MIN_SHAPE_SIZE || shape.h < MIN_SHAPE_SIZE) return;
      } else if (shape.type === 'arrow') {
        if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) < MIN_SHAPE_SIZE) return;
      }
      pushHistory();
      setAnnotations((prev) => [...prev, { ...shape, id: crypto.randomUUID() }]);
    }
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDraft(null);
    setCropDraft(null);
  };

  const setProp = (key: string, value: unknown) => {
    patchSelected({ [key]: value });
  };

  const setTextProp = (patch: {
    fontFamily?: FontFamily;
    bold?: boolean;
    italic?: boolean;
    size?: number;
    lineHeight?: number;
  }) => {
    if (patch.fontFamily) setFontFamily(patch.fontFamily);
    if (patch.bold !== undefined) setBold(patch.bold);
    if (patch.italic !== undefined) setItalic(patch.italic);
    if (patch.size !== undefined) setFontSize(patch.size);
    if (patch.lineHeight !== undefined) setLineHeight(patch.lineHeight);
    if (!selected || selected.type !== 'text') return;
    const next = {
      fontFamily: patch.fontFamily ?? selected.fontFamily ?? 'sans-serif',
      bold: patch.bold ?? selected.bold ?? false,
      italic: patch.italic ?? selected.italic ?? false,
      size: patch.size ?? selected.size,
      lineHeight: patch.lineHeight ?? selected.lineHeight ?? DEFAULT_LINE_HEIGHT,
    };
    patchSelected({ ...next, ...measureText(selected.text, next.size, next.fontFamily, next.bold, next.italic) });
  };

  const handleColorSelect = (c: string) => {
    setColor(c);
    setAnnotations((prev) => prev.map((a) => (a.id === selectedId && a.type !== 'redact' ? { ...a, color: c } : a)));
  };

  const measureText = (value: string, px: number, family: FontFamily, isBold: boolean, isItalic: boolean) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return { w: value.length * px * 0.6, h: px * 1.4 };
    ctx.save();
    ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? 700 : 500} ${px}px ${FONT_FAMILIES[family]}`;
    const w = ctx.measureText(value).width;
    ctx.restore();
    return { w, h: px * 1.4 };
  };

  const commitText = () => {
    if (textEditor && textValue.trim()) {
      const id = crypto.randomUUID();
      pushHistory();
      setSelectedId(id);
      setAnnotations((prev) => [
        ...prev,
        {
          id,
          type: 'text',
          x: textEditor.x,
          y: textEditor.y,
          text: textValue.trim(),
          color,
          size: fontSize,
          ...measureText(textValue.trim(), fontSize, fontFamily, bold, italic),
          fontFamily,
          bold,
          italic,
          lineHeight,
        },
      ]);
    }
    setTextEditor(null);
    setTextValue('');
  };

  const handleDone = async () => {
    setSaving(true);
    const targetAnnotation = annotations.find((a) => a.id === TARGET_ID);
    const nextEdits: ScreenshotEdits = {
      ...screenshot.edits,
      annotations: annotations.filter((a) => a.id !== TARGET_ID),
      target:
        targetAnnotation && targetAnnotation.type === 'target'
          ? {
              x: targetAnnotation.x,
              y: targetAnnotation.y,
              width: targetAnnotation.w,
              height: targetAnnotation.h,
              border: targetAnnotation.border,
              color: targetAnnotation.color,
            }
          : null,
    };
    if (viewport) nextEdits.viewport = viewport;
    await updateScreenshotEdits(screenshot.id, nextEdits);
    onDone(nextEdits);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <div className="shrink-0 bg-primary px-3 h-12 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            title={i18n.t('annotationEditor.undo')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-primary-foreground hover:bg-primary-foreground/15 disabled:opacity-25"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            title={i18n.t('annotationEditor.redo')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-primary-foreground hover:bg-primary-foreground/15 disabled:opacity-25"
          >
            <Redo2 size={15} />
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          {TOOLS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTool(id);
                setSelectedId(null);
              }}
              title={i18n.t(labelKey)}
              aria-pressed={activeTool === id}
              className={`flex items-center justify-center w-9 h-8 rounded-lg transition-colors ${
                activeTool === id
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'text-primary-foreground/60 hover:bg-primary-foreground/10 hover:text-primary-foreground'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
          <span className="w-px h-5 bg-primary-foreground/20 mx-1.5" />
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorSelect(e.target.value)}
            title={i18n.t('annotationEditor.lineColor')}
            className="w-7 h-7 rounded-full border-2 border-primary-foreground/25 bg-transparent p-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'crop' && viewport && (
            <button
              type="button"
              onClick={() => {
                setViewport(undefined);
                setCropDraft(null);
              }}
              className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[12px] font-semibold text-primary-foreground/80 hover:bg-primary-foreground/15"
            >
              <RotateCcw size={13} />
              {i18n.t('annotationEditor.resetCrop')}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="px-3 h-8 text-[12px] font-semibold text-primary-foreground/80 rounded-lg hover:bg-primary-foreground/15"
          >
            {i18n.t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={saving}
            className="px-4 h-8 text-[12px] font-bold text-primary bg-primary-foreground rounded-lg hover:bg-primary-foreground/90 disabled:opacity-50"
          >
            {i18n.t('annotationEditor.done')}
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              width={screenshot.width}
              height={screenshot.height}
              className="block max-w-full max-h-[calc(100vh-190px)] rounded-lg shadow-2xl touch-none"
              style={{ cursor: cursorFor(mode, activeTool, hovering, grabbing) }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
            {textEditor && (
              <input
                ref={textInputRef}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitText();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setTextEditor(null);
                    setTextValue('');
                  }
                }}
                placeholder={i18n.t('annotationEditor.textPlaceholder')}
                className="absolute z-10 rounded-[2px] border-2 border-accent bg-transparent px-1 outline-none leading-tight"
                style={{
                  left: textEditor.left,
                  top: textEditor.top - fontSize / getScale(),
                  color,
                  fontFamily: FONT_FAMILIES[fontFamily],
                  fontSize: `${fontSize / getScale()}px`,
                  fontWeight: bold ? 700 : 500,
                  fontStyle: italic ? 'italic' : 'normal',
                  lineHeight,
                  width: `${Math.max(6, textValue.length + 4)}ch`,
                }}
              />
            )}
            {selected && anchor && (
              <div
                className="absolute z-20 -translate-x-1/2 flex flex-col items-center gap-1.5"
                style={{
                  left: `${((anchor?.x ?? 0) / screenshot.width) * 100}%`,
                  top: `${((anchor?.y ?? 0) / screenshot.height) * 100}%`,
                }}
              >
                <div className="mt-2 flex items-center gap-1 rounded-xl bg-primary px-2 py-1.5 shadow-xl">
                  <button
                    type="button"
                    title={i18n.t('annotationEditor.targetColor')}
                    onClick={() => setTargetPicker((v) => !v)}
                    className="w-6 h-6 rounded-full border-2 border-primary-foreground/20"
                    style={{ backgroundColor: selected.type === 'redact' ? '#1E1B4B' : selected.color }}
                  />
                  {selectedTarget ? (
                    <button
                      type="button"
                      title={i18n.t('annotationEditor.targetBorder')}
                      onClick={() => updateTarget({ border: selectedTarget.border === 'dashed' ? 'solid' : 'dashed' })}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-primary-foreground hover:bg-primary-foreground/15"
                    >
                      {selectedTarget.border === 'dashed' ? <SquareDashed size={14} /> : <Square size={14} />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      title={i18n.t('annotationEditor.duplicate')}
                      onClick={() => {
                        pushHistory();
                        const copy = { ...moveAnnotation(selected, 24, 24), id: crypto.randomUUID() };
                        setAnnotations((prev) => [...prev, copy]);
                        setSelectedId(copy.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-primary-foreground hover:bg-primary-foreground/15"
                    >
                      <CopyPlus size={14} />
                    </button>
                  )}
                  {(selected.type === 'box' || selected.type === 'ellipse') && (
                    <select
                      value={selected.fill ?? 'transparent'}
                      onChange={(e) => setProp('fill', e.target.value)}
                      title={i18n.t('annotationEditor.fillColor')}
                      className="h-6 rounded-md bg-primary-foreground/10 px-1 text-[10px] text-primary-foreground outline-none"
                    >
                      {SHAPE_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {c === 'transparent' ? i18n.t('annotationEditor.noFill') : c}
                        </option>
                      ))}
                    </select>
                  )}
                  {selected.type !== 'text' && selected.type !== 'redact' && (
                    <select
                      value={selected.type === 'target' ? 'ms' : (selected.lineWidth ?? 'ms')}
                      onChange={(e) => setProp('lineWidth', e.target.value)}
                      title={i18n.t('annotationEditor.lineWidth')}
                      className="h-6 rounded-md bg-primary-foreground/10 px-1 text-[10px] text-primary-foreground outline-none"
                    >
                      {LINE_WIDTH_ORDER.map((w) => (
                        <option key={w} value={w}>
                          {i18n.t(`annotationEditor.width_${w}`)}
                        </option>
                      ))}
                    </select>
                  )}
                  {selected.type === 'box' && (
                    <Stepper
                      title={i18n.t('annotationEditor.cornerRadius')}
                      value={Math.round(selected.radius ?? 0)}
                      min={0}
                      max={60}
                      step={4}
                      width="w-6"
                      onChange={(v) => setProp('radius', v)}
                    />
                  )}
                  {selected.type === 'arrow' && (
                    <select
                      value={selected.end ?? 'arrow-solid'}
                      onChange={(e) => setProp('end', e.target.value)}
                      title={i18n.t('annotationEditor.arrowEnd')}
                      className="h-6 rounded-md bg-primary-foreground/10 px-1 text-[10px] text-primary-foreground outline-none"
                    >
                      {ARROW_ENDS.map((end) => (
                        <option key={end} value={end}>
                          {i18n.t(`annotationEditor.end_${end.replace('-', '_')}`)}
                        </option>
                      ))}
                    </select>
                  )}
                  {selected.type === 'text' && (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title={i18n.t('annotationEditor.font')}
                            className="flex items-center gap-1.5 h-6 rounded-md bg-primary-foreground/10 px-2 text-[11px] text-primary-foreground hover:bg-primary-foreground/20"
                            style={{ fontFamily: FONT_FAMILIES[selected.fontFamily ?? 'sans-serif'] }}
                          >
                            <span className="text-[13px] leading-none">Ag</span>
                            <ChevronDown size={10} className="opacity-60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[150px]">
                          {FONT_FAMILY_ORDER.map((f) => (
                            <DropdownMenuItem
                              key={f}
                              onSelect={() => setTextProp({ fontFamily: f })}
                              style={{ fontFamily: FONT_FAMILIES[f] }}
                            >
                              <span className="text-[15px]">Ag</span>
                              <span className="text-[12px] text-muted-foreground">{f}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className="flex items-center gap-0.5 rounded-md bg-primary-foreground/10 p-0.5">
                        <button
                          type="button"
                          title={i18n.t('annotationEditor.bold')}
                          onClick={() => setTextProp({ bold: !selected.bold })}
                          className={`w-5 h-5 rounded text-[12px] font-extrabold ${selected.bold ? 'bg-accent text-primary-foreground' : 'text-primary-foreground hover:bg-primary-foreground/15'}`}
                        >
                          B
                        </button>
                        <button
                          type="button"
                          title={i18n.t('annotationEditor.italic')}
                          onClick={() => setTextProp({ italic: !selected.italic })}
                          className={`w-5 h-5 rounded text-[12px] italic font-serif ${selected.italic ? 'bg-accent text-primary-foreground' : 'text-primary-foreground hover:bg-primary-foreground/15'}`}
                        >
                          I
                        </button>
                      </div>
                      <Stepper
                        title={i18n.t('annotationEditor.fontSize')}
                        prefix={<span className="text-[9px] text-primary-foreground/60">A</span>}
                        suffix={<span className="text-[13px] text-primary-foreground/60">A</span>}
                        value={Math.round(selected.size)}
                        min={MIN_FONT_SIZE}
                        max={MAX_FONT_SIZE}
                        step={2}
                        width="w-7"
                        onChange={(v) => setTextProp({ size: v })}
                      />
                      <Stepper
                        title={i18n.t('annotationEditor.lineHeight')}
                        prefix={<MoveVertical size={11} className="text-primary-foreground/60" />}
                        value={selected.lineHeight ?? DEFAULT_LINE_HEIGHT}
                        min={MIN_LINE_HEIGHT}
                        max={MAX_LINE_HEIGHT}
                        step={0.1}
                        decimals={1}
                        width="w-7"
                        onChange={(v) => setTextProp({ lineHeight: v })}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    title={i18n.t('common.delete')}
                    onClick={() => {
                      pushHistory();
                      setAnnotations((prev) => prev.filter((a) => a.id !== selected.id));
                      setSelectedId(null);
                      setTargetPicker(false);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-primary-foreground hover:bg-destructive/25"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {targetPicker && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-primary px-2.5 py-2 shadow-xl">
                    {TARGET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => (selectedTarget ? updateTarget({ color: c }) : handleColorSelect(c))}
                        className={`w-5 h-5 rounded-full ${(selectedTarget ? selectedTarget.color : selected.type !== 'redact' && selected.color) === c ? 'ring-2 ring-primary-foreground ring-offset-2 ring-offset-primary' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      value={selectedTarget ? selectedTarget.color : selected.type === 'redact' ? '' : selected.color}
                      onChange={(e) =>
                        selectedTarget ? updateTarget({ color: e.target.value }) : handleColorSelect(e.target.value)
                      }
                      className="w-20 rounded-md bg-primary-foreground/10 px-1.5 py-0.5 text-[11px] text-primary-foreground outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
