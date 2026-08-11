import { getAIDescription } from '@/core/capture/ai/description';
import type { DOMContext } from '@/core/capture/dom/context';
import { CaptureState } from '@/core/capture/machine';
import { buildFallbackDescription } from '@/core/capture/step-description';
import { db } from '@/core/guides/db';
import {
  addStepToGuide,
  clearStepAiPending,
  createStep,
  saveScreenshot,
  updateStepDescription,
} from '@/core/guides/service';
import type { ElementMeta, Screenshot, Step } from '@/core/guides/types';
import { DEFAULT_TARGET_COLOR } from '@/core/screenshot/types';
import { captureVisibleTab, localStorage } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import type { CaptureStepData, CaptureStepResponse } from '@/lib/messaging';
import { getActor } from './actor';

async function takeScreenshot(stepId: string, meta: ElementMeta): Promise<string | undefined> {
  try {
    const { targetColor } = await localStorage.get(['targetColor']);
    const dataUrl = await captureVisibleTab('jpeg', 90);
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const img = await createImageBitmap(blob);
    const screenshot: Screenshot = {
      id: crypto.randomUUID(),
      stepId,
      blob,
      mimeType: 'image/jpeg',
      width: img.width,
      height: img.height,
      bounds: { x: meta.rect.x, y: meta.rect.y, width: meta.rect.width, height: meta.rect.height },
      pixelRatio: meta.devicePixelRatio,
      clickPoint: meta.clickPoint,
      edits: {
        target: {
          x: meta.rect.x * meta.devicePixelRatio,
          y: meta.rect.y * meta.devicePixelRatio,
          width: meta.rect.width * meta.devicePixelRatio,
          height: meta.rect.height * meta.devicePixelRatio,
          border: 'dashed',
          color: (targetColor as string) || DEFAULT_TARGET_COLOR,
        },
      },
    };
    img.close();
    await saveScreenshot(screenshot);
    return screenshot.id;
  } catch (err) {
    logger.warn('Screenshot capture failed', err);
    return undefined;
  }
}

async function tryAIDescription(stepId: string, domContext: DOMContext) {
  const settings = await localStorage.get(['aiApiKey', 'aiProvider', 'aiModel']);
  if (!settings.aiApiKey) return;

  const provider = (settings.aiProvider as string) || 'openai';
  const model = (settings.aiModel as string) || 'gpt-4o-mini';
  try {
    const description = await getAIDescription(domContext, provider, model, settings.aiApiKey as string);
    await clearStepAiPending(stepId, description || undefined);
  } catch (err) {
    await clearStepAiPending(stepId);
    throw err;
  }
}

export async function handleCaptureStep(data: CaptureStepData): Promise<CaptureStepResponse> {
  const snap = getActor().getSnapshot();
  if (snap.value !== CaptureState.RECORDING) return { ignored: true };

  const stepIndex = snap.context.stepCount;
  getActor().send({ type: 'USER_ACTION' });

  const guideId = snap.context.currentGuideId!;
  const stepId = crypto.randomUUID();

  const screenshotId = await takeScreenshot(stepId, data.elementMeta);

  const willUseAI = data.action !== 'input' && !!data.domContext && !!(await localStorage.get(['aiApiKey'])).aiApiKey;

  await createStep({
    id: stepId,
    guideId,
    index: stepIndex,
    description: buildFallbackDescription(data.action, data.elementMeta),
    action: data.action,
    url: snap.context.currentUrl,
    timestamp: Date.now(),
    screenshotId,
    elementMeta: data.elementMeta,
    aiPending: willUseAI,
  });
  await addStepToGuide(guideId, stepId);

  if (data.action !== 'input' && data.domContext) {
    try {
      await tryAIDescription(stepId, data.domContext);
    } catch (err) {
      logger.error('AI description failed', err);
    }
  }

  return { stepId };
}

export async function handleUpdateInputStep(stepId: string, description: string, inputValue?: string) {
  await updateStepDescription(stepId, description);
  if (inputValue !== undefined) {
    await db.steps.update(stepId, { inputValue });
  }
}

export async function handleFinalizeInputStep(
  stepId: string,
  elementMeta: ElementMeta,
  domContext: DOMContext | undefined,
) {
  const screenshotId = await takeScreenshot(stepId, elementMeta);
  const updates: Partial<Step> = { elementMeta };
  if (screenshotId) updates.screenshotId = screenshotId;
  await db.steps.update(stepId, updates);

  if (domContext) {
    try {
      await tryAIDescription(stepId, domContext);
    } catch (err) {
      logger.error('AI description failed on finalize', err);
    }
  }
}
