import { describe, expect, it } from 'vitest';
import type { Screenshot } from '@/core/guides/types';
import { cropTo, panBy, resolveViewport, zoomBy } from '@/core/screenshot/geometry';

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

const IMG = { width: 1000, height: 800 };
const FULL = { x: 0, y: 0, width: 1000, height: 800 };

describe('zoomBy', () => {
  it('shrinks the viewport around its centre when zooming in', () => {
    const v = zoomBy(FULL, 2, IMG);
    expect(v.width).toBe(500);
    expect(v.height).toBe(400);
    expect(v.x + v.width / 2).toBeCloseTo(500, 5);
    expect(v.y + v.height / 2).toBeCloseTo(400, 5);
  });

  it('never grows past the image', () => {
    expect(zoomBy(FULL, 0.5, IMG)).toEqual(FULL);
  });

  it('stays inside the image when zooming out from a corner', () => {
    const v = zoomBy({ x: 0, y: 0, width: 200, height: 160 }, 0.5, IMG);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.x + v.width).toBeLessThanOrEqual(1000);
  });

  it('clamps to a minimum viewport size', () => {
    let v = FULL;
    for (let i = 0; i < 20; i++) v = zoomBy(v, 2, IMG);
    expect(v.width).toBeGreaterThan(0);
    expect(v.height).toBeGreaterThan(0);
  });
});

describe('panBy', () => {
  it('translates the viewport', () => {
    const v = panBy({ x: 100, y: 100, width: 500, height: 400 }, 50, -20, IMG);
    expect(v).toEqual({ x: 150, y: 80, width: 500, height: 400 });
  });

  it('clamps at the image edges instead of scrolling past them', () => {
    const v = panBy({ x: 0, y: 0, width: 500, height: 400 }, -100, -100, IMG);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('clamps at the far edges', () => {
    const v = panBy({ x: 500, y: 400, width: 500, height: 400 }, 100, 100, IMG);
    expect(v.x).toBe(500);
    expect(v.y).toBe(400);
  });
});

describe('cropTo', () => {
  it('accepts a free aspect ratio', () => {
    expect(cropTo({ x: 10, y: 20, width: 100, height: 900 }, IMG)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 780,
    });
  });

  it('normalises a rect dragged up and to the left', () => {
    expect(cropTo({ x: 300, y: 200, width: -100, height: -50 }, IMG)).toEqual({
      x: 200,
      y: 150,
      width: 100,
      height: 50,
    });
  });
});
