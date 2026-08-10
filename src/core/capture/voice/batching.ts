import { absoluteSeconds, type Batch, type SpeechSegment } from './types';

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

export interface BatchPlan {
  batches: Batch[];
  dropped: number;
}

const speechSeconds = (segments: SpeechSegment[]): number =>
  segments.reduce((total, s) => total + (s.end - s.start), 0);

export function buildBatches(segments: SpeechSegment[]): BatchPlan {
  const grouped: Batch[] = [];
  for (const s of segments) {
    const last = grouped[grouped.length - 1];
    if (last && s.end - last.start <= MAX_BATCH_S) {
      last.end = s.end;
      last.segments.push(s);
    } else {
      grouped.push({ start: s.start, end: s.end, segments: [s] });
    }
  }
  const batches = grouped.filter((b) => speechSeconds(b.segments) >= MIN_SPEECH_S);
  return { batches, dropped: grouped.length - batches.length };
}
