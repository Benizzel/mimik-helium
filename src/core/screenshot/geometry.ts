import type { Screenshot, ScreenshotBounds } from '@/core/guides/types';

const PAD_RATIO = 0.3;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function resolveViewport(screenshot: Screenshot): ScreenshotBounds {
  const imgW = screenshot.width;
  const imgH = screenshot.height;
  const explicit = screenshot.edits?.viewport;
  if (explicit) return explicit;

  const bounds = screenshot.bounds;
  if (!bounds) return { x: 0, y: 0, width: imgW, height: imgH };

  const dpr = screenshot.pixelRatio || 1;
  const bx = bounds.x * dpr;
  const by = bounds.y * dpr;
  const bw = bounds.width * dpr;
  const bh = bounds.height * dpr;

  const imgAspect = imgW / imgH;
  const elAspect = bw / bh;

  let visW = bw + PAD_RATIO * imgW;
  let visH = bh + PAD_RATIO * imgH;

  if (elAspect > 1) {
    visH = visW / imgAspect;
  } else if (elAspect < 1) {
    visW = visH * imgAspect;
  }

  visW = Math.min(visW, imgW);
  visH = Math.min(visH, imgH);

  return {
    x: clamp(bx + bw / 2 - visW / 2, 0, imgW - visW),
    y: clamp(by + bh / 2 - visH / 2, 0, imgH - visH),
    width: visW,
    height: visH,
  };
}

const MIN_VIEWPORT = 40;

interface ImageSize {
  width: number;
  height: number;
}

function fitRect(rect: ScreenshotBounds, img: ImageSize): ScreenshotBounds {
  const width = Math.min(rect.width, img.width);
  const height = Math.min(rect.height, img.height);
  return {
    width,
    height,
    x: clamp(rect.x, 0, img.width - width),
    y: clamp(rect.y, 0, img.height - height),
  };
}

export function zoomBy(viewport: ScreenshotBounds, factor: number, img: ImageSize): ScreenshotBounds {
  const cx = viewport.x + viewport.width / 2;
  const cy = viewport.y + viewport.height / 2;
  const width = clamp(viewport.width / factor, MIN_VIEWPORT, img.width);
  const height = clamp(viewport.height / factor, MIN_VIEWPORT, img.height);
  return fitRect({ x: cx - width / 2, y: cy - height / 2, width, height }, img);
}

export function panBy(viewport: ScreenshotBounds, dx: number, dy: number, img: ImageSize): ScreenshotBounds {
  return fitRect({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }, img);
}

export function cropTo(rect: ScreenshotBounds, img: ImageSize): ScreenshotBounds {
  const x0 = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y0 = rect.height < 0 ? rect.y + rect.height : rect.y;
  const width0 = Math.abs(rect.width);
  const height0 = Math.abs(rect.height);
  const x = clamp(x0, 0, img.width);
  const y = clamp(y0, 0, img.height);
  return {
    x,
    y,
    width: clamp(width0, 0, img.width - x),
    height: clamp(height0, 0, img.height - y),
  };
}
