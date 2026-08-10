export interface SpeechSegment {
  start: number;
  end: number;
}

export interface StepWindow {
  stepId: string;
  from: number;
  to: number;
}

export interface Batch {
  start: number;
  end: number;
  segs: SpeechSegment[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionResponse {
  text?: string;
  segments?: TranscriptSegment[];
  words?: TranscriptWord[];
}

export interface NarrationResult {
  byStep: Map<string, string>;
  stats: {
    batches: number;
    verbatimSegments: number;
    splitSegments: number;
    rejectedSegments: number;
  };
}
