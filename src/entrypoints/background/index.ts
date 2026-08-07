import { browser, defineBackground } from '#imports';
import { rewriteSelection } from '@/core/capture/ai/rewrite';
import { validateApiKey } from '@/core/capture/ai/validate';
import { stepRequiresManual } from '@/core/guideme/manual';
import { advanceSession, cancelSession, completeSession, getSession, startSession } from '@/core/guideme/session';
import { createGuide, getScreenshotsForSteps, getStepsForGuide } from '@/core/guides/service';
import type { Step } from '@/core/guides/types';
import { getActiveTab, localStorage, sendMessageToTab, setSidePanelBehavior, updateTab } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import { onMessage } from '@/lib/messaging';
import { broadcastStateToPanel, setupPortListener } from '@/lib/port';
import { getActor, getStateUpdate, initActor, initActorFallback, waitUntilReady } from './actor';
import { generateDescriptionOnDemand, generateGuideMetaOnStop } from './guide-meta';
import { registerNavigationListeners } from './navigation';
import { handleCaptureStep, handleFinalizeInputStep, handleUpdateInputStep } from './step-pipeline';
import { broadcastStartCapture, broadcastStopCapture, showNotificationOnTab } from './tab-manager';

async function resolveManual(step: Step): Promise<boolean> {
  if (!step.screenshotId) return stepRequiresManual(step, null);
  const screenshots = await getScreenshotsForSteps([step.screenshotId]);
  return stepRequiresManual(step, screenshots.get(step.id));
}

