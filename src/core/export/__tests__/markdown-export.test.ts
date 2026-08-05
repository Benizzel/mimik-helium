// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { exportGuideAsMarkdown } from '@/core/export/markdown-export';
import type { Guide, Screenshot, Step } from '@/core/guides/types';

vi.mock('@/core/screenshot/render', () => ({
  renderScreenshot: async (s: Screenshot) => s.blob,
}));

function makeGuide(overrides: Partial<Guide> = {}): Guide {
  return {
    id: 'guide-1',
    title: 'Test Guide',
    createdAt: new Date('2025-06-01T00:00:00Z').getTime(),
    updatedAt: new Date('2025-06-01T00:00:00Z').getTime(),
    stepIds: [],
    starred: false,
    deletedAt: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step-1',
    guideId: 'guide-1',
    index: 0,
    description: 'Click the button',
    action: 'click',
    url: 'https://example.com',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeScreenshot(stepId: string, content = 'img'): Screenshot {
  return {
    id: `ss-${stepId}`,
    stepId,
    blob: new Blob([content], { type: 'image/png' }),
    mimeType: 'image/png',
    width: 800,
    height: 600,
  };
}

describe('exportGuideAsMarkdown', () => {
  it('creates valid markdown with H1 title', async () => {
    const guide = makeGuide({ title: 'My Guide' });
    const steps = [makeStep()];
    const screenshots = new Map<string, Screenshot>();

    const md = await exportGuideAsMarkdown(guide, steps, screenshots);
    expect(md).toMatch(/^# My Guide\n/);
  });

  it('includes metadata line with step count and created date', async () => {
    const guide = makeGuide();
    const steps = [makeStep(), makeStep({ id: 'step-2', index: 1, description: 'Type text' })];
    const screenshots = new Map<string, Screenshot>();

    const md = await exportGuideAsMarkdown(guide, steps, screenshots);
    expect(md).toContain('export.stepsCount[2]');
    expect(md).toContain('export.createdLabel[');
  });

  it('includes step descriptions with padded step numbers', async () => {
    const guide = makeGuide();
    const steps = [
      makeStep({ index: 0, description: 'First action' }),
      makeStep({ id: 'step-2', index: 1, description: 'Second action' }),
    ];
    const screenshots = new Map<string, Screenshot>();

    const md = await exportGuideAsMarkdown(guide, steps, screenshots);
    expect(md).toContain('## export.stepLabel[01]: First action');
    expect(md).toContain('## export.stepLabel[02]: Second action');
  });

  it('includes source domain when steps have URLs', async () => {
    const guide = makeGuide();
    const steps = [makeStep({ url: 'https://www.example.com/page' })];
    const screenshots = new Map<string, Screenshot>();

    const md = await exportGuideAsMarkdown(guide, steps, screenshots);
    expect(md).toContain('export.sourceLabel[example.com]');
  });

  it('handles guide with no steps', async () => {
    const guide = makeGuide();
    const md = await exportGuideAsMarkdown(guide, [], new Map());

    expect(md).toContain('# Test Guide');
    expect(md).toContain('export.stepsCount[0]');
    expect(md).not.toContain('## export.stepLabel');
  });

  it('handles steps without screenshots', async () => {
    const guide = makeGuide();
    const steps = [makeStep()];
    const screenshots = new Map<string, Screenshot>();

    const md = await exportGuideAsMarkdown(guide, steps, screenshots);
    expect(md).toContain('## export.stepLabel[01]: Click the button');
    expect(md).not.toContain('![');
  });

  it('embeds screenshot as base64 data URL in markdown image', async () => {
    const guide = makeGuide();
    const step = makeStep();
    const steps = [step];
    const ss = makeScreenshot(step.id, 'pixel-data');
    const screenshots = new Map<string, Screenshot>([[step.id, ss]]);

    const md = await exportGuideAsMarkdown(guide, steps, screenshots);
    expect(md).toContain('![export.stepLabel[01]](data:image/png;base64,');
    const b64 = btoa('pixel-data');
    expect(md).toContain(b64);
  });
});
