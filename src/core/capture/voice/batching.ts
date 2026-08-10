import { absoluteSeconds, type SpeechSegment } from './types';

export const MERGE_GAP_S = 0.5;
export const MAX_BATCH_S = 25;
export const MIN_SPEECH_S = 1;

export function mergeGaps(segments: SpeechSegment[], gap = MERGE_GAP_S): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && s.start - last.end <= gap) {
      last.end = absoluteSeconds(Math.max(last.end, s.end));
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
