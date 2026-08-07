import { i18n } from '#imports';
import type { Branding } from '@/core/export/branding';
import { dataUrlToBytes, fitLogo, loadBranding } from '@/core/export/branding';
import type { ExportOptions } from '@/core/export/options';
import { loadExportOptions } from '@/core/export/options';
import { extractDomain, formatDate } from '@/core/export/utils';
import { FRAME_HEIGHT, FRAME_WIDTH, pickContainer } from '@/core/export/video-support';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import type { Ctx } from '@/core/screenshot/draw';
import { drawRoundedRect } from '@/core/screenshot/draw';
import { clamp, resolveTarget, resolveViewport } from '@/core/screenshot/geometry';
import { renderScreenshot } from '@/core/screenshot/render';

export const FPS = 30;
const STEP_ZOOMED_OUT_SEC = 1.5;
const STEP_ZOOM_TRANSITION_SEC = 0.73;
const STEP_ZOOMED_IN_SEC = 3;
const TRANSITION_DURATION_SEC = 0.33;
const COVER_SECONDS = 3;
const KEY_FRAME_INTERVAL_SEC = 2;

const ZOOM_MIN = 1;
const ZOOM_MAX = 3.5;
const ZOOM_PAD_RATIO = 0.15;

const BACKDROP = '#1E1B4B';
const MUTED = '#9CA3AF';
const ON_DARK = '#FFFFFF';

const TOOLTIP_BG = 'rgba(17, 15, 43, 0.92)';
const TOOLTIP_FONT_SIZE = 20;
const TOOLTIP_LINE_HEIGHT = 27;
const TOOLTIP_PADDING_X = 16;
const TOOLTIP_PADDING_Y = 12;
const TOOLTIP_RADIUS = 10;
const TOOLTIP_GAP = 14;
const TOOLTIP_MAX_LINES = 3;
const TOOLTIP_MAX_WIDTH_RATIO = 0.45;
const FRAME_PADDING = 20;

const COVER_MARGIN = 96;
const COVER_CELL_WIDTH = 300;

export const STEP_SECONDS = STEP_ZOOMED_OUT_SEC + STEP_ZOOM_TRANSITION_SEC + STEP_ZOOMED_IN_SEC;

export function toFrames(seconds: number, fps = FPS): number {
  return Math.round(seconds * fps);
}

export function stepFrames(fps = FPS): number {
  return toFrames(STEP_SECONDS, fps);
}

export function overlapFrames(fps = FPS): number {
  return toFrames(TRANSITION_DURATION_SEC, fps);
}

export function totalStepFrames(stepCount: number, fps = FPS): number {
  if (stepCount <= 0) return 0;
  return stepCount * stepFrames(fps) - (stepCount - 1) * overlapFrames(fps);
}

export function zoomProgress(frame: number, fps = FPS): number {
  const held = toFrames(STEP_ZOOMED_OUT_SEC, fps);
  const moving = toFrames(STEP_ZOOM_TRANSITION_SEC, fps);
  if (frame <= held) return 0;
  if (frame >= held + moving) return 1;
  return (frame - held) / moving;
}

export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

export function findIdealZoomLevel(
  target: Rect,
  imgWidth: number,
  imgHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  const nx = target.x / imgWidth;
  const ny = target.y / imgHeight;
  const needWidth = Math.min(target.width / imgWidth + 2 * ZOOM_PAD_RATIO, 1 - nx) * viewWidth;
  const needHeight = Math.min(target.height / imgHeight + 2 * ZOOM_PAD_RATIO, 1 - ny) * viewHeight;
  const zoom = Math.min(viewWidth / needWidth, viewHeight / needHeight);
  return Number.isFinite(zoom) ? clamp(zoom, ZOOM_MIN, ZOOM_MAX) : ZOOM_MIN;
}

export function zoomCrop(
  image: Size,
  target: Rect | null,
  eased: number,
  viewWidth = FRAME_WIDTH,
  viewHeight = FRAME_HEIGHT,
): Rect {
  const full = { x: 0, y: 0, width: image.width, height: image.height };
  if (!target) return full;

  const zoom = findIdealZoomLevel(target, image.width, image.height, viewWidth, viewHeight);
  if (zoom <= ZOOM_MIN) return full;

  const width = image.width / zoom;
  const height = image.height / zoom;
  const x = clamp(target.x + target.width / 2 - width / 2, 0, image.width - width);
  const y = clamp(target.y + target.height / 2 - height / 2, 0, image.height - height);
  const t = clamp(eased, 0, 1);

  return {
    x: x * t,
    y: y * t,
    width: image.width + (width - image.width) * t,
    height: image.height + (height - image.height) * t,
  };
}

export function letterbox(srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number) {
  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { scale, width, height, x: (dstWidth - width) / 2, y: (dstHeight - height) / 2 };
}

