import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.BroadcastChannel = class BroadcastChannel {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
    onmessage = null;
    onmessageerror = null;
    dispatchEvent() {
      return true;
    }
  } as unknown as typeof BroadcastChannel;
});

import { db } from '../db';
import { createSnapshot, getSnapshots, updateStepDescription } from '../service';
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
