import { describe, expect, it } from 'vitest';
import { AI_LANGUAGES, getLanguageSuffix } from '../prompts';

describe('getLanguageSuffix', () => {
  it('returns empty string for English', () => {
    expect(getLanguageSuffix('en')).toBe('');
  });

  it('returns empty string for en-US', () => {
    expect(getLanguageSuffix('en-US')).toBe('');
  });

  it('returns Spanish suffix for es', () => {
    expect(getLanguageSuffix('es')).toContain('Spanish');
  });

  it('returns French suffix for fr', () => {
    expect(getLanguageSuffix('fr')).toContain('French');
  });

  it('returns Brazilian Portuguese suffix for pt-BR', () => {
    expect(getLanguageSuffix('pt-BR')).toContain('Brazilian Portuguese');
  });

  it('returns the locale code for unknown languages', () => {
    expect(getLanguageSuffix('sv')).toContain('sv');
  });

  it('includes IMPORTANT instruction', () => {
    const suffix = getLanguageSuffix('es');
    expect(suffix).toContain('IMPORTANT');
    expect(suffix).toContain('Write the description in');
  });
});

describe('AI_LANGUAGES', () => {
  it('has 5 supported languages', () => {
    expect(AI_LANGUAGES).toHaveLength(5);
  });

  it('includes English as first entry', () => {
    expect(AI_LANGUAGES[0]).toEqual({ code: 'en', label: 'English' });
  });

  it('each entry has code and label', () => {
    for (const lang of AI_LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.label).toBeTruthy();
    }
  });
});
