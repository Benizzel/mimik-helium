// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotLike } from '@/core/guides/snapshot-diff';
import type { Screenshot, Snapshot, Step } from '@/core/guides/types';
import type { Annotation, ScreenshotEdits } from '@/core/screenshot/types';

const getSnapshots = vi.fn();

vi.mock('@/core/guides/service', () => ({
  getSnapshots: (...args: unknown[]) => getSnapshots(...args),
  renameSnapshot: vi.fn(),
  revertToSnapshot: vi.fn(),
}));

import VersionHistoryPanel from '../VersionHistoryPanel';

const box: Annotation = { id: 'a1', type: 'box', x: 0, y: 0, w: 10, h: 10, color: '#000000' };
const otherBox: Annotation = { id: 'a1', type: 'box', x: 4, y: 4, w: 10, h: 10, color: '#000000' };
const redact: Annotation = { id: 'r1', type: 'redact', x: 0, y: 0, w: 5, h: 5, style: 'blur' };
const otherRedact: Annotation = { id: 'r1', type: 'redact', x: 0, y: 0, w: 5, h: 5, style: 'solid' };
const viewportA = { x: 0, y: 0, width: 100, height: 50 };
const viewportB = { x: 5, y: 0, width: 90, height: 50 };

function step(id: string, description: string, screenshotId?: string, url = 'https://a.test'): Step {
  return {
    id,
    guideId: 'g1',
    index: 0,
    description,
    action: 'click',
    url,
    timestamp: 1,
    ...(screenshotId ? { screenshotId } : {}),
  };
}

function shot(id: string, stepId: string, edits?: ScreenshotEdits): Omit<Screenshot, 'blob'> {
  return { id, stepId, mimeType: 'image/png', width: 10, height: 10, ...(edits ? { edits } : {}) };
}

function older(overrides: Partial<Snapshot>): Snapshot {
  return {
    id: 'n1',
    guideId: 'g1',
    createdAt: 1_700_000_000_000,
    contentHash: 'h1',
    title: 'Guide',
    stepIds: [],
    steps: [],
    screenshots: [],
    ...overrides,
  };
}

function setup(snapshot: Snapshot, live: SnapshotLike) {
  getSnapshots.mockResolvedValue([snapshot]);
  return render(
    <VersionHistoryPanel
      guideId="g1"
      selectedId={null}
      refreshKey={0}
      live={live}
      onSelect={vi.fn()}
      onRestored={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VersionHistoryPanel change summary', () => {
  it('lists every cause once, in order, for a version that changed one of each', async () => {
    const snapshot = older({
      title: 'Before',
      stepIds: ['s1', 's3', 's4', 's5', 's6', 's7', 's8', 's9'],
      steps: [
        step('s1', 'Gone'),
        step('s3', 'Old three'),
        step('s4', 'Same', undefined, 'https://a.test/one'),
        step('s5', 'Same', 'sc5a'),
        step('s6', 'Same', 'sc6'),
        step('s7', 'Same', 'sc7'),
        step('s8', 'Same', 'sc8'),
        step('s9', 'Same', 'sc9'),
      ],
      screenshots: [
        shot('sc5a', 's5'),
        shot('sc6', 's6', { viewport: viewportA }),
        shot('sc7', 's7', { annotations: [box] }),
        shot('sc8', 's8', { annotations: [redact] }),
        shot('sc9', 's9', { alt: 'before' }),
      ],
    });
    const live: SnapshotLike = {
      title: 'After',
      stepIds: ['s2', 's4', 's3', 's5', 's6', 's7', 's8', 's9'],
      steps: [
        step('s2', 'New'),
        step('s4', 'Same', undefined, 'https://a.test/two'),
        step('s3', 'New three'),
        step('s5', 'Same', 'sc5b'),
        step('s6', 'Same', 'sc6'),
        step('s7', 'Same', 'sc7'),
        step('s8', 'Same', 'sc8'),
        step('s9', 'Same', 'sc9'),
      ],
      screenshots: [
        shot('sc5b', 's5'),
        shot('sc6', 's6', { viewport: viewportB }),
        shot('sc7', 's7', { annotations: [otherBox] }),
        shot('sc8', 's8', { annotations: [otherRedact] }),
        shot('sc9', 's9', { alt: 'after' }),
      ],
    };

    setup(snapshot, live);

    const expected = [
      'history.changeTitle',
      'history.changeStepAdded[1]',
      'history.changeStepRemoved[1]',
      'history.changeStepEdited[1]',
      'history.changeLink[1]',
      'history.changeImageReplaced[1]',
      'history.changeImageCropped[1]',
      'history.changeImageAnnotated[1]',
      'history.changeImageBlurred[1]',
      'history.changeAltText',
      'history.changeStepReordered',
    ].join(' · ');

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });

  it('uses the plural key for every counted cause above one', async () => {
    const snapshot = older({
      title: 'Before',
      stepIds: ['x1', 'x2', 'e1', 'e2', 'u1', 'u2', 'p1', 'p2'],
      steps: [
        step('x1', 'Gone one'),
        step('x2', 'Gone two'),
        step('e1', 'Old e1'),
        step('e2', 'Old e2'),
        step('u1', 'Same', undefined, 'https://a.test/one'),
        step('u2', 'Same', undefined, 'https://a.test/two'),
        step('p1', 'Same', 'p1a'),
        step('p2', 'Same', 'p2a'),
      ],
      screenshots: [
        shot('p1a', 'p1', { viewport: viewportA, annotations: [box, redact], alt: 'before' }),
        shot('p2a', 'p2', { viewport: viewportA, annotations: [box, redact], alt: 'before' }),
      ],
    });
    const live: SnapshotLike = {
      title: 'After',
      stepIds: ['y1', 'y2', 'e2', 'e1', 'u1', 'u2', 'p1', 'p2'],
      steps: [
        step('y1', 'New one'),
        step('y2', 'New two'),
        step('e2', 'New e2'),
        step('e1', 'New e1'),
        step('u1', 'Same', undefined, 'https://b.test/one'),
        step('u2', 'Same', undefined, 'https://b.test/two'),
        step('p1', 'Same', 'p1b'),
        step('p2', 'Same', 'p2b'),
      ],
      screenshots: [
        shot('p1b', 'p1', { viewport: viewportB, annotations: [otherBox, otherRedact], alt: 'after' }),
        shot('p2b', 'p2', { viewport: viewportB, annotations: [otherBox, otherRedact], alt: 'after' }),
      ],
    };

    setup(snapshot, live);

    const expected = [
      'history.changeTitle',
      'history.changeStepsAdded[2]',
      'history.changeStepsRemoved[2]',
      'history.changeStepsEdited[2]',
      'history.changeLinks[2]',
      'history.changeImagesReplaced[2]',
      'history.changeImagesCropped[2]',
      'history.changeImagesAnnotated[2]',
      'history.changeImagesBlurred[2]',
      'history.changeAltText',
      'history.changeStepReordered',
    ].join(' · ');

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });

  it('renders no summary when nothing changed', async () => {
    const steps = [step('s1', 'One', 'sc1')];
    const screenshots = [shot('sc1', 's1', { annotations: [box, redact], alt: 'same' })];
    const snapshot = older({ stepIds: ['s1'], steps, screenshots });
    const live: SnapshotLike = { title: 'Guide', stepIds: ['s1'], steps, screenshots };

    setup(snapshot, live);

    await waitFor(() => {
      expect(screen.getByText('history.current')).toBeTruthy();
    });
    expect(screen.queryByText(/history\.change/)).toBeNull();
  });
});
