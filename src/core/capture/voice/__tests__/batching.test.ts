import { describe, expect, it } from 'vitest';
import { mergeGaps } from '../batching';
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
