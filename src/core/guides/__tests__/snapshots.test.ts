import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { broadcasts } = vi.hoisted(() => {
  const broadcasts: unknown[] = [];
  globalThis.BroadcastChannel = class BroadcastChannel {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage(message: unknown) {
      broadcasts.push(message);
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
    onmessage = null;
    onmessageerror = null;
    dispatchEvent() {
      return true;
    }
  } as unknown as typeof BroadcastChannel;
  return { broadcasts };
});

import { db } from '../db';
import {
  createSnapshot,
  deleteStep,
  getGuide,
  getSnapshots,
  permanentlyDeleteGuide,
  reorderSteps,
  revertToSnapshot,
  softDeleteGuide,
  toggleStar,
  updateGuideTitle,
  updateStepDescription,
} from '../service';
import type { Guide, Screenshot, Step } from '../types';

function makeStep(overrides: Partial<Step> & { id: string; guideId: string }): Step {
  return {
    index: 0,
    description: 'Test step',
    action: 'click',
    url: 'https://example.com',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeScreenshot(overrides: Partial<Screenshot> & { id: string; stepId: string }): Screenshot {
  return {
    blob: new Blob(['img'], { type: 'image/png' }),
    mimeType: 'image/png',
    width: 800,
    height: 600,
    ...overrides,
  };
}

async function seedGuide(id: string, extras?: Partial<Guide>): Promise<Guide> {
  const guide: Guide = {
    id,
    title: 'Test Guide',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stepIds: [],
    starred: false,
    deletedAt: null,
    ...extras,
  };
  await db.guides.add(guide);
  return guide;
}

afterEach(async () => {
  await db.guides.clear();
  await db.steps.clear();
  await db.screenshots.clear();
  await db.snapshots.clear();
});

describe('createSnapshot', () => {
  it('stores the guide, steps and screenshot rows without blobs', async () => {
    await seedGuide('g1', { stepIds: ['s1'], title: 'Original' });
    await db.steps.add(makeStep({ id: 's1', guideId: 'g1', screenshotId: 'sc1' }));
    await db.screenshots.add(makeScreenshot({ id: 'sc1', stepId: 's1' }));

    const snapshot = await createSnapshot('g1');

    expect(snapshot).not.toBeNull();
    expect(snapshot?.title).toBe('Original');
    expect(snapshot?.stepIds).toEqual(['s1']);
    expect(snapshot?.steps).toHaveLength(1);
    expect(snapshot?.screenshots).toHaveLength(1);
    expect(snapshot?.screenshots[0]).not.toHaveProperty('blob');
    expect(snapshot?.contentHash).toBeTypeOf('string');
  });

  it('returns null for a guide that does not exist', async () => {
    expect(await createSnapshot('missing')).toBeNull();
  });

  it('orders steps by index, not insertion order', async () => {
    await seedGuide('g1', { stepIds: ['s2', 's1'] });
    await db.steps.add(makeStep({ id: 's2', guideId: 'g1', index: 1, description: 'Second' }));
    await db.steps.add(makeStep({ id: 's1', guideId: 'g1', index: 0, description: 'First' }));

    const snapshot = await createSnapshot('g1');

    expect(snapshot?.steps.map((s) => s.description)).toEqual(['First', 'Second']);
    expect(snapshot?.stepIds).toEqual(['s1', 's2']);
  });

  it('gives unchanged content the same hash and changed content a different one', async () => {
    await seedGuide('g1', { stepIds: ['s1'] });
    await db.steps.add(makeStep({ id: 's1', guideId: 'g1', description: 'Before' }));

    const first = await createSnapshot('g1');
    const unchanged = await createSnapshot('g1');
    expect(unchanged?.contentHash).toBe(first?.contentHash);

    await updateStepDescription('s1', 'After');
    const changed = await createSnapshot('g1');
    expect(changed?.contentHash).not.toBe(first?.contentHash);
  });

  it('keeps createdAt strictly increasing within a guide', async () => {
    await seedGuide('g1', { stepIds: [] });

    const a = await createSnapshot('g1');
    const b = await createSnapshot('g1');
    const c = await createSnapshot('g1');

    expect(b!.createdAt).toBeGreaterThan(a!.createdAt);
    expect(c!.createdAt).toBeGreaterThan(b!.createdAt);
    expect((await getSnapshots('g1')).map((s) => s.id)).toEqual([c!.id, b!.id, a!.id]);
  });
});

describe('getSnapshots', () => {
  it('returns snapshots for the guide, newest first', async () => {
    await seedGuide('g1', { stepIds: [] });
    await db.snapshots.bulkAdd([
      {
        id: 'n1',
        guideId: 'g1',
        createdAt: 100,
        contentHash: 'a',
        title: 'A',
        stepIds: [],
        steps: [],
        screenshots: [],
      },
      {
        id: 'n2',
        guideId: 'g1',
        createdAt: 300,
        contentHash: 'b',
        title: 'B',
        stepIds: [],
        steps: [],
        screenshots: [],
      },
      {
        id: 'n3',
        guideId: 'g2',
        createdAt: 200,
        contentHash: 'c',
        title: 'C',
        stepIds: [],
        steps: [],
        screenshots: [],
      },
    ]);

    const list = await getSnapshots('g1');

    expect(list.map((s) => s.id)).toEqual(['n2', 'n1']);
  });
});

describe('revertToSnapshot', () => {
  it('restores title, step order and step content', async () => {
    await seedGuide('g1', { stepIds: ['s1', 's2'], title: 'Original' });
    await db.steps.bulkAdd([
      makeStep({ id: 's1', guideId: 'g1', index: 0, description: 'First' }),
      makeStep({ id: 's2', guideId: 'g1', index: 1, description: 'Second' }),
    ]);
    const snapshot = await createSnapshot('g1');

    await updateGuideTitle('g1', 'Changed');
    await updateStepDescription('s1', 'Edited');
    await deleteStep('g1', 's2');

    await revertToSnapshot(snapshot!.id);

    const restored = await getGuide('g1');
    expect(restored?.guide.title).toBe('Original');
    expect(restored?.guide.stepIds).toEqual(['s1', 's2']);
    expect(restored?.steps.map((s) => s.description)).toEqual(['First', 'Second']);
  });

  it('restores step order after a reorder', async () => {
    await seedGuide('g1', { stepIds: ['s3', 's1', 's2'] });
    await db.steps.bulkAdd([
      makeStep({ id: 's1', guideId: 'g1', index: 1, description: 'Middle' }),
      makeStep({ id: 's2', guideId: 'g1', index: 2, description: 'Last' }),
      makeStep({ id: 's3', guideId: 'g1', index: 0, description: 'First' }),
    ]);
    const snapshot = await createSnapshot('g1');

    await reorderSteps('g1', ['s1', 's2', 's3']);

    await revertToSnapshot(snapshot!.id);

    const restored = await getGuide('g1');
    expect(restored?.steps.map((s) => s.description)).toEqual(['First', 'Middle', 'Last']);
    expect(restored?.guide.stepIds).toEqual(['s3', 's1', 's2']);
  });

  it('removes steps added after the snapshot was taken', async () => {
    await seedGuide('g1', { stepIds: ['s1'], title: 'Original' });
    await db.steps.add(makeStep({ id: 's1', guideId: 'g1', index: 0, description: 'First' }));
    const snapshot = await createSnapshot('g1');

    await db.steps.add(makeStep({ id: 's2', guideId: 'g1', index: 1, description: 'Added later' }));
    await db.guides.update('g1', { stepIds: ['s1', 's2'] });

    await revertToSnapshot(snapshot!.id);

    const restored = await getGuide('g1');
    expect(restored?.guide.stepIds).toEqual(['s1']);
    expect(restored?.steps.map((s) => s.description)).toEqual(['First']);
    expect(await db.steps.get('s2')).toBeUndefined();
  });

  it('snapshots the current state before restoring, so restore is undoable', async () => {
    await seedGuide('g1', { stepIds: [], title: 'Original' });
    const first = await createSnapshot('g1');
    await updateGuideTitle('g1', 'Changed');

    const undo = await revertToSnapshot(first!.id);

    const list = await getSnapshots('g1');
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('Changed');
    expect(undo?.id).toBe(list[0].id);
    expect(undo?.title).toBe('Changed');

    await revertToSnapshot(undo!.id);
    expect((await db.guides.get('g1'))?.title).toBe('Changed');
  });

  it('does not un-star or un-trash the guide', async () => {
    await seedGuide('g1', { stepIds: [], starred: false, deletedAt: null });
    const snapshot = await createSnapshot('g1');
    await toggleStar('g1');
    await softDeleteGuide('g1');

    await revertToSnapshot(snapshot!.id);

    const guide = await db.guides.get('g1');
    expect(guide?.starred).toBe(true);
    expect(guide?.deletedAt).not.toBeNull();
  });

  it('restores screenshot metadata onto the live blob and bumps updatedAt', async () => {
    await seedGuide('g1', { stepIds: ['s1'], updatedAt: 1000 });
    await db.steps.add(makeStep({ id: 's1', guideId: 'g1', screenshotId: 'sc1' }));
    await db.screenshots.add(
      makeScreenshot({
        id: 'sc1',
        stepId: 's1',
        width: 800,
        edits: {
          alt: 'original caption',
          annotations: [{ id: 'a1', type: 'redact', x: 1, y: 2, w: 3, h: 4, style: 'blur' }],
        },
      }),
    );
    const snapshot = await createSnapshot('g1');

    await db.screenshots.update('sc1', {
      width: 1234,
      edits: { alt: 'edited caption', annotations: [] },
      blob: new Blob(['edited'], { type: 'image/png' }),
    });

    const undo = await revertToSnapshot(snapshot!.id);

    expect(undo).not.toBeNull();
    const restored = await db.screenshots.get('sc1');
    expect(restored?.width).toBe(800);
    expect(restored?.edits).toEqual({
      alt: 'original caption',
      annotations: [{ id: 'a1', type: 'redact', x: 1, y: 2, w: 3, h: 4, style: 'blur' }],
    });
    expect(await restored?.blob.text()).toBe('edited');
    expect((await db.guides.get('g1'))?.updatedAt).toBeGreaterThan(1000);
  });

  it('is a no-op for an unknown snapshot id', async () => {
    await seedGuide('g1', { stepIds: [], title: 'Original' });
    broadcasts.length = 0;
    expect(await revertToSnapshot('missing')).toBeNull();
    expect((await db.guides.get('g1'))?.title).toBe('Original');
    expect(broadcasts).toEqual([]);
  });

  it('writes nothing and returns null when the guide no longer exists', async () => {
    await seedGuide('g1', { stepIds: ['s1'], title: 'Original' });
    await db.steps.add(makeStep({ id: 's1', guideId: 'g1', screenshotId: 'sc1' }));
    await db.screenshots.add(makeScreenshot({ id: 'sc1', stepId: 's1' }));
    const snapshot = await createSnapshot('g1');

    await permanentlyDeleteGuide('g1');
    broadcasts.length = 0;

    expect(await revertToSnapshot(snapshot!.id)).toBeNull();
    expect(broadcasts).toEqual([]);
    expect(await db.steps.count()).toBe(0);
    expect(await db.screenshots.count()).toBe(0);
    expect(await db.guides.count()).toBe(0);
    expect(await getSnapshots('g1')).toHaveLength(1);
  });
});
