import type { Annotation, ArrowEnd } from './types';
import { DEFAULT_LINE_HEIGHT, FONT_FAMILIES, LINE_WIDTHS } from './types';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const TARGET_STROKE = 5;
export const TARGET_RADIUS = 12;
export const DEFAULT_DIM_OPACITY = 0.55;
export const DEFAULT_DIM_COLOR = '#0A0A0F';

function roundedRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
}

export function drawRoundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.closePath();
}

/**
 * Dims the whole viewport and punches a rounded-rect hole over the target
 * (single evenodd fill, so the hole is a true cutout rather than a redraw).
 */
export function drawSpotlight(
  ctx: Ctx,
  hole: { x: number; y: number; w: number; h: number },
  radius: number,
  viewport: { x: number; y: number; width: number; height: number },
  opacity: number = DEFAULT_DIM_OPACITY,
  color: string = DEFAULT_DIM_COLOR,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  roundedRectPath(ctx, hole.x, hole.y, hole.w, hole.h, radius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.fill('evenodd');
  ctx.restore();
}

function drawArrowEnd(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, width: number, end: ArrowEnd) {
  if (end === 'none') return;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = width * 4;
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(angle);
  ctx.beginPath();
  switch (end) {
    case 'bar':
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(0, size / 2);
      ctx.stroke();
      break;
    case 'arrow':
      ctx.moveTo(-size, -size / 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-size, size / 2);
      ctx.stroke();
      break;
    case 'arrow-solid':
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.lineTo(-size, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'circle':
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'circle-solid':
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'square':
      ctx.rect(-size / 2, -size / 2, size, size);
      ctx.stroke();
      break;
    case 'square-solid':
      ctx.rect(-size / 2, -size / 2, size, size);
      ctx.fill();
      break;
  }
  ctx.restore();
}

export function drawAnnotation(ctx: Ctx, a: Annotation, originX: number, originY: number) {
  ctx.save();
  switch (a.type) {
    case 'box':
      ctx.lineWidth = LINE_WIDTHS[a.lineWidth ?? 'ms'];
      if (a.fill && a.fill !== 'transparent') {
        ctx.fillStyle = a.fill;
        drawRoundedRect(ctx, a.x, a.y, a.w, a.h, a.radius ?? 0);
        ctx.fill();
      }
      if (ctx.lineWidth > 0) {
        ctx.strokeStyle = a.color;
        drawRoundedRect(ctx, a.x, a.y, a.w, a.h, a.radius ?? 0);
        ctx.stroke();
      }
      break;
    case 'ellipse':
      ctx.lineWidth = LINE_WIDTHS[a.lineWidth ?? 'ms'];
      ctx.beginPath();
      ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w / 2), Math.abs(a.h / 2), 0, 0, Math.PI * 2);
      if (a.fill && a.fill !== 'transparent') {
        ctx.fillStyle = a.fill;
        ctx.fill();
      }
      ctx.strokeStyle = a.color;
      ctx.stroke();
      break;
    case 'target':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = TARGET_STROKE;
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 16;
      if (a.border === 'dashed') ctx.setLineDash([8, 5]);
      drawRoundedRect(ctx, a.x, a.y, a.w, a.h, TARGET_RADIUS);
      ctx.stroke();
      break;
    case 'arrow': {
      const w = LINE_WIDTHS[a.lineWidth ?? 'ms'];
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      drawArrowEnd(ctx, a.x1, a.y1, a.x2, a.y2, w, a.end ?? 'arrow-solid');
      break;
    }
    case 'text': {
      const px = a.size;
      const family = FONT_FAMILIES[a.fontFamily ?? 'sans-serif'];
      const style = a.italic ? 'italic ' : '';
      const weight = a.bold ? 700 : 500;
      ctx.fillStyle = a.color;
      ctx.font = `${style}${weight} ${px}px ${family}`;
      const ratio = typeof a.lineHeight === 'number' ? a.lineHeight : DEFAULT_LINE_HEIGHT;
      const lh = px * ratio;
      a.text.split('\n').forEach((line, i) => {
        ctx.fillText(line, a.x, a.y + i * lh);
      });
      break;
    }
    case 'freehand':
      ctx.strokeStyle = a.color;
      ctx.lineWidth = LINE_WIDTHS[a.lineWidth ?? 'md'];
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
