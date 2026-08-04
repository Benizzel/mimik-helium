import {
  ArrowUpRight,
  Check,
  Crop,
  EyeOff,
  MousePointer2,
  PenTool,
  Square,
  SquareDashed,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { updateScreenshotEdits } from '@/core/guides/service';
import type { Screenshot, ScreenshotBounds } from '@/core/guides/types';
import {
  annotationBounds,
  cropTo,
  type Handle,
  hitTest,
  moveAnnotation,
  resizeAnnotation,
  resolveTarget,
} from '@/core/screenshot/geometry';
import type { Annotation, ScreenshotEdits, TargetBorder } from '@/core/screenshot/types';
import { TARGET_COLORS } from '@/core/screenshot/types';

type EditorTool = 'select' | 'box' | 'arrow' | 'text' | 'freehand' | 'redact' | 'crop';

interface AnnotationEditorProps {
  screenshot: Screenshot;
  tool: 'annotate' | 'redact' | 'crop';
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
  | { mode: 'draw'; start: { x: number; y: number }; shape: Annotation };

const COLORS = ['#4F46E5', '#DC2626', '#059669', '#F59E0B', '#1E1B4B'];
const DEFAULT_TEXT_SIZE = 28;
const MIN_SHAPE_SIZE = 6;
const MIN_CROP_SIZE = 20;
const HANDLE_DISPLAY_SIZE = 10;
const HANDLE_HIT_PX = 10;
const DRAFT_ID = 'draft';
const TARGET_ID = 'click-target';

const TOOLS: { id: EditorTool; icon: ComponentType<{ size?: number }>; labelKey: string }[] = [
  { id: 'select', icon: MousePointer2, labelKey: 'annotationEditor.toolSelect' },
  { id: 'box', icon: Square, labelKey: 'annotationEditor.toolBox' },
  { id: 'arrow', icon: ArrowUpRight, labelKey: 'annotationEditor.toolArrow' },
  { id: 'text', icon: Type, labelKey: 'annotationEditor.toolText' },
  { id: 'freehand', icon: PenTool, labelKey: 'annotationEditor.toolFreehand' },
  { id: 'redact', icon: EyeOff, labelKey: 'annotationEditor.toolRedact' },
  { id: 'crop', icon: Crop, labelKey: 'annotationEditor.toolCrop' },
];

function initialToolFor(tool: 'annotate' | 'redact' | 'crop'): EditorTool {
  if (tool === 'redact') return 'redact';
  if (tool === 'crop') return 'crop';
  return 'box';
}

function cursorFor(tool: EditorTool): string {
  if (tool === 'select') return 'default';
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

function hitHandle(b: ScreenshotBounds, x: number, y: number, radius: number): Handle | null {
  for (const [handle, hx, hy] of handleCorners(b)) {
    if (Math.abs(x - hx) <= radius && Math.abs(y - hy) <= radius) return handle;
  }
  return null;
}

function drawShape(ctx: CanvasRenderingContext2D, a: Annotation, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (a.type) {
    case 'box':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(a.x, a.y, a.w, a.h);
      break;
    case 'target':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3.5;
      if (a.border === 'dashed') ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.roundRect(a.x, a.y, a.w, a.h, 12);
      ctx.stroke();
      break;
    case 'arrow': {
      const head = 14;
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - head * Math.cos(angle - Math.PI / 6), a.y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(a.x2 - head * Math.cos(angle + Math.PI / 6), a.y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'text':
      ctx.fillStyle = a.color;
      ctx.font = `600 ${a.size}px Poppins, sans-serif`;
      ctx.fillText(a.text, a.x, a.y);
      break;
    case 'freehand':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.points[0], a.points[1]);
      for (let i = 2; i < a.points.length; i += 2) ctx.lineTo(a.points[i], a.points[i + 1]);
      ctx.stroke();
      break;
    case 'redact':
      if (a.style === 'solid') {
        ctx.fillStyle = '#1E1B4B';
        ctx.fillRect(a.x, a.y, a.w, a.h);
      } else {
        ctx.filter = 'blur(12px)';
        ctx.drawImage(ctx.canvas, a.x, a.y, a.w, a.h, a.x, a.y, a.w, a.h);
      }
      break;
  }
  ctx.restore();
}

export default function AnnotationEditor({ screenshot, tool, onDone, onCancel }: AnnotationEditorProps) {
  const [activeTool, setActiveTool] = useState<EditorTool>(initialToolFor(tool));
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [cropDraft, setCropDraft] = useState<ScreenshotBounds | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textValue, setTextValue] = useState('');
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetPicker, setTargetPicker] = useState(false);

  const selected = annotations.find((a) => a.id === selectedId);
  const selectedTarget = selected?.type === 'target' ? selected : null;

  const updateTarget = (patch: { color?: string; border?: TargetBorder }) => {
    setAnnotations((prev) => prev.map((a) => (a.id === TARGET_ID && a.type === 'target' ? { ...a, ...patch } : a)));
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
        setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !bitmap) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const a of annotations) drawShape(ctx, a, 1);
    if (draft) drawShape(ctx, draft, 0.7);

    const scale = getScale();

    if (cropDraft) {
      ctx.save();
      ctx.strokeStyle = '#4F46E5';
      ctx.lineWidth = 2 * scale;
      ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.strokeRect(cropDraft.x, cropDraft.y, cropDraft.width, cropDraft.height);
      ctx.restore();
    }

    const sel = annotations.find((a) => a.id === selectedId);
    if (sel) {
      const b = annotationBounds(sel);
      ctx.save();
      ctx.strokeStyle = '#4F46E5';
      ctx.lineWidth = 2 * scale;
      ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.setLineDash([]);
      if (isResizable(sel)) {
        const handleSize = HANDLE_DISPLAY_SIZE * scale;
        ctx.fillStyle = '#4F46E5';
        for (const [, hx, hy] of handleCorners(b)) {
          ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        }
      }
      ctx.restore();
    }
  }, [annotations, draft, cropDraft, selectedId, bitmap, getScale]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImageSpace(e);

    if (activeTool === 'select') {
      const selected = annotations.find((a) => a.id === selectedId);
      if (selected && isResizable(selected)) {
        const b = annotationBounds(selected);
        const handle = hitHandle(b, p.x, p.y, HANDLE_HIT_PX * getScale());
        if (handle) {
          dragRef.current = { mode: 'resize', id: selected.id, handle, lastX: p.x, lastY: p.y };
          return;
        }
      }
      const hit = hitTest(annotations, p.x, p.y);
      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = { mode: 'move', id: hit.id, lastX: p.x, lastY: p.y };
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (activeTool === 'crop') {
      const rect: ScreenshotBounds = { x: p.x, y: p.y, width: 0, height: 0 };
      dragRef.current = { mode: 'crop', start: p, rect };
      setCropDraft(rect);
      return;
    }

    if (activeTool === 'text') {
      const rect = canvasRef.current?.getBoundingClientRect();
      setTextEditor({
        x: p.x,
        y: p.y + DEFAULT_TEXT_SIZE,
        left: rect ? e.clientX - rect.left : 0,
        top: rect ? e.clientY - rect.top : 0,
      });
      setTextValue('');
      return;
    }

    let shape: Annotation;
    if (activeTool === 'box') {
      shape = { id: DRAFT_ID, type: 'box', x: p.x, y: p.y, w: 0, h: 0, color };
    } else if (activeTool === 'arrow') {
      shape = { id: DRAFT_ID, type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color };
    } else if (activeTool === 'freehand') {
      shape = { id: DRAFT_ID, type: 'freehand', points: [p.x, p.y], color };
    } else {
      shape = { id: DRAFT_ID, type: 'redact', x: p.x, y: p.y, w: 0, h: 0, style: 'blur' };
    }
    dragRef.current = { mode: 'draw', start: p, shape };
    setDraft(shape);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toImageSpace(e);

    if (drag.mode === 'move') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      drag.lastX = p.x;
      drag.lastY = p.y;
      setAnnotations((prev) => prev.map((a) => (a.id === drag.id ? moveAnnotation(a, dx, dy) : a)));
      return;
    }

    if (drag.mode === 'resize') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      drag.lastX = p.x;
      drag.lastY = p.y;
      setAnnotations((prev) => prev.map((a) => (a.id === drag.id ? resizeAnnotation(a, drag.handle, dx, dy) : a)));
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
    if (shape.type === 'box' || shape.type === 'redact') {
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
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.mode === 'crop') {
      setCropDraft(null);
      const rect = drag.rect;
      if (rect.width < MIN_CROP_SIZE || rect.height < MIN_CROP_SIZE) return;
      setViewport(cropTo(rect, { width: screenshot.width, height: screenshot.height }));
      setActiveTool('select');
      return;
    }

    if (drag.mode === 'draw') {
      setDraft(null);
      const shape = drag.shape;
      if (shape.type === 'freehand') {
        if (shape.points.length < 4) return;
      } else if (shape.type === 'box' || shape.type === 'redact') {
        if (shape.w < MIN_SHAPE_SIZE || shape.h < MIN_SHAPE_SIZE) return;
      } else if (shape.type === 'arrow') {
        if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) < MIN_SHAPE_SIZE) return;
      }
      setAnnotations((prev) => [...prev, { ...shape, id: crypto.randomUUID() }]);
    }
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDraft(null);
    setCropDraft(null);
  };

  const handleColorSelect = (c: string) => {
    setColor(c);
    setAnnotations((prev) => prev.map((a) => (a.id === selectedId && a.type !== 'redact' ? { ...a, color: c } : a)));
  };

  const commitText = () => {
    if (textEditor && textValue.trim()) {
      setAnnotations((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'text',
          x: textEditor.x,
          y: textEditor.y,
          text: textValue.trim(),
          color,
          size: DEFAULT_TEXT_SIZE,
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
      <div className="px-4 py-2.5 bg-primary flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-primary-foreground">{i18n.t('annotationEditor.title')}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-primary-foreground rounded-lg border border-primary-foreground/10 bg-primary-foreground/[0.06] hover:bg-destructive/15 hover:text-destructive transition-colors"
          >
            <X size={12} />
            {i18n.t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-primary bg-primary-foreground rounded-lg hover:bg-primary-foreground/90 transition-colors disabled:opacity-50"
          >
            <Check size={12} />
            {i18n.t('annotationEditor.done')}
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-14 shrink-0 bg-card border-r border-border flex flex-col items-center gap-1.5 py-3 overflow-y-auto">
          {TOOLS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTool(id)}
              title={i18n.t(labelKey)}
              className={`flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
                activeTool === id
                  ? 'bg-accent text-primary-foreground'
                  : 'text-foreground hover:bg-secondary hover:text-accent'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
          <div className="w-8 h-px bg-border my-1.5" />
          <fieldset
            className="flex flex-col items-center gap-1.5 border-0 p-0 m-0"
            aria-label={i18n.t('annotationEditor.colorLabel')}
          >
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleColorSelect(c)}
                title={c}
                className={`w-6 h-6 rounded-full border-2 transition-colors ${color === c ? 'border-accent' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </fieldset>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              width={screenshot.width}
              height={screenshot.height}
              className="block max-w-full max-h-[calc(100vh-140px)] rounded-lg shadow-2xl touch-none"
              style={{ cursor: cursorFor(activeTool) }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
            {textEditor && (
              <input
                ref={(el) => el?.focus()}
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
                className="absolute z-10 rounded-md border border-accent bg-card px-2 py-1 text-sm text-foreground outline-none"
                style={{ left: textEditor.left, top: textEditor.top }}
              />
            )}
            {selectedTarget && (
              <div
                className="absolute z-20 -translate-x-1/2 flex flex-col items-center gap-1.5"
                style={{
                  left: `${((selectedTarget.x + selectedTarget.w / 2) / screenshot.width) * 100}%`,
                  top: `${((selectedTarget.y + selectedTarget.h) / screenshot.height) * 100}%`,
                }}
              >
                <div className="mt-2 flex items-center gap-1 rounded-xl bg-primary px-2 py-1.5 shadow-xl">
                  <button
                    type="button"
                    title={i18n.t('annotationEditor.targetColor')}
                    onClick={() => setTargetPicker((v) => !v)}
                    className="w-6 h-6 rounded-full border-2 border-primary-foreground/20"
                    style={{ backgroundColor: selectedTarget.color }}
                  />
                  <button
                    type="button"
                    title={i18n.t('annotationEditor.targetBorder')}
                    onClick={() => updateTarget({ border: selectedTarget.border === 'dashed' ? 'solid' : 'dashed' })}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-primary-foreground hover:bg-primary-foreground/15"
                  >
                    {selectedTarget.border === 'dashed' ? <SquareDashed size={14} /> : <Square size={14} />}
                  </button>
                  <button
                    type="button"
                    title={i18n.t('common.delete')}
                    onClick={() => {
                      setAnnotations((prev) => prev.filter((a) => a.id !== TARGET_ID));
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
                        onClick={() => updateTarget({ color: c })}
                        className={`w-5 h-5 rounded-full ${selectedTarget.color === c ? 'ring-2 ring-primary-foreground ring-offset-2 ring-offset-primary' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      value={selectedTarget.color}
                      onChange={(e) => updateTarget({ color: e.target.value })}
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
