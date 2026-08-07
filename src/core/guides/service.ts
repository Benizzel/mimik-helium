import { i18n } from '#imports';
import type { ScreenshotEdits } from '@/core/screenshot/types';
import { db } from './db';
import { hashPayload } from './snapshot-hash';
import type { Guide, Screenshot, Snapshot, Step } from './types';

export type GuideChangeEvent = { type: 'starred'; id: string; starred: boolean } | { type: 'mutated' };

const guidesChannel = new BroadcastChannel('mimik-guides');

export function onGuidesChanged(callback: (event: GuideChangeEvent) => void): () => void {
  const handler = (e: MessageEvent<GuideChangeEvent>) => callback(e.data);
  guidesChannel.addEventListener('message', handler);
  return () => guidesChannel.removeEventListener('message', handler);
}

function notifyGuidesChanged(event: GuideChangeEvent) {
  guidesChannel.postMessage(event);
}

export async function createGuide(guideId: string): Promise<Guide> {
  const guide: Guide = {
    id: guideId,
    title: i18n.t('fullview.untitledGuide'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stepIds: [],
    starred: false,
    deletedAt: null,
  };
  await db.guides.add(guide);
  return guide;
}

export async function getGuide(
  id: string,
): Promise<{ guide: Guide; steps: Step[]; screenshots: Map<string, Screenshot> } | null> {
  const guide = await db.guides.get(id);
  if (!guide) return null;
  const steps = await db.steps.where('guideId').equals(id).sortBy('index');
  const screenshotIds = steps.map((s) => s.screenshotId).filter(Boolean) as string[];
  const screenshotRows = await db.screenshots.where('id').anyOf(screenshotIds).toArray();
  const screenshots = new Map(screenshotRows.map((s) => [s.stepId, s]));
  return { guide, steps, screenshots };
}

export async function getGuides(): Promise<Guide[]> {
  return db.guides
    .orderBy('updatedAt')
    .reverse()
    .filter((g) => g.deletedAt == null)
    .toArray();
}

export async function getStarredGuides(): Promise<Guide[]> {
  return db.guides
    .orderBy('updatedAt')
    .reverse()
    .filter((g) => g.starred === true && g.deletedAt == null)
    .toArray();
}

export async function getTrashedGuides(): Promise<Guide[]> {
  return db.guides
    .orderBy('updatedAt')
    .reverse()
    .filter((g) => g.deletedAt != null)
    .toArray();
}

export async function updateGuideTitle(id: string, title: string): Promise<void> {
  await db.guides.update(id, { title, updatedAt: Date.now() });
  notifyGuidesChanged({ type: 'mutated' });
}

export async function updateGuideDescription(id: string, description: string): Promise<void> {
  await db.guides.update(id, { description, updatedAt: Date.now() });
  notifyGuidesChanged({ type: 'mutated' });
}

export async function addStepToGuide(guideId: string, stepId: string): Promise<void> {
  await db.transaction('rw', db.guides, async () => {
    const guide = await db.guides.get(guideId);
    if (guide) {
      await db.guides.update(guideId, {
        stepIds: [...guide.stepIds, stepId],
        updatedAt: Date.now(),
      });
    }
  });
}

export async function toggleStar(id: string): Promise<boolean> {
  const guide = await db.guides.get(id);
  if (!guide) return false;
  const starred = !guide.starred;
  await db.guides.update(id, { starred });
  notifyGuidesChanged({ type: 'starred', id, starred });
  return starred;
}

export async function softDeleteGuide(id: string): Promise<void> {
  await db.guides.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  notifyGuidesChanged({ type: 'mutated' });
}

export async function restoreGuide(id: string): Promise<void> {
  await db.guides.update(id, { deletedAt: null, updatedAt: Date.now() });
  notifyGuidesChanged({ type: 'mutated' });
}

export async function permanentlyDeleteGuide(id: string): Promise<void> {
  const steps = await db.steps.where('guideId').equals(id).toArray();
  const snapshots = await db.snapshots.where('guideId').equals(id).toArray();
  const stepIds = new Set(steps.map((s) => s.id));
  for (const snapshot of snapshots) {
    for (const step of snapshot.steps) stepIds.add(step.id);
  }
  await db.screenshots
    .where('stepId')
    .anyOf([...stepIds])
    .delete();
  await db.snapshots.where('guideId').equals(id).delete();
  await db.steps.where('guideId').equals(id).delete();
  await db.guides.delete(id);
  notifyGuidesChanged({ type: 'mutated' });
}

export async function reorderSteps(guideId: string, orderedStepIds: string[]): Promise<void> {
  await db.transaction('rw', db.steps, db.guides, async () => {
    for (let i = 0; i < orderedStepIds.length; i++) {
      await db.steps.update(orderedStepIds[i], { index: i });
    }
    await db.guides.update(guideId, { stepIds: orderedStepIds, updatedAt: Date.now() });
  });
}

export async function createStep(step: Step): Promise<void> {
  await db.steps.add(step);
}

export async function updateStepDescription(stepId: string, description: string): Promise<void> {
  await db.steps.update(stepId, { description });
}

export async function clearStepAiPending(stepId: string, description?: string): Promise<void> {
  await db.steps.update(stepId, description ? { description, aiPending: false } : { aiPending: false });
}

export async function getStepsForGuide(guideId: string): Promise<Step[]> {
  return db.steps.where('guideId').equals(guideId).sortBy('index');
}

export async function deleteStep(guideId: string, stepId: string): Promise<void> {
  const snapshotCount = await db.snapshots.where('guideId').equals(guideId).count();
  if (snapshotCount === 0) {
    const step = await db.steps.get(stepId);
    if (step?.screenshotId) await db.screenshots.delete(step.screenshotId);
  }
  await db.steps.delete(stepId);
  const guide = await db.guides.get(guideId);
  if (guide) {
    const newStepIds = guide.stepIds.filter((id) => id !== stepId);
    await db.guides.update(guideId, { stepIds: newStepIds, updatedAt: Date.now() });
    const remaining = await db.steps.where('guideId').equals(guideId).sortBy('index');
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].index !== i) {
        await db.steps.update(remaining[i].id, { index: i });
      }
    }
  }
}

