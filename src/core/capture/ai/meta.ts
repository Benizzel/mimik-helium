import { generateObject, jsonSchema } from 'ai';
import { localStorage } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import { GUIDE_META_PROMPT, getLanguageSuffix } from './prompts';
import { createModel } from './provider';

export interface GuideMeta {
  title: string;
  description?: string;
}

const guideMetaSchema = jsonSchema<{ title: string; description?: string | null }>({
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
  },
  required: ['title', 'description'],
  additionalProperties: false,
});

export async function generateGuideMeta(
  steps: { description: string; url: string }[],
  provider: string,
  model: string,
  apiKey: string,
): Promise<GuideMeta | null> {
  if (steps.length === 0) return null;

  const formatted = steps.map((s, i) => `${i + 1}. [${s.url}] ${s.description}`).join('\n');

  try {
    const settings = await localStorage.get(['aiLanguage']);
    const locale = (settings.aiLanguage as string) || 'en';
    const { object } = await generateObject({
      model: createModel(provider, model, apiKey),
      schema: guideMetaSchema,
      prompt: GUIDE_META_PROMPT.replace('{{steps}}', formatted) + getLanguageSuffix(locale),
      maxOutputTokens: 200,
    });

    let title = object.title?.trim().replace(/^"|"$/g, '') ?? '';
    if (!title) return null;
    if (title.length > 70) title = `${title.slice(0, 67)}...`;

    const description = object.description?.trim().replace(/^"|"$/g, '') || undefined;
    return { title, description };
  } catch (err) {
    logger.error('Guide meta generation failed', err);
    return null;
  }
}
