import { ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { updateScreenshotEdits } from '@/core/guides/service';
import type { Screenshot, ScreenshotBounds } from '@/core/guides/types';
import { panBy, resolveViewport, zoomBy } from '@/core/screenshot/geometry';
import { renderScreenshot } from '@/core/screenshot/render';
import type { ScreenshotEdits } from '@/core/screenshot/types';

interface ScreenshotViewProps {
  screenshot: Screenshot;
  className?: string;
  alt?: string;
  animate?: boolean;
  crop?: boolean;
  readOnly?: boolean;
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

function isFullFrame(viewport: ScreenshotBounds, screenshot: Screenshot): boolean {
  return (
    viewport.x === 0 && viewport.y === 0 && viewport.width === screenshot.width && viewport.height === screenshot.height
  );
}

function withFullViewport(screenshot: Screenshot): Screenshot {
  return {
    ...screenshot,
    edits: { ...screenshot.edits, viewport: { x: 0, y: 0, width: screenshot.width, height: screenshot.height } },
  };
}

export default function ScreenshotView({
  screenshot,
  className = '',
  alt = '',
  animate = false,
  crop = false,
  readOnly = false,
}: ScreenshotViewProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [showCropped, setShowCropped] = useState(false);
  const [editsOverride, setEditsOverride] = useState<ScreenshotEdits | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const processedKeyRef = useRef<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);
  const idRef = useRef(screenshot.id);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const effectiveEdits = editsOverride ?? screenshot.edits;

  useEffect(() => {
    if (idRef.current !== screenshot.id) {
      idRef.current = screenshot.id;
      setEditsOverride(undefined);
    }
  }, [screenshot.id]);

  useEffect(() => {
    if (!screenshot.blob) return;
    const cacheKey = `${screenshot.id}:${screenshot.blob.size}:${JSON.stringify(effectiveEdits)}`;
    if (processedKeyRef.current === cacheKey) return;

    let cancelled = false;
    const current: Screenshot = { ...screenshot, edits: effectiveEdits };

    (async () => {
      const viewport = resolveViewport(current);
      const needsCrop = crop && !isFullFrame(viewport, current);

      const [fullBlob, viewportBlob] = await Promise.all([
        renderScreenshot(withFullViewport(current)),
        needsCrop ? renderScreenshot(current) : Promise.resolve(null),
      ]);

      const newFullUrl = URL.createObjectURL(fullBlob);
      const newCroppedUrl = viewportBlob ? URL.createObjectURL(viewportBlob) : null;

      if (cancelled) {
        URL.revokeObjectURL(newFullUrl);
        if (newCroppedUrl) URL.revokeObjectURL(newCroppedUrl);
        return;
      }

      processedKeyRef.current = cacheKey;
      for (const u of urlsRef.current) URL.revokeObjectURL(u);

      if (newCroppedUrl) {
        urlsRef.current = [newFullUrl, newCroppedUrl];
        setShowCropped(false);
        setFullUrl(newFullUrl);
        setCroppedUrl(newCroppedUrl);
      } else {
        urlsRef.current = [newFullUrl];
        setShowCropped(true);
        setFullUrl(newFullUrl);
        setCroppedUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screenshot, crop, effectiveEdits]);

  useEffect(() => {
    if (!croppedUrl || showCropped) return;
    if (!animate) {
      setShowCropped(true);
      return;
    }
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        setShowCropped(true);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [croppedUrl, showCropped, animate]);

  useEffect(() => {
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
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
    const current: Screenshot = { ...screenshot, edits: effectiveEdits };
    const viewport = resolveViewport(current);
    const nextViewport = zoomBy(viewport, factor, screenshot);
    const nextEdits: ScreenshotEdits = { ...effectiveEdits, viewport: nextViewport };
    setEditsOverride(nextEdits);
    scheduleSave(nextEdits);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (readOnly || !crop) return;
    const viewport = resolveViewport({ ...screenshot, edits: effectiveEdits });
    const zoomed =
      viewport.width < screenshot.width - VIEWPORT_EPSILON || viewport.height < screenshot.height - VIEWPORT_EPSILON;
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

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const el = imgRef.current;
    if (!el || el.clientWidth === 0) return;
    drag.moved = true;
    const scale = drag.startViewport.width / el.clientWidth;
    const dx = (e.clientX - drag.startX) * scale;
    const dy = (e.clientY - drag.startY) * scale;
    const nextViewport = panBy(drag.startViewport, -dx, -dy, screenshot);
    setEditsOverride({ ...effectiveEdits, viewport: nextViewport });
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (drag.moved) scheduleSave(effectiveEdits ?? {});
  };

  const ratio = screenshot.width && screenshot.height ? screenshot.width / screenshot.height : 16 / 9;

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

  const currentViewport = resolveViewport({ ...screenshot, edits: effectiveEdits });
  const isZoomed =
    currentViewport.width < screenshot.width - VIEWPORT_EPSILON ||
    currentViewport.height < screenshot.height - VIEWPORT_EPSILON;
  const showControls = !readOnly && crop;

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border ${className}`}>
      <img
        ref={imgRef}
        src={croppedUrl || fullUrl}
        alt={alt}
        draggable={false}
        className={`w-full block ${showControls && isZoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
      {croppedUrl && (
        <img
          src={fullUrl}
          alt=""
          className="absolute inset-0 w-full h-full block pointer-events-none"
          style={{
            opacity: showCropped ? 0 : 1,
            transition: 'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}
      {showControls && (
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1">
          {saved && (
            <span className="flex items-center px-2 h-7 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground shadow-sm">
              {i18n.t('screenshotView.saved')}
            </span>
          )}
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
        </div>
      )}
    </div>
  );
}
