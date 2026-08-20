import { applyAiDescription, clearStepAiPending } from '@/core/guides/service';
import { generateAiDescription } from './ai-description';
import { takeDeferredDescription, takeDeferredDescriptions } from './deferred-descriptions';
import { queueDescription } from './description-queue';

export function describeStepNow(guideId: string, stepId: string): void {
  const domContext = takeDeferredDescription(guideId, stepId);
  queueDescription(guideId, async () => {
    const description = domContext ? await generateAiDescription(domContext) : undefined;
    await clearStepAiPending(stepId, description);
  });
}

export function describeUnnarratedSteps(guideId: string, narratedStepIds: readonly string[]): void {
  for (const { stepId, domContext } of takeDeferredDescriptions(guideId, narratedStepIds)) {
    queueDescription(guideId, async () => {
      const description = await generateAiDescription(domContext);
      if (description) await applyAiDescription(stepId, description);
    });
  }
}