export default defineBackground(() => {
  logger.info('Background service worker started');

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== 'install') return;
    if (import.meta.env.BROWSER === 'firefox') {
      // Firefox MV3 bug 1758306: the <all_urls> grant lands in the origin
      // store but is missed by _setupStartupPermissions when populating the
      // API-permission resolution table that captureVisibleTab consults.
      // Result: permissions.contains() returns true but captureVisibleTab
      // silently rejects. Removing the permission here forces a clean state
      // so the user-gesture permissions.request() in onboarding's "Get
      // Started" / sidepanel's "Start Recording" goes through the working
      // re-grant code path. Remove this when Mozilla ships:
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1758306
      try {
        await browser.permissions.remove({ origins: ['<all_urls>'] });
      } catch (err) {
        logger.warn('Failed to clear stale host permission on install', err);
      }
    }
    browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  });

  setSidePanelBehavior(true);
  if (import.meta.env.BROWSER === 'firefox') {
    browser.action.onClicked.addListener(() => {
      browser.sidebarAction.toggle();
    });
  }
  initActor().catch(initActorFallback);
  cancelSession();
  registerNavigationListeners();

  setupPortListener((port) => {
    logger.debug('Panel connected via port');
    waitUntilReady().then(() => {
      try {
        port.postMessage(getStateUpdate());
      } catch {}
    });

    port.onDisconnect.addListener(() => {
      getSession().then((session) => {
        if (session?.active) {
          cancelSession();
          logger.debug('Guide Me cancelled: sidepanel closed');
        }
      });
    });
  });

  waitUntilReady().then(() => {
    getActor().subscribe(() => broadcastStateToPanel(getStateUpdate()));
  });

  onMessage('getState', async () => {
    await waitUntilReady();
    return getStateUpdate();
  });

  onMessage('startRecording', async ({ data }) => {
    await waitUntilReady();
    const actor = getActor();
    actor.send({ type: 'START_RECORDING', url: data.url });
    const guideId = actor.getSnapshot().context.currentGuideId!;

    await createGuide(guideId);

    const activeTab = await getActiveTab();
    if (activeTab?.id) await showNotificationOnTab(activeTab.id);

    await broadcastStartCapture(guideId);
    return { guideId };
  });

  onMessage('stopRecording', async () => {
    await waitUntilReady();
    const actor = getActor();
    const guideId = actor.getSnapshot().context.currentGuideId;
    await broadcastStopCapture();
    actor.send({ type: 'STOP_RECORDING' });

    if (guideId) generateGuideMetaOnStop(guideId).catch(() => {});

    return { success: true, guideId: guideId ?? undefined };
  });

  onMessage('enterBlurMode', async () => {
    await waitUntilReady();
    await broadcastStopCapture();
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      sendMessageToTab(activeTab.id, { type: 'START_BLUR' }).catch(() => {});
    }
    return { entered: true };
  });

  onMessage('exitBlurMode', async () => {
    await waitUntilReady();
    await localStorage.set({ mimikBlurMode: false });
    const actor = getActor();
    const guideId = actor.getSnapshot().context.currentGuideId;
    if (guideId) {
      await broadcastStartCapture(guideId);
    }
    return { exited: true };
  });

  onMessage('generateGuideDescription', ({ data }) => generateDescriptionOnDemand(data.guideId));

  onMessage('validateApiKey', ({ data }) => validateApiKey(data.provider, data.apiKey));

  onMessage('rewriteSelection', ({ data }) => rewriteSelection(data.text, data.instruction));

  onMessage('captureStep', async ({ data }) => {
    await waitUntilReady();
    return handleCaptureStep(data);
  });

  onMessage('updateInputStep', async ({ data }) => {
    await waitUntilReady();
    await handleUpdateInputStep(data.stepId, data.description, data.inputValue);
    return { updated: true };
  });

  onMessage('finalizeInputStep', async ({ data }) => {
    await waitUntilReady();
    await handleFinalizeInputStep(data.stepId, data.elementMeta, data.domContext);
    return { updated: true };
  });

  onMessage('startGuideMe', async ({ data }) => {
    const steps = await getStepsForGuide(data.guideId);
    if (steps.length === 0) return { started: false, error: 'No steps' };

    const firstStep = steps.find((s) => s.elementMeta) ?? steps[0];
    if (!steps.some((s) => s.elementMeta)) return { started: false, error: 'Guide lacks element metadata' };

    await startSession(data.guideId, steps.length, firstStep, await resolveManual(firstStep));

    const activeTab = await getActiveTab();
    if (activeTab?.id && firstStep.url) {
      await updateTab(activeTab.id, { url: firstStep.url });
    }

    return { started: true };
  });

  onMessage('guideMeStepCompleted', async ({ data }) => {
    const sessionData = await localStorage.get(['guideMeSession']);
    const session = sessionData.guideMeSession as { guideId: string } | undefined;
    if (!session) return { advanced: false };

    const steps = await getStepsForGuide(session.guideId);
    const nextIndex = data.stepIndex + 1;

    if (nextIndex >= steps.length) {
      await completeSession();
      return { advanced: true, completed: true };
    }

    const nextStep = steps[nextIndex];
    if (!nextStep) {
      await completeSession();
      return { advanced: true, completed: true };
    }
    await advanceSession(nextStep, nextIndex, await resolveManual(nextStep));

    const currentTab = await getActiveTab();
    if (currentTab?.id && nextStep.url && nextStep.url !== currentTab.url) {
      await updateTab(currentTab.id, { url: nextStep.url });
    }

    return { advanced: true };
  });

  onMessage('guideMeCancel', async () => {
    await cancelSession();
    return { cancelled: true };
  });

  onMessage('guideMeGoTo', async ({ data }) => {
    const sessionData = await localStorage.get(['guideMeSession']);
    const session = sessionData.guideMeSession as { guideId: string } | undefined;
    if (!session) return { moved: false };

    const steps = await getStepsForGuide(session.guideId);
    const target = steps[data.stepIndex];
    if (!target) return { moved: false };
    await advanceSession(target, data.stepIndex, await resolveManual(target));

    const currentTab = await getActiveTab();
    if (currentTab?.id && target.url && target.url !== currentTab.url) {
      await updateTab(currentTab.id, { url: target.url });
    }

    return { moved: true };
  });
});
