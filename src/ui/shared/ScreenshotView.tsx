import { Crop, Download, EyeOff, Highlighter, ImageUp, Pencil, Target, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { deleteScreenshot, updateScreenshotBlob, updateScreenshotEdits } from '@/core/guides/service';
import type { Screenshot, ScreenshotBounds } from '@/core/guides/types';
import { panBy, resolveTarget, resolveViewport, zoomBy } from '@/core/screenshot/geometry';
import { renderScreenshot } from '@/core/screenshot/render';
import type { ClickTarget, ScreenshotEdits } from '@/core/screenshot/types';
import { DEFAULT_TARGET_COLOR } from '@/core/screenshot/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/ui/popover';

interface ScreenshotViewProps {
  screenshot: Screenshot;
  className?: string;
  alt?: string;
  animate?: boolean;
  crop?: boolean;
  readOnly?: boolean;
  onOpenEditor?: (tool: 'annotate' | 'redact' | 'crop' | 'target') => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startViewport: ScreenshotBounds;
  moved: boolean;
}

const SAVE_DEBOUNCE_MS = 400;
const SAVED_MESSAGE_MS = 1500;
const ZOOM_IN_FACTOR = 1.25;
const ZOOM_OUT_FACTOR = 0.8;
const VIEWPORT_EPSILON = 0.5;
const TARGET_WIDTH_RATIO = 0.3;
const TARGET_HEIGHT_RATIO = 0.15;
const FRAME_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FRAME_TRANSITION = `width 0.4s ${FRAME_EASING}, height 0.4s ${FRAME_EASING}, left 0.4s ${FRAME_EASING}, top 0.4s ${FRAME_EASING}`;

function withFullViewport(screenshot: Screenshot): Screenshot {
  return {
    ...screenshot,
    edits: { ...screenshot.edits, viewport: { x: 0, y: 0, width: screenshot.width, height: screenshot.height } },
  };
}

function defaultTargetRect(screenshot: Screenshot): ClickTarget {
  const dpr = screenshot.pixelRatio || 1;
  const width = screenshot.width / dpr;
  const height = screenshot.height / dpr;
  const w = width * TARGET_WIDTH_RATIO;
  const h = height * TARGET_HEIGHT_RATIO;
  return {
    x: (width - w) / 2,
    y: (height - h) / 2,
    width: w,
    height: h,
    border: 'dashed',
    color: DEFAULT_TARGET_COLOR,
  };
}

export default function ScreenshotView({
  screenshot,
  className = '',
  alt = '',
  animate = false,
  crop = false,
  readOnly = false,
  onOpenEditor,
}: ScreenshotViewProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [showViewport, setShowViewport] = useState(false);
  const [editsOverride, setEditsOverride] = useState<ScreenshotEdits | undefined>(undefined);
  const [screenshotOverride, setScreenshotOverride] = useState<Screenshot | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [altDraft, setAltDraft] = useState('');
  const processedKeyRef = useRef<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const idRef = useRef(screenshot.id);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseScreenshot = screenshotOverride ?? screenshot;
  const effectiveEdits = editsOverride ?? screenshot.edits;
  const effectiveScreenshot: Screenshot = { ...baseScreenshot, edits: effectiveEdits };

  useEffect(() => {
    if (idRef.current !== screenshot.id) {
      idRef.current = screenshot.id;
      setEditsOverride(undefined);
      setScreenshotOverride(null);
      setDeleted(false);
    }
  }, [screenshot.id]);

  useEffect(() => {
    setAltDraft(effectiveEdits?.alt ?? '');
  }, [effectiveEdits?.alt]);

  const annotationsForRender = effectiveEdits?.annotations;
  const targetForRender = effectiveEdits?.target;

  useEffect(() => {
    if (!baseScreenshot.blob) return;
    const cacheKey = `${baseScreenshot.id}:${baseScreenshot.blob.size}:${JSON.stringify(annotationsForRender ?? null)}:${JSON.stringify(targetForRender ?? null)}`;
    if (processedKeyRef.current === cacheKey) return;

    let cancelled = false;
    const current: Screenshot = {
      ...baseScreenshot,
      edits: { annotations: annotationsForRender, target: targetForRender },
    };

    (async () => {
      const blob = await renderScreenshot(withFullViewport(current));
      const newUrl = URL.createObjectURL(blob);

      if (cancelled) {
        URL.revokeObjectURL(newUrl);
        return;
      }

      processedKeyRef.current = cacheKey;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = newUrl;
      setShowViewport(false);
      setFullUrl(newUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [baseScreenshot, annotationsForRender, targetForRender]);

  useEffect(() => {
    if (!fullUrl || showViewport) return;
    if (!animate) {
      setShowViewport(true);
      return;
    }
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        setShowViewport(true);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [fullUrl, showViewport, animate]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const scheduleSave = (edits: ScreenshotEdits) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateScreenshotEdits(screenshot.id, edits).then(() => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), SAVED_MESSAGE_MS);
      });
    }, SAVE_DEBOUNCE_MS);
  };

  const handleZoom = (factor: number) => {
    const viewport = resolveViewport(effectiveScreenshot);
    const nextViewport = zoomBy(viewport, factor, baseScreenshot);
    const nextEdits: ScreenshotEdits = { ...effectiveEdits, viewport: nextViewport };
    setEditsOverride(nextEdits);
    scheduleSave(nextEdits);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !crop) return;
    const viewport = resolveViewport(effectiveScreenshot);
    const zoomed =
      viewport.width < baseScreenshot.width - VIEWPORT_EPSILON ||
      viewport.height < baseScreenshot.height - VIEWPORT_EPSILON;
    if (!zoomed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startViewport: viewport,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const el = e.currentTarget;
    if (el.clientWidth === 0) return;
    drag.moved = true;
    const scale = drag.startViewport.width / el.clientWidth;
    const dx = (e.clientX - drag.startX) * scale;
    const dy = (e.clientY - drag.startY) * scale;
    const nextViewport = panBy(drag.startViewport, -dx, -dy, baseScreenshot);
    setEditsOverride({ ...effectiveEdits, viewport: nextViewport });
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (drag.moved) scheduleSave(effectiveEdits ?? {});
  };

  const handleClickTarget = () => {
    const nextEdits: ScreenshotEdits = {
      ...effectiveEdits,
      target: resolveTarget(effectiveScreenshot) ?? defaultTargetRect(effectiveScreenshot),
    };
    setEditsOverride(nextEdits);
    scheduleSave(nextEdits);
    onOpenEditor?.('target');
  };

  const handleAltChange = (value: string) => {
    setAltDraft(value);
    const nextEdits: ScreenshotEdits = { ...effectiveEdits, alt: value };
    setEditsOverride(nextEdits);
    scheduleSave(nextEdits);
  };

  const handleReplaceClick = () => {
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();

    const nextEdits: ScreenshotEdits = { ...effectiveEdits };
    delete nextEdits.viewport;
    const nextScreenshot: Screenshot = { ...baseScreenshot, blob: file, mimeType: file.type, width, height };

    setScreenshotOverride(nextScreenshot);
    setEditsOverride(nextEdits);

    await updateScreenshotBlob(screenshot.id, file, { width, height });
    await updateScreenshotEdits(screenshot.id, nextEdits);
  };

  const handleDownload = async () => {
    const blob = await renderScreenshot(effectiveScreenshot);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mimik-screenshot-${screenshot.id}.webp`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteImage = async () => {
    if (!window.confirm(i18n.t('screenshotView.deleteConfirm'))) return;
    await deleteScreenshot(screenshot.id, screenshot.stepId);
    setDeleted(true);
  };

  const ratio = baseScreenshot.width && baseScreenshot.height ? baseScreenshot.width / baseScreenshot.height : 16 / 9;

  if (deleted) {
    return (
      <div
        className={`rounded-lg border border-border bg-secondary flex items-center justify-center text-sm text-muted-foreground ${className}`}
        style={{ aspectRatio: ratio }}
      >
        {i18n.t('screenshotView.imageDeleted')}
      </div>
    );
  }

  if (!fullUrl) {
    return (
      <div className={`rounded-lg bg-secondary p-4 flex flex-col gap-2.5 ${className}`} style={{ aspectRatio: ratio }}>
        <div className="h-7 rounded-md bg-border/60 animate-pulse" />
        <div className="flex-1 flex gap-3">
          <div className="w-[30%] flex flex-col gap-2">
            <div className="h-5 rounded bg-border/50 animate-pulse [animation-delay:100ms]" />
            <div className="h-4 rounded bg-border/40 animate-pulse [animation-delay:200ms]" />
            <div className="h-4 rounded bg-border/40 animate-pulse [animation-delay:300ms]" />
            <div className="h-4 rounded bg-border/40 animate-pulse [animation-delay:400ms]" />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-6 w-3/5 rounded bg-border/40 animate-pulse [animation-delay:150ms]" />
            <div className="h-3 w-4/5 rounded bg-border/30 animate-pulse [animation-delay:250ms]" />
            <div className="h-3 w-[70%] rounded bg-border/30 animate-pulse [animation-delay:350ms]" />
            <div className="h-3 w-3/4 rounded bg-border/30 animate-pulse [animation-delay:450ms]" />
          </div>
        </div>
      </div>
    );
  }

  const currentViewport = resolveViewport(effectiveScreenshot);
  const isZoomed =
    currentViewport.width < baseScreenshot.width - VIEWPORT_EPSILON ||
    currentViewport.height < baseScreenshot.height - VIEWPORT_EPSILON;
  const showZoomControls = !readOnly && crop;
  const showTopControls = !readOnly;
  const altText = effectiveEdits?.alt || alt;

  const fullFrame: ScreenshotBounds = { x: 0, y: 0, width: baseScreenshot.width, height: baseScreenshot.height };
  const displayedViewport = crop && showViewport ? currentViewport : fullFrame;
  const imgStyle: React.CSSProperties = {
    width: `${(baseScreenshot.width / displayedViewport.width) * 100}%`,
    height: `${(baseScreenshot.height / displayedViewport.height) * 100}%`,
    left: `${(-displayedViewport.x / displayedViewport.width) * 100}%`,
    top: `${(-displayedViewport.y / displayedViewport.height) * 100}%`,
    transition: animate ? FRAME_TRANSITION : undefined,
  };

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border ${className}`}>
      <div
        data-screenshot-frame=""
        className="relative overflow-hidden w-full"
        style={{ aspectRatio: `${displayedViewport.width} / ${displayedViewport.height}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <img
          src={fullUrl}
          alt={altText}
          draggable={false}
          className={`absolute block max-w-none ${showZoomControls && isZoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={imgStyle}
        />
      </div>
      {showTopControls && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center h-7 px-2 rounded-md border border-border bg-card/90 text-foreground backdrop-blur-sm text-[10px] font-semibold tracking-wide transition-colors hover:bg-secondary hover:text-accent"
                title={i18n.t('screenshotView.altLabel')}
              >
                {i18n.t('screenshotView.altButton')}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-semibold text-foreground mb-2">{i18n.t('screenshotView.altLabel')}</p>
              <textarea
                value={altDraft}
                onChange={(e) => handleAltChange(e.target.value)}
                placeholder={i18n.t('screenshotView.altPlaceholder')}
                rows={3}
                className="w-full text-sm rounded-md border border-border bg-card px-2 py-1.5 text-foreground outline-none focus-visible:border-accent resize-none"
              />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary hover:text-accent"
                title={i18n.t('screenshotView.editMenu')}
              >
                <Pencil size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={handleClickTarget}>
                <Target size={14} />
                {i18n.t('screenshotView.clickTarget')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenEditor?.('annotate')}>
                <Highlighter size={14} />
                {i18n.t('screenshotView.annotate')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenEditor?.('redact')}>
                <EyeOff size={14} />
                {i18n.t('screenshotView.redact')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenEditor?.('crop')}>
                <Crop size={14} />
                {i18n.t('screenshotView.crop')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleReplaceClick}>
                <ImageUp size={14} />
                {i18n.t('screenshotView.replaceImage')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleDownload}>
                <Download size={14} />
                {i18n.t('screenshotView.download')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleDeleteImage}>
                <Trash2 size={14} />
                {i18n.t('screenshotView.deleteImage')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      )}
      {!readOnly && saved && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center px-2.5 h-7 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground shadow-sm">
          {i18n.t('screenshotView.saved')}
        </span>
      )}
      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1">
        {showZoomControls && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleZoom(ZOOM_IN_FACTOR);
              }}
              className="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary hover:text-accent"
              title={i18n.t('screenshotView.zoomIn')}
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleZoom(ZOOM_OUT_FACTOR);
              }}
              className="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary hover:text-accent"
              title={i18n.t('screenshotView.zoomOut')}
            >
              <ZoomOut size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
