import { describe, expect, it } from 'vitest';
import { buildStepWindows } from '../step-windows';

const EPOCH = 1_000_000;

describe('buildStepWindows', () => {
  it('returns nothing for no steps', () => {
    expect(buildStepWindows([], EPOCH)).toEqual([]);
  });

  it('gives the first step the interval from the start of the audio', () => {
    const [window] = buildStepWindows([{ stepId: 'a', timestamp: EPOCH + 4000 }], EPOCH);
    expect(window).toEqual({ stepId: 'a', from: 0, to: 4 });
  });

  it('gives each later step the interval since the previous step', () => {
    const windows = buildStepWindows(
      [
        { stepId: 'a', timestamp: EPOCH + 4000 },
        { stepId: 'b', timestamp: EPOCH + 9000 },
      ],
      EPOCH,
    );
    expect(windows).toEqual([
      { stepId: 'a', from: 0, to: 4 },
      { stepId: 'b', from: 4, to: 9 },
    ]);
  });

  it('sorts unordered marks before building windows', () => {
    const windows = buildStepWindows(
      [
        { stepId: 'b', timestamp: EPOCH + 9000 },
        { stepId: 'a', timestamp: EPOCH + 4000 },
      ],
      EPOCH,
    );
    expect(windows.map((w) => w.stepId)).toEqual(['a', 'b']);
  });

  it('clamps a step recorded before the audio epoch to a zero-width window at zero', () => {
    const [window] = buildStepWindows([{ stepId: 'a', timestamp: EPOCH - 5000 }], EPOCH);
    expect(window).toEqual({ stepId: 'a', from: 0, to: 0 });
  });

  it('never produces a window that ends before it starts', () => {
    const windows = buildStepWindows(
      [
        { stepId: 'a', timestamp: EPOCH + 4000 },
        { stepId: 'b', timestamp: EPOCH + 4000 },
        { stepId: 'c', timestamp: EPOCH + 1000 },
      ],
      EPOCH,
    );
    for (const window of windows) expect(window.to).toBeGreaterThanOrEqual(window.from);
  });

  it('leaves no gap between consecutive windows', () => {
    const windows = buildStepWindows(
      [
        { stepId: 'a', timestamp: EPOCH + 1000 },
        { stepId: 'b', timestamp: EPOCH + 2000 },
        { stepId: 'c', timestamp: EPOCH + 3000 },
      ],
      EPOCH,
    );
    for (let i = 1; i < windows.length; i += 1) expect(windows[i].from).toBe(windows[i - 1].to);
  });
});
