import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  DEFAULT_EXPORT_OPTIONS,
  IMAGE_SCALE_FACTORS,
  loadExportOptions,
  normaliseExportOptions,
  saveExportOptions,
} from '@/core/export/options';

describe('normaliseExportOptions', () => {
  it('returns the defaults for anything that is not an options object', () => {
    for (const value of [undefined, null, 'nope', 42, []]) {
      expect(normaliseExportOptions(value)).toEqual(DEFAULT_EXPORT_OPTIONS);
    }
  });

  it('keeps valid values and replaces invalid ones field by field', () => {
    const result = normaliseExportOptions({
      cover: false,
      screenshots: 'yes',
      stepUrls: null,
      imageScale: 'small',
    });
    expect(result).toEqual({
      cover: false,
      screenshots: DEFAULT_EXPORT_OPTIONS.screenshots,
      stepUrls: DEFAULT_EXPORT_OPTIONS.stepUrls,
      imageScale: 'small',
    });
  });

  it('rejects an unknown image scale so no exporter can derive a NaN width', () => {
    const result = normaliseExportOptions({ imageScale: 'enormous' });
    expect(result.imageScale).toBe(DEFAULT_EXPORT_OPTIONS.imageScale);
    expect(IMAGE_SCALE_FACTORS[result.imageScale]).toBeGreaterThan(0);
  });
});

describe('export option persistence', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('defaults when nothing has been saved', async () => {
    expect(await loadExportOptions()).toEqual(DEFAULT_EXPORT_OPTIONS);
  });

  it('round-trips a saved selection', async () => {
    const options = { ...DEFAULT_EXPORT_OPTIONS, cover: false, imageScale: 'large' as const };
    await saveExportOptions(options);
    expect(await loadExportOptions()).toEqual(options);
  });

  it('survives a corrupted stored value', async () => {
    await fakeBrowser.storage.local.set({ exportOptions: 'corrupted' });
    expect(await loadExportOptions()).toEqual(DEFAULT_EXPORT_OPTIONS);
  });
});
