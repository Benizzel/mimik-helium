import type { ScreenshotBounds } from '@/core/guides/types';

export type TargetBorder = 'dashed' | 'solid';

export const TARGET_COLORS = [
  '#4F46E5',
  '#F43F5E',
  '#EC4899',
  '#A855F7',
  '#3B82F6',
  '#14B8A6',
  '#22C55E',
  '#EAB308',
] as const;

export const DEFAULT_TARGET_COLOR = '#4F46E5';

export interface ClickTarget extends ScreenshotBounds {
  border: TargetBorder;
  color: string;
}

export type Annotation =
  | { id: string; type: 'box'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { id: string; type: 'freehand'; points: number[]; color: string }
  | { id: string; type: 'redact'; x: number; y: number; w: number; h: number; style: 'blur' | 'solid' }
  | { id: string; type: 'target'; x: number; y: number; w: number; h: number; color: string; border: TargetBorder };

export interface ScreenshotEdits {
  viewport?: ScreenshotBounds;
  target?: ClickTarget | null;
  annotations?: Annotation[];
  alt?: string;
}
