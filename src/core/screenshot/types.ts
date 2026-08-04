import type { ScreenshotBounds } from '@/core/guides/types';

export type TargetShape = 'circle' | 'rect';

export const TARGET_COLORS = [
  '#F43F5E',
  '#EC4899',
  '#A855F7',
  '#3B82F6',
  '#14B8A6',
  '#22C55E',
  '#EAB308',
  '#F97316',
] as const;

export const DEFAULT_TARGET_COLOR = '#F97316';

export interface ClickTarget extends ScreenshotBounds {
  shape: TargetShape;
  color: string;
}

export type Annotation =
  | { id: string; type: 'box'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { id: string; type: 'freehand'; points: number[]; color: string }
  | { id: string; type: 'redact'; x: number; y: number; w: number; h: number; style: 'blur' | 'solid' }
  | { id: string; type: 'target'; x: number; y: number; w: number; h: number; color: string; shape: TargetShape };

export interface ScreenshotEdits {
  viewport?: ScreenshotBounds;
  target?: ClickTarget | null;
  annotations?: Annotation[];
  alt?: string;
}
