import { describe, expect, it } from 'vitest';
import { needsRaster, segments, wrap } from '@/core/export/pdf-text';

describe('needsRaster', () => {
  it('leaves latin text on the vector path', () => {
    expect(needsRaster('Click the Submit button')).toBe(false);
  });

  it('leaves accented latin on the vector path', () => {
    expect(needsRaster('Créer un café — naïve')).toBe(false);
  });

  it('leaves winansi punctuation on the vector path', () => {
    expect(needsRaster('“quoted” • dash – ellipsis… €99 ™')).toBe(false);
  });

  it('rasterises chinese', () => {
    expect(needsRaster('点击开始录制')).toBe(true);
  });

  it('rasterises cyrillic, greek, japanese, korean, arabic and thai', () => {
    for (const text of ['Привет', 'Καλημέρα', 'こんにちは', '안녕하세요', 'مرحبا', 'สวัสดี']) {
      expect(needsRaster(text)).toBe(true);
    }
  });

  it('rasterises latin mixed with a single non-latin character', () => {
    expect(needsRaster('Open 设置 page')).toBe(true);
  });
});

describe('segments', () => {
  it('keeps latin words whole and splits cjk per character', () => {
    expect(segments('open 设置 now')).toEqual(['open', ' ', '设', '置', ' ', 'now']);
  });
});

describe('wrap', () => {
  const measure = (s: string) => s.length;

  it('breaks latin on spaces', () => {
    expect(wrap('aaa bbb ccc', 7, measure)).toEqual(['aaa bbb', 'ccc']);
  });

  it('breaks cjk between characters, since it has no spaces', () => {
    expect(wrap('点击开始录制', 3, measure)).toEqual(['点击开', '始录制']);
  });

  it('never returns an empty list', () => {
    expect(wrap('', 10, measure)).toEqual(['']);
  });

  it('keeps a word that cannot fit rather than looping forever', () => {
    expect(wrap('supercalifragilistic', 5, measure)).toEqual(['supercalifragilistic']);
  });
});
