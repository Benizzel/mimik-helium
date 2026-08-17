import { applyAiDescription } from '@/core/guides/service';
import { generateAiDescription } from './ai-description';
import { takeDeferredDescriptions } from './deferred-descriptions';
import { queueDescription } from './description-queue';

export function describeUnnarratedSteps(guideId: string, narratedStepIds: readonly string[]): void {
  for (const { stepId, domContext } of takeDeferredDescriptions(guideId, narratedStepIds)) {
    queueDescription(guideId, async () => {
      const description = await generateAiDescription(domContext);
      if (description) await applyAiDescription(stepId, description);
    });
  }
}
