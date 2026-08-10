import { absoluteSeconds, type SpeechSegment } from './types';

export const FRAME_MS = 30;
export const SEGMENT_PAD_MS = 300;
export const SPEECH_RMS_THRESHOLD = 10 ** (-45 / 20);

const MS_PER_S = 1000;
const INT16_SCALE = 32768;

export function frameRms(pcm: Int16Array, from: number, to: number): number {
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i += 1) {
    const sample = pcm[i] / INT16_SCALE;
    sum += sample * sample;
  }
  return Math.sqrt(sum / (to - from));
}

export async function detectSpeechByEnergy(pcm: Int16Array, sampleRate: number): Promise<SpeechSegment[]> {
  if (pcm.length === 0 || sampleRate <= 0) return [];

  const frameSize = Math.max(1, Math.round((sampleRate * FRAME_MS) / MS_PER_S));
  const duration = pcm.length / sampleRate;
  const pad = SEGMENT_PAD_MS / MS_PER_S;
  const segments: SpeechSegment[] = [];

  const push = (fromSample: number, toSample: number) => {
    const start = Math.max(0, fromSample / sampleRate - pad);
    const end = Math.min(duration, toSample / sampleRate + pad);
    const last = segments[segments.length - 1];
    if (last && start <= last.end) {
      last.end = absoluteSeconds(Math.max(last.end, end));
      return;
    }
    segments.push({ start: absoluteSeconds(start), end: absoluteSeconds(end) });
  };

  let voicedFrom = -1;
  for (let frameStart = 0; frameStart < pcm.length; frameStart += frameSize) {
    const frameEnd = Math.min(frameStart + frameSize, pcm.length);
    const voiced = frameRms(pcm, frameStart, frameEnd) > SPEECH_RMS_THRESHOLD;
    if (voiced && voicedFrom < 0) voicedFrom = frameStart;
    if (!voiced && voicedFrom >= 0) {
      push(voicedFrom, frameStart);
      voicedFrom = -1;
    }
  }
  if (voicedFrom >= 0) push(voicedFrom, pcm.length);

  return segments;
}
