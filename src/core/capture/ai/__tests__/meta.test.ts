import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
  jsonSchema: (schema: unknown) => schema,
}));

vi.mock('../provider', () => ({ createModel: () => ({ id: 'test-model' }) }));

vi.mock('@/lib/browser-api', () => ({
  localStorage: { get: vi.fn().mockResolvedValue({ aiLanguage: 'en' }) },
}));

import { generateGuideMeta } from '../meta';

const steps = [{ description: 'Click Directory', url: 'https://admin.okta.com/users' }];

describe('generateGuideMeta', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('returns both title and description from a well-formed response', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        title: 'Reset a User Password in Okta',
        description: 'Reset a locked-out user password.',
      },
    });

    const result = await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key');

    expect(result).toEqual({
      title: 'Reset a User Password in Okta',
      description: 'Reset a locked-out user password.',
    });
  });

  it('still yields a usable title when the model omits the description', async () => {
    generateObjectMock.mockResolvedValue({ object: { title: 'Reset a User Password in Okta' } });

    const result = await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key');

    expect(result?.title).toBe('Reset a User Password in Okta');
    expect(result?.description).toBeUndefined();
  });

  it('truncates a title over 70 characters', async () => {
    generateObjectMock.mockResolvedValue({ object: { title: 'x'.repeat(90), description: 'ok' } });

    const result = await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key');

    expect(result?.title.length).toBe(70);
    expect(result?.title.endsWith('...')).toBe(true);
  });

  it('marks every declared property as required, as strict mode demands', async () => {
    generateObjectMock.mockResolvedValue({ object: { title: 'T', description: null } });

    await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key');

    const { schema } = generateObjectMock.mock.calls[0][0];
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it('treats a null description from the model as absent', async () => {
    generateObjectMock.mockResolvedValue({ object: { title: 'Okta Password Reset', description: null } });

    const result = await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key');

    expect(result?.title).toBe('Okta Password Reset');
    expect(result?.description).toBeUndefined();
  });

  it('returns null when the model returns a blank title', async () => {
    generateObjectMock.mockResolvedValue({ object: { title: '   ', description: 'ok' } });

    expect(await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key')).toBeNull();
  });

  it('interpolates the numbered steps into the prompt', async () => {
    generateObjectMock.mockResolvedValue({ object: { title: 'Okta Password Reset' } });

    await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key');

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).toContain('1. [https://admin.okta.com/users] Click Directory');
    expect(prompt).not.toContain('{{steps}}');
  });

  it('returns null for an empty step list without calling the model', async () => {
    expect(await generateGuideMeta([], 'openai', 'gpt-4o-mini', 'key')).toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('returns null when the request throws', async () => {
    generateObjectMock.mockRejectedValue(new Error('rate limited'));
    expect(await generateGuideMeta(steps, 'openai', 'gpt-4o-mini', 'key')).toBeNull();
  });
});
