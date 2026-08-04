import type { ScreenshotBounds } from '@/core/guides/types';

export type Annotation =
  | { id: string; type: 'box'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { id: string; type: 'freehand'; points: number[]; color: string }
  | { id: string; type: 'redact'; x: number; y: number; w: number; h: number; style: 'blur' | 'solid' };

export interface ScreenshotEdits {
  viewport?: ScreenshotBounds;
  target?: ScreenshotBounds | null;
  annotations?: Annotation[];
  alt?: string;
}
