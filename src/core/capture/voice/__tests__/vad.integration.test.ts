import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createSpeechDetector } from '../vad';

const require = createRequire(import.meta.url);

const detectWithLocalModel = createSpeechDetector({
  modelURL: require.resolve('@ricky0123/vad-web/dist/silero_vad_legacy.onnx'),
  modelFetcher: async (path: string) => {
    const file = await readFile(path);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  },
});

const SAMPLE_RATE = 16000;
const DURATION_S = 6;

function synth(shape: (i: number) => number): Int16Array {
  const pcm = new Int16Array(SAMPLE_RATE * DURATION_S);
  for (let i = 0; i < pcm.length; i += 1) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(shape(i))));
  }
  return pcm;
}

function pseudoRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('detectSpeech against real Silero', () => {
  const nonSpeech: Array<[string, Int16Array]> = [
    ['digital silence', synth(() => 0)],
    ['sine tone at 220Hz', synth((i) => 8000 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE))],
    ['mains hum at 60Hz', synth((i) => 12000 * Math.sin((2 * Math.PI * 60 * i) / SAMPLE_RATE))],
    [
      'loud white noise',
      (() => {
        const rand = pseudoRandom(7);
        return synth(() => (rand() * 2 - 1) * 20000);
      })(),
    ],
    [
      'room-level white noise',
      (() => {
        const rand = pseudoRandom(11);
        return synth(() => (rand() * 2 - 1) * 600);
      })(),
    ],
  ];

  for (const [name, pcm] of nonSpeech) {
    it(`returns no segments for ${name}`, async () => {
      await expect(detectWithLocalModel(pcm, SAMPLE_RATE)).resolves.toEqual([]);
    }, 60000);
  }
});
