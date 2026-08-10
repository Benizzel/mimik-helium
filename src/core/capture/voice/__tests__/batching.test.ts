import { describe, expect, it } from 'vitest';
import { buildBatches, MAX_BATCH_S, mergeGaps } from '../batching';
import { absoluteSeconds, type SpeechSegment } from '../types';

const seg = (start: number, end: number): SpeechSegment => ({
  start: absoluteSeconds(start),
  end: absoluteSeconds(end),
});

describe('mergeGaps', () => {
  it('merges segments separated by a gap at or under the threshold', () => {
    expect(mergeGaps([seg(1, 2), seg(2.4, 3)])).toEqual([seg(1, 3)]);
  });

  it('keeps segments separated by a gap over the threshold', () => {
    expect(mergeGaps([seg(1, 2), seg(2.9, 3)])).toHaveLength(2);
  });

  it('sorts unordered input before merging', () => {
    expect(mergeGaps([seg(5, 6), seg(1, 2)])[0].start).toBe(1);
  });

  it('absorbs a segment fully contained in the previous one', () => {
    expect(mergeGaps([seg(1, 5), seg(2, 3)])).toEqual([seg(1, 5)]);
  });

  it('returns an empty array for no input', () => {
    expect(mergeGaps([])).toEqual([]);
  });
});

describe('buildBatches', () => {
  it('groups consecutive segments into one batch when they fit', () => {
    const { batches } = buildBatches([seg(0, 5), seg(6, 10)]);
    expect(batches).toHaveLength(1);
    expect(batches[0].segments).toHaveLength(2);
  });

  it('starts a new batch when the span would exceed the cap', () => {
    const { batches } = buildBatches([seg(0, 10), seg(11, 20), seg(21, 40)]);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(b.end - b.start).toBeLessThanOrEqual(MAX_BATCH_S);
  });

  it('never splits an individual segment', () => {
    const input = [seg(0, 4), seg(5, 9)];
    for (const b of buildBatches(input).batches) {
      for (const s of b.segments) expect(input).toContainEqual(s);
    }
  });

  it('drops batches with less than one second of speech and counts them', () => {
    const { batches, dropped } = buildBatches([seg(0, 0.4)]);
    expect(batches).toEqual([]);
    expect(dropped).toBe(1);
  });

  it('reports zero dropped when everything qualifies', () => {
    expect(buildBatches([seg(0, 5)]).dropped).toBe(0);
  });
});
