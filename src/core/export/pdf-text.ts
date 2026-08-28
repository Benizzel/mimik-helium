const MM_PER_PT = 25.4 / 72;
const RASTER_SCALE = 4;
const ASCENT_RATIO = 0.8;
const RASTER_FONTS =
  '"Noto Sans", "Noto Sans CJK SC", "Noto Sans CJK JP", "Microsoft YaHei", "PingFang SC", "Hiragino Sans", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

const WINANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function needsRaster(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0xff) continue;
    if (WINANSI_EXTRAS.has(code)) continue;
    return true;
  }
  return false;
}

const CJK = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3ffff}]/u;

export function segments(text: string): string[] {
  const out: string[] = [];
  let word = '';
  for (const char of text) {
    if (/\s/.test(char) || CJK.test(char)) {
      if (word) {
        out.push(word);
        word = '';
      }
      out.push(char);
      continue;
    }
    word += char;
  }
  if (word) out.push(word);
  return out;
}

export function wrap(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const seg of segments(text)) {
    if (seg === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const next = line + seg;
    if (line && measure(next) > maxWidth) {
      lines.push(line.replace(/\s+$/, ''));
      line = /\s/.test(seg) ? '' : seg;
      continue;
    }
    line = next;
  }
  if (line.trim()) lines.push(line.replace(/\s+$/, ''));
  return lines.length ? lines : [''];
}

function context(): CanvasRenderingContext2D | null {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

export interface RasterText {
  dataUrl: string;
  width: number;
  height: number;
  ascent: number;
}

export function measurer(sizePt: number, bold: boolean): ((s: string) => number) | null {
  const ctx = context();
  if (!ctx) return null;
  ctx.font = `${bold ? 'bold ' : ''}${sizePt}px ${RASTER_FONTS}`;
  return (s: string) => ctx.measureText(s).width * MM_PER_PT;
}

export function rasterize(
  lines: string[],
  sizePt: number,
  bold: boolean,
  lineHeight: number,
  color: string,
): RasterText | null {
  const measure = measurer(sizePt, bold);
  if (!measure) return null;
  const widest = Math.max(...lines.map(measure), 0.01);
  const height = lines.length * lineHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((widest / MM_PER_PT) * RASTER_SCALE);
  canvas.height = Math.ceil((height / MM_PER_PT) * RASTER_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(RASTER_SCALE, RASTER_SCALE);
  ctx.font = `${bold ? 'bold ' : ''}${sizePt}px ${RASTER_FONTS}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const ascent = sizePt * ASCENT_RATIO;
  const step = lineHeight / MM_PER_PT;
  for (const [i, line] of lines.entries()) ctx.fillText(line, 0, ascent + i * step);
  return { dataUrl: canvas.toDataURL('image/png'), width: widest, height, ascent: ascent * MM_PER_PT };
}
