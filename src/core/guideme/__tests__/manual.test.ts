import { describe, expect, it } from 'vitest';
import type { Screenshot, Step } from '@/core/guides/types';
import { stepRequiresManual } from '../manual';

const step = (overrides: Partial<Step> = {}): Step => ({
  id: 's1',
  guideId: 'g1',
  index: 0,
  description: 'Click link',
  action: 'click',
  url: 'https://example.com',
  timestamp: 0,
  elementMeta: { textContent: 'Link' } as Step['elementMeta'],
  ...overrides,
});

const shot = (edits: Screenshot['edits'], bounds?: Screenshot['bounds']): Screenshot =>
  ({
    id: 'sc1',
    stepId: 's1',
    blob: new Blob(),
    mimeType: 'image/webp',
    width: 100,
    height: 100,
    edits,
    bounds,
  }) as Screenshot;

describe('stepRequiresManual', () => {
  it('requires manual advance when the step has no element metadata', () => {
    expect(stepRequiresManual(step({ elementMeta: undefined }), null)).toBe(true);
  });

  it('stays automatic when the step has metadata and no screenshot', () => {
    expect(stepRequiresManual(step(), null)).toBe(false);
  });

  it('stays automatic for an untouched capture', () => {
    const target = { x: 0, y: 0, width: 10, height: 10, border: 'dashed' as const, color: '#4F46E5' };
    expect(stepRequiresManual(step(), shot({ target }, { x: 0, y: 0, width: 10, height: 10 }))).toBe(false);
  });

  it('requires manual advance once the edit flag is set', () => {
    expect(stepRequiresManual(step(), shot({ requiresManual: true }))).toBe(true);
  });

  it('treats a cleared target on a real capture as manual', () => {
    expect(stepRequiresManual(step(), shot({ target: null }, { x: 0, y: 0, width: 10, height: 10 }))).toBe(true);
  });

  it('does not flag a cleared target when the capture never had bounds', () => {
    expect(stepRequiresManual(step(), shot({ target: null }))).toBe(false);
  });
});
