import type { Screenshot, Step } from '@/core/guides/types';

export function stepRequiresManual(step: Step, screenshot: Screenshot | null | undefined): boolean {
  if (!step.elementMeta) return true;
  if (!screenshot) return false;
  if (screenshot.edits?.requiresManual === true) return true;
  return screenshot.edits?.target === null && Boolean(screenshot.bounds);
}
