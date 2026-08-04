import { describe, expect, it } from 'vitest';
import type { Screenshot } from '@/core/guides/types';
import { resolveViewport } from '@/core/screenshot/geometry';

function makeScreenshot(overrides: Partial<Screenshot> = {}): Screenshot {
  return {
    id: 'ss-1',
    stepId: 'step-1',
    blob: new Blob(['x']),
    mimeType: 'image/png',
    width: 1000,
    height: 800,
    ...overrides,
  };
}

describe('resolveViewport', () => {
  it('returns the whole image when there are no bounds and no edits', () => {
    expect(resolveViewport(makeScreenshot())).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it('prefers an explicit viewport over the bounds default', () => {
    const s = makeScreenshot({
      bounds: { x: 10, y: 10, width: 50, height: 50 },
      edits: { viewport: { x: 100, y: 200, width: 300, height: 240 } },
    });
    expect(resolveViewport(s)).toEqual({ x: 100, y: 200, width: 300, height: 240 });
  });

  it('pads around bounds and keeps the image aspect ratio', () => {
    const s = makeScreenshot({ bounds: { x: 400, y: 300, width: 200, height: 100 }, pixelRatio: 1 });
    const v = resolveViewport(s);
    expect(v.width / v.height).toBeCloseTo(1000 / 800, 5);
    expect(v.width).toBeGreaterThan(200);
  });

  it('clamps the viewport inside the image', () => {
    const s = makeScreenshot({ bounds: { x: 0, y: 0, width: 40, height: 40 }, pixelRatio: 1 });
    const v = resolveViewport(s);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.x + v.width).toBeLessThanOrEqual(1000);
    expect(v.y + v.height).toBeLessThanOrEqual(800);
  });

  it('never exceeds the image size', () => {
    const s = makeScreenshot({ bounds: { x: 0, y: 0, width: 990, height: 790 }, pixelRatio: 1 });
    const v = resolveViewport(s);
    expect(v.width).toBeLessThanOrEqual(1000);
    expect(v.height).toBeLessThanOrEqual(800);
  });
});
