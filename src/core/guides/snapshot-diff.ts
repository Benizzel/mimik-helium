import type { ScreenshotEdits } from '@/core/screenshot/types';

interface DiffStep {
  id: string;
  description: string;
  screenshotId?: string;
}

interface DiffScreenshot {
  id: string;
  edits?: ScreenshotEdits;
}

export interface SnapshotLike {
  title: string;
  stepIds: readonly string[];
  steps: readonly DiffStep[];
  screenshots: readonly DiffScreenshot[];
}

export interface SnapshotDiff {
  titleChanged: boolean;
  added: number;
  removed: number;
  reordered: boolean;
  edited: number;
  images: number;
}

function editsKey(snapshot: SnapshotLike, screenshotId: string | undefined): string {
  if (!screenshotId) return '{}';
  const row = snapshot.screenshots.find((r) => r.id === screenshotId);
  return JSON.stringify(row?.edits ?? {});
}

export function diffSnapshots(from: SnapshotLike, to: SnapshotLike): SnapshotDiff {
  const fromIds = new Set(from.stepIds);
  const toIds = new Set(to.stepIds);

  const added = to.stepIds.filter((id) => !fromIds.has(id)).length;
  const removed = from.stepIds.filter((id) => !toIds.has(id)).length;

  const survivorsBefore = from.stepIds.filter((id) => toIds.has(id));
  const survivorsAfter = to.stepIds.filter((id) => fromIds.has(id));
  const reordered = survivorsBefore.some((id, i) => survivorsAfter[i] !== id);

  const fromSteps = new Map(from.steps.map((s) => [s.id, s]));
  let edited = 0;
  let images = 0;
  for (const step of to.steps) {
    const before = fromSteps.get(step.id);
    if (!before) continue;
    if (before.description !== step.description) edited++;
    if (before.screenshotId !== step.screenshotId) images++;
    else if (editsKey(from, before.screenshotId) !== editsKey(to, step.screenshotId)) images++;
  }

  return { titleChanged: from.title !== to.title, added, removed, reordered, edited, images };
}
