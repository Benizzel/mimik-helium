import type { Step } from '@/core/guides/types';
import { localStorage } from '@/lib/browser-api';

export interface GuideMeSession {
  guideId: string;
  activeStepIndex: number;
  totalSteps: number;
  active: boolean;
}

const SESSION_KEY = 'guideMeSession';
const STEP_KEY = 'guideMeStep';
const BLOCKED_KEY = 'guideMeBlocked';

export async function startSession(guideId: string, totalSteps: number, firstStep: Step): Promise<void> {
  const session: GuideMeSession = { guideId, activeStepIndex: 0, totalSteps, active: true };
  await localStorage.set({ [SESSION_KEY]: session, [STEP_KEY]: firstStep, [BLOCKED_KEY]: null });
}

export async function advanceSession(nextStep: Step, nextIndex: number): Promise<void> {
  const data = await localStorage.get([SESSION_KEY]);
  const session = data[SESSION_KEY] as GuideMeSession | undefined;
  if (!session || !session.active) return;
  await localStorage.set({
    [SESSION_KEY]: { ...session, activeStepIndex: nextIndex },
    [STEP_KEY]: nextStep,
    [BLOCKED_KEY]: null,
  });
}

export async function completeSession(): Promise<void> {
  const data = await localStorage.get([SESSION_KEY]);
  const session = data[SESSION_KEY] as GuideMeSession | undefined;
  if (!session) return;
  await localStorage.set({
    [SESSION_KEY]: { ...session, active: false },
    [STEP_KEY]: null,
    [BLOCKED_KEY]: null,
  });
}

export async function cancelSession(): Promise<void> {
  await localStorage.set({ [SESSION_KEY]: null, [STEP_KEY]: null, [BLOCKED_KEY]: null });
}

export async function getSession(): Promise<GuideMeSession | null> {
  const data = await localStorage.get([SESSION_KEY]);
  return (data[SESSION_KEY] as GuideMeSession) || null;
}

export { BLOCKED_KEY, SESSION_KEY, STEP_KEY };
