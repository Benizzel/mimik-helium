import { createTab, getExtensionURL, sendMessage } from './browser-api';
import { logger } from './logger';
import {
  VOICE_OFFSCREEN_TARGET,
  type VoiceAbortRequest,
  type VoiceAbortResponse,
  VoiceMessage,
  type VoicePermissionQueryRequest,
  type VoicePermissionQueryResponse,
  type VoiceRequest,
  type VoiceStartRequest,
  type VoiceStartResponse,
  type VoiceStatusRequest,
  type VoiceStatusResponse,
  type VoiceStepMark,
  type VoiceStopRequest,
  type VoiceStopResponse,
  voiceMessage,
} from './voice-messages';

const OFFSCREEN_PATH = '/offscreen.html';
const MIC_PERMISSION_PATH = '/mic-permission.html';
const OFFSCREEN_REASON = 'USER_MEDIA';
const OFFSCREEN_JUSTIFICATION = 'Recording microphone narration while a guide is being captured';
const OFFSCREEN_CONTEXT = 'OFFSCREEN_DOCUMENT';

interface OffscreenApi {
  createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
  closeDocument(): Promise<void>;
}

interface ContextsApi {
  getContexts(filter: { contextTypes: string[] }): Promise<unknown[]>;
}

function offscreenApi(): OffscreenApi | undefined {
  return (globalThis as { chrome?: { offscreen?: OffscreenApi } }).chrome?.offscreen;
}

function contextsApi(): ContextsApi | undefined {
  const runtime = (globalThis as { chrome?: { runtime?: Partial<ContextsApi> } }).chrome?.runtime;
  return typeof runtime?.getContexts === 'function' ? (runtime as ContextsApi) : undefined;
}

let creating: Promise<void> | null = null;

export function supportsOffscreen(): boolean {
  return offscreenApi() !== undefined;
}

export async function hasOffscreenDocument(): Promise<boolean> {
  const api = contextsApi();
  if (!api) return false;
  try {
    const contexts = await api.getContexts({ contextTypes: [OFFSCREEN_CONTEXT] });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

export async function ensureOffscreenDocument(): Promise<boolean> {
  const api = offscreenApi();
  if (!api) return false;
  if (await hasOffscreenDocument()) return true;

  creating ??= api.createDocument({
    url: getExtensionURL(OFFSCREEN_PATH),
    reasons: [OFFSCREEN_REASON],
    justification: OFFSCREEN_JUSTIFICATION,
  });

  try {
    await creating;
    return true;
  } catch (error) {
    logger.error('voice: failed to create the offscreen document', error);
    return hasOffscreenDocument();
  } finally {
    creating = null;
  }
}

export async function closeOffscreenDocument(): Promise<void> {
  const api = offscreenApi();
  if (!api) return;
  if (!(await hasOffscreenDocument())) return;
  try {
    await api.closeDocument();
  } catch (error) {
    logger.error('voice: failed to close the offscreen document', error);
  }
}

export function openMicPermissionPage(tabId?: number): Promise<unknown> {
  const url = getExtensionURL(tabId === undefined ? MIC_PERMISSION_PATH : `${MIC_PERMISSION_PATH}?tabId=${tabId}`);
  return createTab({ url, active: true });
}

function request<T>(message: VoiceRequest): Promise<T> {
  return sendMessage(message as unknown as Record<string, unknown>) as Promise<T>;
}

export function startVoiceCapture(deviceId?: string): Promise<VoiceStartResponse> {
  return request(
    voiceMessage<VoiceStartRequest>({ type: VoiceMessage.VOICE_START, target: VOICE_OFFSCREEN_TARGET, deviceId }),
  );
}

export function stopVoiceCapture(guideId: string, steps: VoiceStepMark[]): Promise<VoiceStopResponse> {
  return request(
    voiceMessage<VoiceStopRequest>({ type: VoiceMessage.VOICE_STOP, target: VOICE_OFFSCREEN_TARGET, guideId, steps }),
  );
}

export function abortVoiceCapture(): Promise<VoiceAbortResponse> {
  return request(voiceMessage<VoiceAbortRequest>({ type: VoiceMessage.VOICE_ABORT, target: VOICE_OFFSCREEN_TARGET }));
}

export function getVoiceStatus(): Promise<VoiceStatusResponse> {
  return request(voiceMessage<VoiceStatusRequest>({ type: VoiceMessage.VOICE_STATUS, target: VOICE_OFFSCREEN_TARGET }));
}

export function queryMicPermission(): Promise<VoicePermissionQueryResponse> {
  return request(
    voiceMessage<VoicePermissionQueryRequest>({
      type: VoiceMessage.VOICE_PERMISSION_QUERY,
      target: VOICE_OFFSCREEN_TARGET,
    }),
  );
}
