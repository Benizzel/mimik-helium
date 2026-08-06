import { describe, expect, it } from 'vitest';
import type { ScreenshotEdits } from '@/core/screenshot/types';
import { diffSnapshots, type SnapshotLike } from '../snapshot-diff';
import type { Snapshot } from '../types';

type StepInput = SnapshotLike['steps'][number];
type ShotInput = SnapshotLike['screenshots'][number];

function step(id: string, description = `${id} description`, screenshotId?: string): StepInput {
  return screenshotId ? { id, description, screenshotId } : { id, description };
}

function shot(id: string, stepId: string, edits?: ScreenshotEdits): ShotInput & { stepId: string } {
  return edits ? { id, stepId, edits } : { id, stepId };
}

function like(steps: StepInput[], overrides: Partial<SnapshotLike> = {}): SnapshotLike {
  return { title: 'Guide', stepIds: steps.map((s) => s.id), steps, screenshots: [], ...overrides };
}

const empty = { titleChanged: false, added: 0, removed: 0, reordered: false, edited: 0, images: 0 };

describe('diffSnapshots', () => {
  it('reports nothing for identical content', () => {
    const a = like([step('s1'), step('s2', 'second', 'sc1')], { screenshots: [shot('sc1', 's2')] });
    const b = like([step('s1'), step('s2', 'second', 'sc1')], { screenshots: [shot('sc1', 's2')] });

    expect(diffSnapshots(a, b)).toEqual(empty);
  });

  it('reports a title change', () => {
    const a = like([step('s1')], { title: 'Before' });
    const b = like([step('s1')], { title: 'After' });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, titleChanged: true });
  });

  it('counts step ids present only in the newer side as added', () => {
    const a = like([step('s1')]);
    const b = like([step('s1'), step('s2'), step('s3')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, added: 2 });
  });

  it('counts step ids present only in the older side as removed', () => {
    const a = like([step('s1'), step('s2'), step('s3')]);
    const b = like([step('s2')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, removed: 2 });
  });

  it('compares step ids as sets, so a pure reorder adds and removes nothing', () => {
    const a = like([step('s1'), step('s2'), step('s3')]);
    const b = like([step('s3'), step('s2'), step('s1')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, reordered: true });
  });

  it('does not report a reorder for a pure append', () => {
    const a = like([step('s1'), step('s2')]);
    const b = like([step('s1'), step('s2'), step('s3')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, added: 1 });
  });

  it('does not report a reorder for an insert at the front', () => {
    const a = like([step('s1'), step('s2')]);
    const b = like([step('s3'), step('s1'), step('s2')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, added: 1 });
  });

  it('does not report a reorder for a pure delete', () => {
    const a = like([step('s1'), step('s2'), step('s3')]);
    const b = like([step('s1'), step('s3')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, removed: 1 });
  });

  it('does not report a reorder when a delete plus an add leaves survivors in order', () => {
    const a = like([step('s1'), step('s2'), step('s3')]);
    const b = like([step('s1'), step('s4'), step('s3'), step('s5')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, added: 2, removed: 1 });
  });

  it('reports a reorder when survivors of a delete change relative order', () => {
    const a = like([step('s1'), step('s2'), step('s3')]);
    const b = like([step('s3'), step('s1')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, removed: 1, reordered: true });
  });

  it('counts steps whose description changed as edited', () => {
    const a = like([step('s1', 'Old one'), step('s2', 'Old two'), step('s3', 'Same')]);
    const b = like([step('s1', 'New one'), step('s2', 'New two'), step('s3', 'Same')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, edited: 2 });
  });

  it('does not count a removed step as edited', () => {
    const a = like([step('s1', 'Kept'), step('s2', 'Gone')]);
    const b = like([step('s1', 'Kept')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, removed: 1 });
  });

  it('does not count an added step as edited', () => {
    const a = like([step('s1', 'Kept')]);
    const b = like([step('s1', 'Kept'), step('s2', 'Brand new')]);

    expect(diffSnapshots(a, b)).toEqual({ ...empty, added: 1 });
  });

  it('counts a repointed screenshot as an image change', () => {
    const a = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1')] });
    const b = like([step('s1', 'Same', 'sc2')], { screenshots: [shot('sc1', 's1'), shot('sc2', 's1')] });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, images: 1 });
  });

  it('counts a deleted screenshot as an image change', () => {
    const a = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1')] });
    const b = like([step('s1', 'Same')], { screenshots: [shot('sc1', 's1')] });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, images: 1 });
  });

  it('counts a newly attached screenshot as an image change', () => {
    const a = like([step('s1', 'Same')], { screenshots: [] });
    const b = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1')] });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, images: 1 });
  });

  it('counts changed edits on the same screenshot row as an image change', () => {
    const a = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1', { alt: 'before' })] });
    const b = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1', { alt: 'after' })] });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, images: 1 });
  });

  it('counts changed annotations as an image change', () => {
    const a = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1', { annotations: [] })] });
    const b = like([step('s1', 'Same', 'sc1')], {
      screenshots: [
        shot('sc1', 's1', { annotations: [{ id: 'a1', type: 'redact', x: 0, y: 0, w: 2, h: 2, style: 'blur' }] }),
      ],
    });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, images: 1 });
  });

  it('treats absent edits and empty edits as the same', () => {
    const a = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1')] });
    const b = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1', {})] });

    expect(diffSnapshots(a, b)).toEqual(empty);
  });

  it('resolves the screenshot through the step pointer, not by stepId', () => {
    const a = like([step('s1', 'Same', 'sc2')], {
      screenshots: [shot('sc1', 's1', { alt: 'stale row' }), shot('sc2', 's1', { alt: 'live row' })],
    });
    const b = like([step('s1', 'Same', 'sc2')], {
      screenshots: [shot('sc1', 's1', { alt: 'stale row changed' }), shot('sc2', 's1', { alt: 'live row' })],
    });

    expect(diffSnapshots(a, b)).toEqual(empty);
  });

  it('counts a step once when both its pointer and its edits changed', () => {
    const a = like([step('s1', 'Same', 'sc1')], { screenshots: [shot('sc1', 's1', { alt: 'one' })] });
    const b = like([step('s1', 'Same', 'sc2')], {
      screenshots: [shot('sc1', 's1', { alt: 'one' }), shot('sc2', 's1', { alt: 'two' })],
    });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, images: 1 });
  });

  it('ignores screenshots belonging to steps present on only one side', () => {
    const a = like([step('s1', 'Same'), step('s2', 'Gone', 'sc1')], { screenshots: [shot('sc1', 's2')] });
    const b = like([step('s1', 'Same'), step('s3', 'New', 'sc2')], { screenshots: [shot('sc2', 's3')] });

    expect(diffSnapshots(a, b)).toEqual({ ...empty, added: 1, removed: 1 });
  });

  it('reports every dimension at once', () => {
    const a = like([step('s1', 'One', 'sc1'), step('s2', 'Two'), step('s3', 'Three')], {
      title: 'Before',
      screenshots: [shot('sc1', 's1', { alt: 'a' })],
    });
    const b = like([step('s3', 'Three'), step('s1', 'One edited', 'sc1'), step('s4', 'Four')], {
      title: 'After',
      screenshots: [shot('sc1', 's1', { alt: 'b' })],
    });

    expect(diffSnapshots(a, b)).toEqual({
      titleChanged: true,
      added: 1,
      removed: 1,
      reordered: true,
      edited: 1,
      images: 1,
    });
  });

  it('accepts full Snapshot records on both sides', () => {
    const base: Snapshot = {
      id: 'n1',
      guideId: 'g1',
      createdAt: 1,
      contentHash: 'h1',
      title: 'Guide',
      stepIds: ['s1'],
      steps: [
        {
          id: 's1',
          guideId: 'g1',
          index: 0,
          description: 'Click it',
          action: 'click',
          url: 'https://example.com',
          timestamp: 1,
          screenshotId: 'sc1',
        },
      ],
      screenshots: [{ id: 'sc1', stepId: 's1', mimeType: 'image/png', width: 10, height: 10 }],
    };
    const next: Snapshot = { ...base, id: 'n2', title: 'Guide renamed' };

    expect(diffSnapshots(base, next)).toEqual({ ...empty, titleChanged: true });
  });
});
