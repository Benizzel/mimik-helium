import { i18n } from '#imports';
import { blobToBase64, escapeHtml, extractDomain, fetchFaviconBase64, formatDate } from '@/core/export/utils';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { renderScreenshot } from '@/core/screenshot/render';

export async function exportGuideAsHTML(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
): Promise<string> {
  const stepSections: string[] = [];

  for (const step of steps) {
    const screenshot = screenshots.get(step.id);
    let imgHtml = '';
    if (screenshot) {
      const b64 = await blobToBase64(await renderScreenshot(screenshot));
      const altText = screenshot.edits?.alt || i18n.t('export.stepLabel', [String(step.index + 1)]);
      imgHtml = `<img src="data:${screenshot.mimeType};base64,${b64}" alt="${escapeHtml(altText)}" style="max-width:100%;border-radius:8px;box-shadow:0 1px 4px rgba(30,27,75,0.06);margin-top:16px;" />`;
    }

    const stepNumber = String(step.index + 1).padStart(2, '0');

    stepSections.push(`
      <div style="border-top:2px solid #C7D2FE;padding-top:24px;margin-bottom:40px;">
        <div style="display:flex;gap:16px;align-items:flex-start;">
          <span style="font-size:32px;font-weight:700;color:#818CF8;line-height:1;flex-shrink:0;min-width:48px;">${stepNumber}</span>
          <div style="flex:1;min-width:0;">
            <p style="margin:0;font-size:16px;line-height:1.6;color:#1E1B4B;">${escapeHtml(step.description)}</p>
            ${imgHtml}
          </div>
        </div>
      </div>`);
  }

  const domain = extractDomain(steps);
  const favicon = domain ? await fetchFaviconBase64(domain) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(guide.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Poppins', sans-serif; max-width: 800px; margin: 0 auto; padding: 48px 24px; color: #1E1B4B; background: #fff; }
  </style>
</head>
<body>
  <div style="margin-bottom:48px;text-align:center;display:flex;flex-direction:column;align-items:center;">
    <span style="display:inline-block;background:#EEF2FF;color:#4F46E5;font-size:13px;font-weight:600;padding:5px 16px;border-radius:999px;">${i18n.t('export.stepsCount', [String(steps.length)])}</span>
    <div style="height:3px;width:60%;background:linear-gradient(to right,#4F46E5,#C7D2FE,#818CF8);border-radius:3px;margin:20px auto;"></div>
    <h1 style="font-size:28px;font-weight:800;color:#1E1B4B;line-height:1.2;margin-bottom:24px;max-width:80%;">${escapeHtml(guide.title)}</h1>
    <div style="display:flex;gap:32px;justify-content:center;">
      <div style="text-align:left;">
        <div style="font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">${i18n.t('export.created')}</div>
        <div style="font-size:14px;font-weight:600;color:#1E1B4B;">${formatDate(guide.createdAt)}</div>
      </div>
      ${
        domain
          ? `<div style="text-align:left;">
        <div style="font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">${i18n.t('export.source')}</div>
        <a href="https://${escapeHtml(domain)}" target="_blank" rel="noopener" style="font-size:14px;font-weight:600;color:#4F46E5;display:flex;align-items:center;gap:6px;text-decoration:none;">${favicon ? `<img src="${favicon}" width="18" height="18" style="border-radius:4px;" />` : ''}${escapeHtml(domain)}</a>
      </div>`
          : ''
      }
    </div>
  </div>

  ${stepSections.join('\n')}
</body>
</html>`;
}
