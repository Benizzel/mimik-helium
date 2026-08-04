import { jsPDF } from 'jspdf';
import { i18n } from '#imports';
import { blobToDataUrl, extractDomain, fetchFaviconBase64, formatDate } from '@/core/export/utils';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { resolveViewport } from '@/core/screenshot/geometry';
import { renderScreenshot } from '@/core/screenshot/render';
import { logger } from '@/lib/logger';

const JPEG_QUALITY = 0.85;

export async function exportGuideAsPDF(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  const centerX = pageWidth / 2;
  const domain = extractDomain(steps);
  const dateStr = formatDate(guide.createdAt);
  const faviconDataUrl = domain ? await fetchFaviconBase64(domain) : null;

  const badgeText = i18n.t('export.stepsCount', [String(steps.length)]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const badgeTextWidth = doc.getTextWidth(badgeText);
  const badgePadH = 5;
  const badgeW = badgeTextWidth + badgePadH * 2;
  const badgeH = 7;

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(guide.title, contentWidth * 0.8);
  const titleBlockH = titleLines.length * 9;

  const gradLineW = contentWidth * 0.6;
  const totalBlockH = badgeH + 8 + 1.5 + 10 + titleBlockH + 16 + 12;
  let y = (pageHeight - totalBlockH) / 2;

  doc.setFillColor(238, 242, 255);
  doc.roundedRect(centerX - badgeW / 2, y, badgeW, badgeH, 3.5, 3.5, 'F');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text(badgeText, centerX, y + 5, { align: 'center' });
  y += badgeH + 8;

  const gradX = centerX - gradLineW / 2;
  const gradStops = [
    [79, 70, 229],
    [99, 91, 237],
    [129, 120, 244],
    [164, 161, 249],
    [199, 210, 254],
    [155, 210, 254],
    [96, 200, 251],
    [56, 189, 248],
  ] as const;
  const segW = gradLineW / gradStops.length;
  for (let i = 0; i < gradStops.length; i++) {
    const [r, g, b] = gradStops[i];
    doc.setFillColor(r, g, b);
    doc.rect(gradX + segW * i, y, segW + 0.2, 1.5, 'F');
  }
  y += 10;

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 27, 75);
  doc.text(titleLines, centerX, y, { align: 'center' });
  y += titleBlockH + 16;

  const metaColW = 40;
  const metaGap = 16;
  const numCols = domain ? 2 : 1;
  const metaTotalW = numCols * metaColW + (numCols - 1) * metaGap;
  let metaX = centerX - metaTotalW / 2;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text(i18n.t('export.created').toUpperCase(), metaX, y);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 27, 75);
  doc.text(dateStr, metaX, y + 6);

  if (domain) {
    metaX += metaColW + metaGap;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(107, 114, 128);
    doc.text(i18n.t('export.source').toUpperCase(), metaX, y);
    const faviconSize = 4;
    let domainTextX = metaX;
    if (faviconDataUrl) {
      try {
        doc.addImage(faviconDataUrl, 'PNG', metaX, y + 2.5, faviconSize, faviconSize);
        domainTextX = metaX + faviconSize + 2;
      } catch {
        domainTextX = metaX;
      }
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(79, 70, 229);
    doc.textWithLink(domain, domainTextX, y + 6, { url: `https://${domain}` });
  }

  const stepIndent = 16;
  const maxImgHeight = 90;
  const stepSpacing = 6;

  doc.addPage();
  y = margin;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    const descWidth = contentWidth - stepIndent;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(step.description, descWidth);
    const descHeight = descLines.length * 5;

    const screenshot = screenshots.get(step.id);
    let imgDataUrl: string | null = null;
    const imgWidth = contentWidth - stepIndent;
    let imgHeight = 0;

    if (screenshot) {
      try {
        const rendered = await renderScreenshot(screenshot, { format: 'image/jpeg', quality: JPEG_QUALITY });
        imgDataUrl = await blobToDataUrl(rendered);
        const viewport = resolveViewport(screenshot);
        imgHeight = Math.min((viewport.height / viewport.width) * imgWidth, maxImgHeight);
      } catch (err) {
        logger.warn('PDF: failed to load screenshot for step', step.index, err);
      }
    }

    const stepBlockHeight = 6 + descHeight + 6 + imgHeight + stepSpacing;

    if (y + stepBlockHeight > pageHeight - margin && y > margin) {
      doc.addPage();
      y = margin;
    }

    doc.setDrawColor(199, 210, 254);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    y += 6;

    const stepNum = String(step.index + 1).padStart(2, '0');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(129, 140, 248);
    doc.text(stepNum, margin, y + 4);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 27, 75);
    doc.text(descLines, margin + stepIndent, y + 4);
    y += descHeight + 6;

    if (imgDataUrl) {
      if (y + imgHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }

      doc.addImage(imgDataUrl, 'JPEG', margin + stepIndent, y, imgWidth, imgHeight);
      y += imgHeight + stepSpacing;
    } else {
      y += stepSpacing;
    }
  }

  const totalPages = doc.getNumberOfPages();
  const stepPages = totalPages - 1;
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`${p - 1} of ${stepPages}`, pageWidth - margin, pageHeight - margin, { align: 'right' });
  }

  return doc.output('blob');
}
