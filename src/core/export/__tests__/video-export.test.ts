// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  easeInOut,
  FPS,
  findIdealZoomLevel,
  letterbox,
  overlapFrames,
  STEP_SECONDS,
  stepFrames,
  toFrames,
  tooltipPlacement,
  totalStepFrames,
  wrapLines,
  zoomCrop,
  zoomProgress,
} from '@/core/export/video-export';
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/core/export/video-support';

const measure = (line: string) => line.length * 10;

describe('step timing', () => {
  it('holds every step for the structural 5.23 seconds', () => {
    expect(STEP_SECONDS).toBeCloseTo(5.23, 10);
  });

  it('rounds a step to 157 frames at 30 fps', () => {
    expect(FPS).toBe(30);
    expect(stepFrames()).toBe(157);
  });

  it('overlaps consecutive steps by ten frames', () => {
    expect(overlapFrames()).toBe(10);
    expect(toFrames(0.33)).toBe(10);
  });

  it('emits a single step without subtracting an overlap', () => {
    expect(totalStepFrames(1)).toBe(157);
  });

  it('subtracts one overlap per seam', () => {
    expect(totalStepFrames(2)).toBe(157 * 2 - 10);
    expect(totalStepFrames(6)).toBe(157 * 6 - 10 * 5);
    expect(totalStepFrames(6)).toBe(892);
  });

  it('returns nothing for a guide with no usable steps', () => {
    expect(totalStepFrames(0)).toBe(0);
  });
});

describe('zoomProgress', () => {
  it('stays fully zoomed out through the opening hold', () => {
    expect(zoomProgress(0)).toBe(0);
    expect(zoomProgress(44)).toBe(0);
    expect(zoomProgress(45)).toBe(0);
  });

  it('ramps across the transition window', () => {
    expect(zoomProgress(56)).toBeCloseTo(0.5, 2);
  });

  it('is fully zoomed in for the closing hold', () => {
    expect(zoomProgress(67)).toBe(1);
    expect(zoomProgress(156)).toBe(1);
  });

  it('rises monotonically', () => {
    let last = -1;
    for (let frame = 0; frame <= stepFrames(); frame++) {
      const value = zoomProgress(frame);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });
});

describe('easeInOut', () => {
  it('pins the endpoints exactly', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
  });

  it('passes through the midpoint', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
  });

  it('is symmetric about the midpoint', () => {
    for (const d of [0.05, 0.17, 0.3, 0.45]) {
      expect(easeInOut(0.5 + d)).toBeCloseTo(1 - easeInOut(0.5 - d), 10);
    }
  });

  it('increases monotonically', () => {
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const value = easeInOut(i / 100);
      expect(value).toBeGreaterThan(last);
      last = value;
    }
  });

  it('eases in slowly and out slowly', () => {
    expect(easeInOut(0.25)).toBeLessThan(0.25);
    expect(easeInOut(0.75)).toBeGreaterThan(0.75);
  });

  it('clamps input outside the unit range', () => {
    expect(easeInOut(-2)).toBe(0);
    expect(easeInOut(4)).toBe(1);
  });
});

describe('findIdealZoomLevel', () => {
  const zoom = (rect: { x: number; y: number; width: number; height: number }) =>
    findIdealZoomLevel(rect, 1000, 800, FRAME_WIDTH, FRAME_HEIGHT);

  it('refuses to zoom when the target already fills the frame', () => {
    expect(zoom({ x: 0, y: 0, width: 1000, height: 800 })).toBe(1);
  });

  it('caps at the composition ceiling for a target hugging the bottom-right', () => {
    expect(zoom({ x: 800, y: 640, width: 20, height: 16 })).toBe(3.5);
  });

  it('zooms further on a small target than on a large one', () => {
    const small = zoom({ x: 480, y: 380, width: 40, height: 40 });
    const large = zoom({ x: 300, y: 240, width: 400, height: 320 });
    expect(small).toBeGreaterThan(large);
    expect(large).toBeGreaterThanOrEqual(1);
    expect(small).toBeLessThanOrEqual(3.5);
  });

  it('never leaves the one-to-ceiling band', () => {
    for (const rect of [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 999, y: 799, width: 1, height: 1 },
      { x: 0, y: 0, width: 5000, height: 5000 },
      { x: 1000, y: 800, width: 10, height: 10 },
    ]) {
      const level = zoom(rect);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(3.5);
    }
  });
});

