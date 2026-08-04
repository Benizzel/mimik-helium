import type { Screenshot } from '@/core/guides/types';
import { resolveTarget, resolveViewport } from './geometry';
import type { Annotation } from './types';

const TARGET_STROKE = 4;
const TARGET_RADIUS = 10;

interface RenderOptions {
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
  quality?: number;
}

function drawRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawAnnotation(ctx: OffscreenCanvasRenderingContext2D, a: Annotation, originX: number, originY: number) {
  ctx.save();
  switch (a.type) {
    case 'box':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(a.x, a.y, a.w, a.h);
      break;
    case 'target':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = TARGET_STROKE;
      if (a.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        drawRoundedRect(ctx, a.x, a.y, a.w, a.h, TARGET_RADIUS);
        ctx.stroke();
      }
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
        ctx.drawImage(ctx.canvas, a.x - originX, a.y - originY, a.w, a.h, a.x, a.y, a.w, a.h);
      }
      break;
  }
  ctx.restore();
}

export async function renderScreenshot(screenshot: Screenshot, opts: RenderOptions = {}): Promise<Blob> {
  const { format = 'image/webp', quality = 0.85 } = opts;
  const viewport = resolveViewport(screenshot);
  const bitmap = await createImageBitmap(screenshot.blob);

  const canvas = new OffscreenCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, viewport.x, viewport.y, viewport.width, viewport.height, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  ctx.translate(-viewport.x, -viewport.y);

  const target = resolveTarget(screenshot);
  if (target) {
    drawAnnotation(
      ctx,
      {
        id: 'target',
        type: 'target',
        x: target.x,
        y: target.y,
        w: target.width,
        h: target.height,
        color: target.color,
        shape: target.shape,
      },
      viewport.x,
      viewport.y,
    );
  }

  for (const a of screenshot.edits?.annotations ?? []) drawAnnotation(ctx, a, viewport.x, viewport.y);

  return canvas.convertToBlob({ type: format, quality });
}
