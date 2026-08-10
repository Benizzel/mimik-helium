import { describe, expect, it, vi } from 'vitest';
import type { AbsoluteSeconds } from '../types';
import {
  createSpeechDetector,
  detectSpeech,
  MIN_SPEECH_FRAMES,
  MS_PER_FRAME,
  PRE_SPEECH_PAD_FRAMES,
  REDEMPTION_FRAMES,
} from '../vad';

const spy = vi.hoisted(() => ({
  detected: [] as Array<{ start: number; end: number }>,
  audio: null as Float32Array | null,
  sampleRate: 0,
  options: {} as Record<string, unknown>,
}));

vi.mock('@ricky0123/vad-web', () => ({
  NonRealTimeVAD: {
    new: async (options: Record<string, unknown>) => {
      spy.options = options;
      return {
        async *run(audio: Float32Array, sampleRate: number) {
          spy.audio = audio;
          spy.sampleRate = sampleRate;
          for (const item of spy.detected) yield { audio: new Float32Array(0), ...item };
        },
      };
    },
  },
}));

const givenDetected = (items: Array<{ start: number; end: number }>) => {
  spy.detected = items;
};

describe('detectSpeech', () => {
  it('converts Int16 samples to Float32 by dividing by 32768', async () => {
    givenDetected([]);
    await detectSpeech(new Int16Array([-32768, -1, 0, 1, 32767]), 16000);

    expect(Array.from(spy.audio ?? [])).toEqual([-1, -1 / 32768, 0, 1 / 32768, 32767 / 32768]);
    expect(spy.audio).toBeInstanceOf(Float32Array);
  });

  it('keeps every converted sample inside the normalised range', async () => {
    givenDetected([]);
    await detectSpeech(new Int16Array([-32768, 32767, -16384, 16384]), 16000);

    const values = Array.from(spy.audio ?? []);
    expect(values.every((v) => v >= -1 && v <= 1)).toBe(true);
    expect(values[2]).toBe(-0.5);
    expect(values[3]).toBe(0.5);
  });

  it('forwards the source sample rate untouched', async () => {
    givenDetected([]);
    await detectSpeech(new Int16Array(16), 48000);

    expect(spy.sampleRate).toBe(48000);
  });

  it('converts library milliseconds into seconds', async () => {
    givenDetected([
      { start: 1500, end: 3250 },
      { start: 4000, end: 4500 },
    ]);
    const segments = await detectSpeech(new Int16Array(16), 16000);

    expect(segments).toEqual([
      { start: 1.5, end: 3.25 },
      { start: 4, end: 4.5 },
    ]);
  });

  it('returns segments in ascending start order', async () => {
    givenDetected([
      { start: 9000, end: 9500 },
      { start: 1000, end: 1500 },
      { start: 5000, end: 5500 },
    ]);
    const segments = await detectSpeech(new Int16Array(16), 16000);

    expect(segments.map((s) => s.start)).toEqual([1, 5, 9]);
    expect(segments.map((s) => s.end)).toEqual([1.5, 5.5, 9.5]);
  });

  it('brands its output as AbsoluteSeconds', async () => {
    givenDetected([{ start: 2000, end: 4000 }]);
    const segments = await detectSpeech(new Int16Array(16), 16000);

    const start: AbsoluteSeconds = segments[0].start;
    const end: AbsoluteSeconds = segments[0].end;
    expect(start).toBe(2);
    expect(end).toBe(4);
  });

  it('returns an empty array when the VAD finds no speech', async () => {
    givenDetected([]);
    const segments = await detectSpeech(new Int16Array(16000 * 5), 16000);

    expect(segments).toEqual([]);
  });

  it('passes the narration-tuned thresholds and frame counts to the VAD', async () => {
    givenDetected([]);
    await detectSpeech(new Int16Array(16), 16000);

    expect(spy.options).toMatchObject({
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechMs: MIN_SPEECH_FRAMES * MS_PER_FRAME,
      redemptionMs: REDEMPTION_FRAMES * MS_PER_FRAME,
      preSpeechPadMs: PRE_SPEECH_PAD_FRAMES * MS_PER_FRAME,
    });
    expect(MS_PER_FRAME).toBe(96);
    expect(spy.options.minSpeechMs).toBe(384);
    expect(spy.options.redemptionMs).toBe(1152);
    expect(spy.options.preSpeechPadMs).toBe(480);
  });

  it('lets a caller override asset locations without changing the tuning', async () => {
    givenDetected([]);
    const ortConfig = vi.fn();
    await createSpeechDetector({ modelURL: 'chrome-extension://abc/silero.onnx', ortConfig })(
      new Int16Array(16),
      16000,
    );

    expect(spy.options).toMatchObject({
      modelURL: 'chrome-extension://abc/silero.onnx',
      ortConfig,
      positiveSpeechThreshold: 0.5,
    });
  });
});