describe('zoomCrop', () => {
  const image = { width: 1000, height: 800 };
  const target = { x: 480, y: 380, width: 40, height: 40 };

  it('starts on the whole image', () => {
    expect(zoomCrop(image, target, 0)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it('ends on a crop centred on the target', () => {
    const crop = zoomCrop(image, target, 1);
    const level = findIdealZoomLevel(target, image.width, image.height, FRAME_WIDTH, FRAME_HEIGHT);
    expect(crop.width).toBeCloseTo(image.width / level, 6);
    expect(crop.height).toBeCloseTo(image.height / level, 6);
    expect(crop.x + crop.width / 2).toBeCloseTo(target.x + target.width / 2, 6);
    expect(crop.y + crop.height / 2).toBeCloseTo(target.y + target.height / 2, 6);
  });

  it('lands halfway between the two at the midpoint', () => {
    const start = zoomCrop(image, target, 0);
    const middle = zoomCrop(image, target, 0.5);
    const end = zoomCrop(image, target, 1);
    expect(middle.width).toBeCloseTo((start.width + end.width) / 2, 6);
    expect(middle.x).toBeCloseTo((start.x + end.x) / 2, 6);
    expect(middle.width).toBeLessThan(start.width);
    expect(middle.width).toBeGreaterThan(end.width);
  });

  it('keeps the image aspect ratio at every point of the ramp', () => {
    for (let i = 0; i <= 20; i++) {
      const crop = zoomCrop(image, target, i / 20);
      expect(crop.width / crop.height).toBeCloseTo(image.width / image.height, 6);
    }
  });

  it('never samples outside the image', () => {
    const corners = [
      { x: 0, y: 0, width: 30, height: 20 },
      { x: 970, y: 780, width: 30, height: 20 },
      { x: 0, y: 780, width: 30, height: 20 },
      { x: 970, y: 0, width: 30, height: 20 },
      { x: 480, y: 380, width: 40, height: 40 },
    ];
    for (const rect of corners) {
      for (let i = 0; i <= 20; i++) {
        const crop = zoomCrop(image, rect, i / 20);
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.width).toBeLessThanOrEqual(image.width + 1e-9);
        expect(crop.y + crop.height).toBeLessThanOrEqual(image.height + 1e-9);
      }
    }
  });

  it('holds the full frame for a step with no target', () => {
    for (const t of [0, 0.5, 1]) {
      expect(zoomCrop(image, null, t)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    }
  });

  it('holds the full frame when the ideal zoom is already one', () => {
    const filling = { x: 0, y: 0, width: 1000, height: 800 };
    expect(zoomCrop(image, filling, 1)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });
});

describe('letterbox', () => {
  it('centres a 16:10 capture inside a 16:9 frame with bars top and bottom', () => {
    const fit = letterbox(1280, 800, FRAME_WIDTH, FRAME_HEIGHT);
    expect(fit.width).toBe(1152);
    expect(fit.height).toBe(720);
    expect(fit.y).toBe(0);
    expect(fit.x).toBeCloseTo(64);
  });

  it('fills exactly when the aspect ratio already matches', () => {
    const fit = letterbox(1920, 1080, FRAME_WIDTH, FRAME_HEIGHT);
    expect(fit).toMatchObject({ width: 1280, height: 720, x: 0, y: 0 });
  });

  it('scales up a small capture instead of leaving it tiny', () => {
    expect(letterbox(640, 360, FRAME_WIDTH, FRAME_HEIGHT).scale).toBe(2);
  });

  it('preserves aspect ratio', () => {
    const fit = letterbox(3000, 1000, FRAME_WIDTH, FRAME_HEIGHT);
    expect(fit.width / fit.height).toBeCloseTo(3, 5);
  });
});

describe('wrapLines', () => {
  it('keeps a short description on one line', () => {
    expect(wrapLines('Click on branquias', 300, measure)).toEqual(['Click on branquias']);
  });

  it('wraps onto the next line when the current one overflows', () => {
    expect(wrapLines('aaa bbb ccc', 70, measure)).toEqual(['aaa bbb', 'ccc']);
  });

  it('truncates with an ellipsis at the line cap', () => {
    const lines = wrapLines('aaa bbb ccc ddd eee fff', 30, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('does not ellipsize when everything fits inside the cap', () => {
    expect(wrapLines('aaa bbb', 30, measure, 2).join(' ')).not.toContain('…');
  });

  it('returns nothing for blank text', () => {
    expect(wrapLines('   ', 300, measure)).toEqual([]);
  });
});

describe('tooltipPlacement', () => {
  const tooltip = { width: 400, height: 80 };

  it('sits below the target when there is room', () => {
    const at = tooltipPlacement({ x: 500, y: 200, width: 120, height: 40 }, tooltip);
    expect(at.below).toBe(true);
    expect(at.y).toBeGreaterThan(240);
  });

  it('flips above the target when below would overflow the frame', () => {
    const at = tooltipPlacement({ x: 500, y: 660, width: 120, height: 40 }, tooltip);
    expect(at.below).toBe(false);
    expect(at.y).toBeLessThan(660);
  });

  it('centres horizontally on the target', () => {
    const at = tooltipPlacement({ x: 440, y: 200, width: 400, height: 40 }, tooltip);
    expect(at.x).toBeCloseTo(440);
  });

  it('clamps to the left edge for a target near x=0', () => {
    const at = tooltipPlacement({ x: 0, y: 200, width: 40, height: 40 }, tooltip);
    expect(at.x).toBe(20);
  });

  it('clamps to the right edge for a target near the frame width', () => {
    const at = tooltipPlacement({ x: FRAME_WIDTH - 40, y: 200, width: 40, height: 40 }, tooltip);
    expect(at.x).toBe(FRAME_WIDTH - tooltip.width - 20);
  });

  it('keeps the tooltip inside the frame even when the target is offscreen low', () => {
    const at = tooltipPlacement({ x: 500, y: FRAME_HEIGHT, width: 0, height: 0 }, tooltip);
    expect(at.y).toBeGreaterThanOrEqual(20);
    expect(at.y + tooltip.height).toBeLessThanOrEqual(FRAME_HEIGHT - 20);
  });
});
