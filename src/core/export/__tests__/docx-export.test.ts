// @vitest-environment jsdom
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportGuideAsDOCX, fitDocxImageSize } from '@/core/export/docx-export';
import type { Guide, Screenshot, Step } from '@/core/guides/types';

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

function makeScreenshot(stepId: string, content = 'image-data'): Screenshot {
  return {
    id: `ss-${stepId}`,
    stepId,
    blob: new Blob([content], { type: 'image/png' }),
    mimeType: 'image/png',
    width: 800,
    height: 600,
  };
}

async function unzipDocx(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return unzipSync(bytes);
}

async function readDocumentXml(blob: Blob): Promise<string> {
  const files = await unzipDocx(blob);
  return strFromU8(files['word/document.xml']);
}

describe('exportGuideAsDOCX', () => {
  it('creates a non-empty docx blob with guide metadata and step content', async () => {
    const guide = makeGuide({ title: 'My Guide' });
    const steps = [makeStep()];
    const blob = await exportGuideAsDOCX(guide, steps, new Map());

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const xml = await readDocumentXml(blob);
    expect(xml).toContain('My Guide');
    expect(xml).toContain('EXPORT.STEPS');
    expect(xml).toContain('>01</w:t>');
    expect(xml).toContain('EXPORT.CREATED');
    expect(xml).toContain('EXPORT.SOURCE');
    expect(xml).toContain('example.com');
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('Click the button');
  });

  it('handles guides with no steps', async () => {
    const blob = await exportGuideAsDOCX(makeGuide(), [], new Map());
    const xml = await readDocumentXml(blob);

    expect(xml).toContain('Test Guide');
    expect(xml).toContain('EXPORT.STEPS');
    expect(xml).toContain('>00</w:t>');
    expect(xml).not.toContain('Click the button');
  });

  it('embeds screenshot media when steps have screenshots', async () => {
    const step = makeStep();
    const screenshots = new Map<string, Screenshot>([[step.id, makeScreenshot(step.id)]]);

    const blob = await exportGuideAsDOCX(makeGuide(), [step], screenshots);
    const files = await unzipDocx(blob);

    expect(Object.keys(files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  it('does not add media files when screenshots are missing', async () => {
    const blob = await exportGuideAsDOCX(makeGuide(), [makeStep()], new Map());
    const files = await unzipDocx(blob);

    expect(Object.keys(files).some((name) => name.startsWith('word/media/'))).toBe(false);
  });
});

describe('fitDocxImageSize', () => {
  it('preserves aspect ratio and never upscales', () => {
    expect(fitDocxImageSize(400, 300)).toEqual({ width: 400, height: 300 });
  });

  it('clamps wide screenshots to max width', () => {
    const { width, height } = fitDocxImageSize(1040, 600);
    expect(width).toBe(520);
    expect(height).toBe(300);
  });

  it('clamps tall screenshots so they fit one page', () => {
    const { width, height } = fitDocxImageSize(400, 2000);
    expect(height).toBe(640);
    expect(width).toBe(128);
  });

  it('accounts for left indent when clamping width', () => {
    const { width, height } = fitDocxImageSize(800, 600, 900);
    expect(width).toBe(475);
    expect(height).toBe(356);
  });
});
