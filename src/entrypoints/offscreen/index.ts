import { detectSpeechByEnergy } from '@/core/capture/voice/energy-gate';
import { runNarrationPipeline } from '@/core/capture/voice/pipeline';
import { buildStepWindows } from '@/core/capture/voice/step-windows';
import { createTranscriber, type VoiceProvider } from '@/core/capture/voice/transcribe';
import type { NarrationResult } from '@/core/capture/voice/types';
import { getExtensionURL, localStorage, onMessage, sendMessage } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import {
  isVoiceMessageFor,
  VOICE_BACKGROUND_TARGET,
  VOICE_OFFSCREEN_TARGET,
  VOICE_SIDEPANEL_TARGET,
  type VoiceEpochEvent,
  type VoiceErrorEvent,
  type VoiceErrorReason,
  type VoiceEvent,
  type VoiceLevelEvent,
  VoiceMessage,
  type VoicePermissionQueryResponse,
  type VoicePermissionState,
  type VoiceRequest,
  type VoiceStartRequest,
  type VoiceStartResponse,
  type VoiceStatusResponse,
  type VoiceStopRequest,
  type VoiceStopResponse,
  voiceMessage,
} from '@/lib/voice-messages';
import { MicRecorder } from './mic-recorder';

const VOICE_PROVIDERS: VoiceProvider[] = ['openai', 'groq'];

const EMPTY_RESULT: NarrationResult = {
  descriptions: [],
  stats: {
    batches: 0,
    failedBatches: 0,
    droppedBatches: 0,
    verbatimSegments: 0,
    splitSegments: 0,
    rejectedSegments: 0,
  },
};

function emit(event: VoiceEvent): void {
  void sendMessage(event as unknown as Record<string, unknown>).catch(() => undefined);
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function startFailureReason(error: unknown): VoiceErrorReason {
  if (!(error instanceof Error)) return 'unknown';
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'permission-denied';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'no-device';
  if (error.name === 'NotSupportedError') return 'unsupported';
  return 'unknown';
}

const recorder = new MicRecorder(getExtensionURL('/pcm-processor.js'), {
  onEpoch: (audioEpochMs) =>
    emit(
      voiceMessage<VoiceEpochEvent>({
        type: VoiceMessage.VOICE_EPOCH,
        target: VOICE_BACKGROUND_TARGET,
        audioEpochMs,
      }),
    ),
  onLevel: (level, speaking) =>
    emit(
      voiceMessage<VoiceLevelEvent>({
        type: VoiceMessage.VOICE_LEVEL,
        target: VOICE_SIDEPANEL_TARGET,
        level,
        speaking,
      }),
    ),
  onStreamEnded: () =>
    emit(
      voiceMessage<VoiceErrorEvent>({
        type: VoiceMessage.VOICE_ERROR,
        target: VOICE_BACKGROUND_TARGET,
        reason: 'stream-ended',
        error: 'The microphone stream ended before recording stopped',
      }),
    ),
});

async function readVoiceSettings(): Promise<{ provider: VoiceProvider; apiKey: string; language?: string }> {
  const stored = await localStorage.get(['voiceProvider', 'voiceApiKey', 'voiceLanguage', 'aiLanguage']);
  const provider = stored.voiceProvider as VoiceProvider;
  const locale = (stored.voiceLanguage ?? stored.aiLanguage) as string | undefined;
  return {
    provider: VOICE_PROVIDERS.includes(provider) ? provider : 'openai',
    apiKey: typeof stored.voiceApiKey === 'string' ? stored.voiceApiKey.trim() : '',
    language: locale ? locale.split('-')[0] : undefined,
  };
}

async function handleStart(request: VoiceStartRequest): Promise<VoiceStartResponse> {
  if (recorder.recording) {
    return { started: false, reason: 'already-recording', error: 'Microphone capture is already running' };
  }
  try {
    const stream = await recorder.start(request.deviceId);
    logger.info('voice: microphone capture started', stream);
    return { started: true, ...stream };
  } catch (error) {
    recorder.release();
    logger.error('voice: microphone capture failed to start', error);
    return { started: false, reason: startFailureReason(error), error: describe(error) };
  }
}

async function handleStop(request: VoiceStopRequest): Promise<VoiceStopResponse> {
  if (!recorder.recording) {
    return { ok: false, reason: 'not-recording', error: 'Microphone capture is not running' };
  }

  const recording = recorder.stop();
  if (recording.audioEpochMs === null || recording.pcm.length === 0) {
    return { ok: false, reason: 'no-audio', error: 'No microphone audio was captured' };
  }

  const audioEpochMs = recording.audioEpochMs;
  if (request.steps.length === 0) {
    return { ok: true, result: EMPTY_RESULT, audioEpochMs, durationSeconds: recording.durationSeconds };
  }

  const settings = await readVoiceSettings();
  if (!settings.apiKey) {
    return { ok: false, reason: 'missing-api-key', error: 'No transcription API key is configured' };
  }

  try {
    const result = await runNarrationPipeline({
      pcm: recording.pcm,
      sampleRate: recording.sampleRate,
      steps: buildStepWindows(request.steps, audioEpochMs),
      detectSpeech: detectSpeechByEnergy,
      transcribe: createTranscriber(settings),
    });
    logger.info('voice: narration pipeline finished', result.stats);
    return { ok: true, result, audioEpochMs, durationSeconds: recording.durationSeconds };
  } catch (error) {
    logger.error('voice: narration pipeline failed', error);
    return { ok: false, reason: 'unknown', error: describe(error) };
  }
}

async function permissionState(): Promise<VoicePermissionQueryResponse> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return { state: result.state as VoicePermissionState };
  } catch {
    return { state: 'unknown' };
  }
}

function status(): VoiceStatusResponse {
  return {
    recording: recorder.recording,
    audioEpochMs: recorder.audioEpochMs,
    sampleRate: recorder.sampleRate,
    samples: recorder.sampleCount,
    durationSeconds: recorder.durationSeconds,
  };
}

onMessage((message, _sender, sendResponse) => {
  if (!isVoiceMessageFor(VOICE_OFFSCREEN_TARGET, message)) return undefined;
  const request = message as VoiceRequest;

  switch (request.type) {
    case VoiceMessage.VOICE_START:
      void handleStart(request).then(sendResponse);
      return true;
    case VoiceMessage.VOICE_STOP:
      void handleStop(request).then(sendResponse);
      return true;
    case VoiceMessage.VOICE_ABORT:
      recorder.release();
      sendResponse({ ok: true });
      return undefined;
    case VoiceMessage.VOICE_STATUS:
      sendResponse(status());
      return undefined;
    case VoiceMessage.VOICE_PERMISSION_QUERY:
      void permissionState().then(sendResponse);
      return true;
    default:
      return undefined;
  }
});
