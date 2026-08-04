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