export async function getGuideDomain(guideId: string): Promise<string> {
  const { getMostCommonDomain } = await import('@/lib/utils');
  const steps = await db.steps.where('guideId').equals(guideId).sortBy('index');
  return getMostCommonDomain(steps);
}

export async function saveScreenshot(screenshot: Screenshot): Promise<void> {
  await db.screenshots.add(screenshot);
}

export async function replaceScreenshot(
  stepId: string,
  blob: Blob,
  dimensions: { width: number; height: number },
  edits?: ScreenshotEdits,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.transaction('rw', db.screenshots, db.steps, async () => {
    await db.screenshots.add({
      id,
      stepId,
      blob,
      mimeType: blob.type,
      width: dimensions.width,
      height: dimensions.height,
      ...(edits ? { edits } : {}),
    });
    await db.steps.update(stepId, { screenshotId: id });
  });
  return id;
}

export async function updateScreenshotEdits(screenshotId: string, edits: ScreenshotEdits): Promise<void> {
  await db.screenshots.update(screenshotId, { edits });
}

export async function deleteScreenshot(stepId: string): Promise<void> {
  await db.steps.update(stepId, { screenshotId: undefined });
}

export async function getScreenshotsForSteps(stepIds: string[]): Promise<Map<string, Screenshot>> {
  const rows = await db.screenshots.where('id').anyOf(stepIds).toArray();
  return new Map(rows.map((s) => [s.stepId, s]));
}

export async function getFirstScreenshot(guideId: string): Promise<Screenshot | null> {
  const steps = await db.steps.where('guideId').equals(guideId).sortBy('index');
  for (const step of steps) {
    if (step.screenshotId) {
      const screenshot = await db.screenshots.get(step.screenshotId);
      if (screenshot) return screenshot;
    }
  }
  return null;
}

export async function createSnapshot(guideId: string): Promise<Snapshot | null> {
  return db.transaction('rw', db.guides, db.steps, db.screenshots, db.snapshots, async () => {
    const guide = await db.guides.get(guideId);
    if (!guide) return null;
    const steps = await db.steps.where('guideId').equals(guideId).sortBy('index');
    const stepIds = steps.map((s) => s.id);
    const rows = await db.screenshots.where('stepId').anyOf(stepIds).toArray();
    const screenshots = rows.map(({ blob, ...rest }) => rest);
    const payload = { title: guide.title, stepIds, steps, screenshots };
    const latest = await db.snapshots
      .where('[guideId+createdAt]')
      .between([guideId, -Infinity], [guideId, Infinity])
      .last();
    const now = Date.now();
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      guideId,
      createdAt: latest && latest.createdAt >= now ? latest.createdAt + 1 : now,
      contentHash: hashPayload(payload),
      ...payload,
    };
    await db.snapshots.add(snapshot);
    return snapshot;
  });
}

export async function getSnapshots(guideId: string): Promise<Snapshot[]> {
  return db.snapshots
    .where('[guideId+createdAt]')
    .between([guideId, -Infinity], [guideId, Infinity])
    .reverse()
    .toArray();
}

export async function renameSnapshot(snapshotId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  await db.snapshots.update(snapshotId, { name: trimmed === '' ? undefined : trimmed });
}

export async function revertToSnapshot(snapshotId: string): Promise<Snapshot | null> {
  const undo = await db.transaction('rw', db.guides, db.steps, db.screenshots, db.snapshots, async () => {
    const snapshot = await db.snapshots.get(snapshotId);
    if (!snapshot) return null;
    const previous = await createSnapshot(snapshot.guideId);
    if (!previous) return null;
    const existing = await db.steps.where('guideId').equals(snapshot.guideId).toArray();
    const keep = new Set(snapshot.steps.map((s) => s.id));
    await db.steps.bulkDelete(existing.filter((s) => !keep.has(s.id)).map((s) => s.id));
    await db.steps.bulkPut(snapshot.steps);
    const live = await db.screenshots.bulkGet(snapshot.screenshots.map((r) => r.id));
    const merged = snapshot.screenshots
      .map((row, i) => (live[i] ? { ...row, blob: live[i]!.blob } : null))
      .filter((r): r is Screenshot => r !== null);
    if (merged.length > 0) await db.screenshots.bulkPut(merged);
    await db.guides.update(snapshot.guideId, {
      title: snapshot.title,
      stepIds: snapshot.stepIds,
      updatedAt: Date.now(),
    });
    return previous;
  });
  if (undo) notifyGuidesChanged({ type: 'mutated' });
  return undo;
}