export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
  maxLines = TOOLTIP_MAX_LINES,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
        return lines;
      }
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function tooltipPlacement(
  target: Rect,
  tooltip: { width: number; height: number },
  frameWidth = FRAME_WIDTH,
  frameHeight = FRAME_HEIGHT,
) {
  const below = target.y + target.height + TOOLTIP_GAP;
  const fitsBelow = below + tooltip.height <= frameHeight - FRAME_PADDING;
  const rawY = fitsBelow ? below : target.y - TOOLTIP_GAP - tooltip.height;
  const rawX = target.x + target.width / 2 - tooltip.width / 2;
  return {
    x: clamp(rawX, FRAME_PADDING, Math.max(FRAME_PADDING, frameWidth - tooltip.width - FRAME_PADDING)),
    y: clamp(rawY, FRAME_PADDING, Math.max(FRAME_PADDING, frameHeight - tooltip.height - FRAME_PADDING)),
    below: fitsBelow,
  };
}

function logoBitmap(logo: NonNullable<Branding['logo']>): Promise<ImageBitmap> {
  const bytes = dataUrlToBytes(logo.dataUrl);
  return createImageBitmap(new Blob([bytes as BlobPart]));
}

function drawTooltip(ctx: Ctx, text: string, target: Rect) {
  ctx.font = `500 ${TOOLTIP_FONT_SIZE}px Poppins, sans-serif`;
  const lines = wrapLines(text, FRAME_WIDTH * TOOLTIP_MAX_WIDTH_RATIO, (line) => ctx.measureText(line).width);
  if (lines.length === 0) return;

  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const width = textWidth + TOOLTIP_PADDING_X * 2;
  const height = lines.length * TOOLTIP_LINE_HEIGHT + TOOLTIP_PADDING_Y * 2;
  const at = tooltipPlacement(target, { width, height });

  ctx.fillStyle = TOOLTIP_BG;
  drawRoundedRect(ctx, at.x, at.y, width, height, TOOLTIP_RADIUS);
  ctx.fill();

  ctx.fillStyle = ON_DARK;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, at.x + TOOLTIP_PADDING_X, at.y + TOOLTIP_PADDING_Y + i * TOOLTIP_LINE_HEIGHT);
  });
}

interface StepLayer {
  bitmap: ImageBitmap;
  fit: ReturnType<typeof letterbox>;
  target: Rect | null;
  description: string;
}

async function loadStepLayer(step: Step, screenshot: Screenshot): Promise<StepLayer> {
  const rendered = await renderScreenshot(screenshot, { format: 'image/webp', quality: 0.9 });
  const bitmap = await createImageBitmap(rendered);
  const viewport = resolveViewport(screenshot);
  const target = resolveTarget(screenshot);
  const sx = bitmap.width / viewport.width;
  const sy = bitmap.height / viewport.height;

  return {
    bitmap,
    fit: letterbox(bitmap.width, bitmap.height, FRAME_WIDTH, FRAME_HEIGHT),
    target: target
      ? {
          x: (target.x - viewport.x) * sx,
          y: (target.y - viewport.y) * sy,
          width: target.width * sx,
          height: target.height * sy,
        }
      : null,
    description: step.description,
  };
}

function drawStepFrame(ctx: Ctx, layer: StepLayer, frame: number) {
  const crop = zoomCrop(layer.bitmap, layer.target, easeInOut(zoomProgress(frame)));
  const { fit } = layer;
  ctx.drawImage(layer.bitmap, crop.x, crop.y, crop.width, crop.height, fit.x, fit.y, fit.width, fit.height);

  if (!layer.description) return;

  const scale = fit.width / crop.width;
  const anchor: Rect = layer.target
    ? {
        x: fit.x + (layer.target.x - crop.x) * scale,
        y: fit.y + (layer.target.y - crop.y) * scale,
        width: layer.target.width * scale,
        height: layer.target.height * scale,
      }
    : { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT, width: 0, height: 0 };

  drawTooltip(ctx, layer.description, anchor);
}

