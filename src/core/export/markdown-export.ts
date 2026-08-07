import { i18n } from '#imports';
import { blobToBase64, extractDomain, formatDate } from '@/core/export/utils';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { renderScreenshot } from '@/core/screenshot/render';

export async function exportGuideAsMarkdown(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
): Promise<string> {
  const domain = extractDomain(steps);
  const meta = [
    i18n.t('export.stepsCount', [String(steps.length)]),
    i18n.t('export.createdLabel', [formatDate(guide.createdAt)]),
    ...(domain ? [i18n.t('export.sourceLabel', [domain])] : []),
  ].join(' · ');

  const lines: string[] = [`# ${guide.title}`, ''];
  if (guide.description) lines.push(guide.description, '');
  lines.push(`*${meta}*`, '', '---', '');

  for (const step of steps) {
    const num = String(step.index + 1).padStart(2, '0');
    lines.push(`## ${i18n.t('export.stepLabel', [num])}: ${step.description}`, '');

    const screenshot = screenshots.get(step.id);
    if (screenshot) {
      const b64 = await blobToBase64(await renderScreenshot(screenshot));
      const altText = screenshot.edits?.alt || i18n.t('export.stepLabel', [num]);
      lines.push(`![${altText}](data:${screenshot.mimeType};base64,${b64})`, '');
    }
  }

  return lines.join('\n');
}
