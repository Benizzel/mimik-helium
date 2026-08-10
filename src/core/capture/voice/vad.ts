import { absoluteSeconds, type SpeechSegment } from './types';

export const FRAME_SAMPLES = 1536;
export const MS_PER_FRAME = FRAME_SAMPLES / 16;

export const POSITIVE_SPEECH_THRESHOLD = 0.5;
export const NEGATIVE_SPEECH_THRESHOLD = 0.35;
export const MIN_SPEECH_FRAMES = 4;
export const REDEMPTION_FRAMES = 12;
export const PRE_SPEECH_PAD_FRAMES = 5;

const INT16_SCALE = 32768;

export interface VadAssetOptions {
  modelURL?: string;
  modelFetcher?: (path: string) => Promise<ArrayBuffer>;
  ortConfig?: (ort: any) => void;
}

export function toFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i] / INT16_SCALE;
  return out;
}

export function createSpeechDetector(assets: VadAssetOptions = {}) {
  return async function detectSpeech(pcm: Int16Array, sampleRate: number): Promise<SpeechSegment[]> {
    const { NonRealTimeVAD } = await import('@ricky0123/vad-web');
    const vad = await NonRealTimeVAD.new({
      positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD,
      negativeSpeechThreshold: NEGATIVE_SPEECH_THRESHOLD,
      minSpeechMs: MIN_SPEECH_FRAMES * MS_PER_FRAME,
      redemptionMs: REDEMPTION_FRAMES * MS_PER_FRAME,
      preSpeechPadMs: PRE_SPEECH_PAD_FRAMES * MS_PER_FRAME,
      ...assets,
    });

    const segments: SpeechSegment[] = [];
    for await (const detected of vad.run(toFloat32(pcm), sampleRate)) {
      segments.push({
        start: absoluteSeconds(detected.start / 1000),
        end: absoluteSeconds(detected.end / 1000),
      });
    }

    return segments.sort((a, b) => a.start - b.start);
  };
}

export const detectSpeech = createSpeechDetector();