async function drawCoverFrame(ctx: Ctx, guide: Guide, steps: Step[], brand: Branding) {
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  ctx.textBaseline = 'top';

  let y = 150;
  ctx.fillStyle = MUTED;
  ctx.font = '700 14px Poppins, sans-serif';
  ctx.fillText(i18n.t('export.guideLabel').toUpperCase(), COVER_MARGIN, y);
  y += 34;

  ctx.fillStyle = ON_DARK;
  ctx.font = '700 52px Poppins, sans-serif';
  const titleWidth = FRAME_WIDTH - COVER_MARGIN * 2 - (brand.logo ? 240 : 0);
  for (const line of wrapLines(guide.title, titleWidth, (l) => ctx.measureText(l).width, 2)) {
    ctx.fillText(line, COVER_MARGIN, y);
    y += 64;
  }

  y += 26;
  ctx.strokeStyle = brand.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(COVER_MARGIN, y);
  ctx.lineTo(FRAME_WIDTH - COVER_MARGIN, y);
  ctx.stroke();
  y += 26;

  const domain = extractDomain(steps);
  const cells: Array<[string, string]> = [
    [i18n.t('export.steps').toUpperCase(), String(steps.length).padStart(2, '0')],
    [i18n.t('export.created').toUpperCase(), formatDate(guide.createdAt)],
  ];
  if (domain) cells.push([i18n.t('export.source').toUpperCase(), domain]);

  cells.forEach(([label, value], index) => {
    const x = COVER_MARGIN + index * COVER_CELL_WIDTH;
    ctx.fillStyle = MUTED;
    ctx.font = '700 12px Poppins, sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = index === 0 ? brand.accent : ON_DARK;
    ctx.font = '700 30px Poppins, sans-serif';
    ctx.fillText(value, x, y + 20);
  });

  if (brand.logo) {
    const size = fitLogo(brand.logo, 200, 64);
    const bitmap = await logoBitmap(brand.logo);
    ctx.drawImage(bitmap, FRAME_WIDTH - COVER_MARGIN - size.width, 132, size.width, size.height);
    bitmap.close();
  }

  const footer = [brand.footer, brand.attribution ? i18n.t('export.madeWith') : ''].filter(Boolean).join('   ·   ');
  if (footer) {
    ctx.fillStyle = MUTED;
    ctx.font = '500 15px Poppins, sans-serif';
    ctx.fillText(footer, COVER_MARGIN, FRAME_HEIGHT - 96);
  }
}

export type VideoOptions = Pick<ExportOptions, 'cover'>;

export interface VideoExportControls {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface VideoExportResult {
  blob: Blob;
  extension: string;
}

export async function exportGuideAsVideo(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
  exportOptions?: VideoOptions,
  controls: VideoExportControls = {},
): Promise<VideoExportResult> {
  const frames = steps.filter((step) => screenshots.has(step.id));
  if (frames.length === 0) throw new Error('This guide has no screenshots to turn into a video');

  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } = await import(
    'mediabunny'
  );

  const container = await pickContainer();
  if (!container) throw new Error('This browser cannot encode video');
  const mp4 = container === 'mp4';

  const [brand, options] = await Promise.all([
    loadBranding(),
    exportOptions ? Promise.resolve(exportOptions) : loadExportOptions(),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const output = new Output({
    format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: mp4 ? 'avc' : 'vp9',
    quality: QUALITY_HIGH,
    keyFrameInterval: KEY_FRAME_INTERVAL_SEC,
  });
  output.addVideoTrack(source);
  await output.start();

  const span = stepFrames();
  const overlap = overlapFrames();
  const stride = span - overlap;
  const stepTotal = totalStepFrames(frames.length);
  const total = stepTotal + (options.cover ? 1 : 0);
  const loaded = new Map<number, StepLayer>();
  const { onProgress, signal } = controls;
  let done = 0;

  const layerAt = async (index: number) => {
    const cached = loaded.get(index);
    if (cached) return cached;
    const layer = await loadStepLayer(frames[index], screenshots.get(frames[index].id) as Screenshot);
    loaded.set(index, layer);
    return layer;
  };

  const releaseBefore = (index: number) => {
    for (const [key, layer] of loaded) {
      if (key < index) {
        layer.bitmap.close();
        loaded.delete(key);
      }
    }
  };

  const abortIfRequested = () => {
    if (signal?.aborted) throw new DOMException('Video export was aborted', 'AbortError');
  };

  try {
    const offset = options.cover ? COVER_SECONDS : 0;

    if (options.cover) {
      abortIfRequested();
      await drawCoverFrame(ctx, guide, frames, brand);
      await source.add(0, COVER_SECONDS);
      done += 1;
      onProgress?.(done, total);
    }

    for (let frame = 0; frame < stepTotal; frame++) {
      abortIfRequested();

      const index = Math.min(Math.floor(frame / stride), frames.length - 1);
      const local = frame - index * stride;
      const outgoing = index > 0 && local < overlap ? index - 1 : -1;

      const current = await layerAt(index);
      const previous = outgoing >= 0 ? await layerAt(outgoing) : null;
      releaseBefore(outgoing >= 0 ? outgoing : index);

      ctx.globalAlpha = 1;
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

      if (previous) {
        drawStepFrame(ctx, previous, local + stride);
        ctx.globalAlpha = (local + 1) / overlap;
        drawStepFrame(ctx, current, local);
        ctx.globalAlpha = 1;
      } else {
        drawStepFrame(ctx, current, local);
      }

      await source.add(offset + frame / FPS, 1 / FPS);
      done += 1;
      onProgress?.(done, total);
    }

    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    for (const layer of loaded.values()) layer.bitmap.close();
    loaded.clear();
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Video encoding produced no output');

  return {
    blob: new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' }),
    extension: mp4 ? 'mp4' : 'webm',
  };
}
