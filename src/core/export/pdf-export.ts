import { jsPDF } from 'jspdf';
import { i18n } from '#imports';
import { fitLogo, loadBranding } from '@/core/export/branding';
import { type ExportOptions, IMAGE_SCALE_FACTORS, loadExportOptions } from '@/core/export/options';
import { blobToDataUrl, extractDomain, fitImage, formatDate } from '@/core/export/utils';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { hexToRgb } from '@/core/screenshot/color';
import { resolveViewport } from '@/core/screenshot/geometry';
import { renderScreenshot } from '@/core/screenshot/render';
import { logger } from '@/lib/logger';

const JPEG_QUALITY = 0.85;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18.5;
const CONTENT_W = PAGE_W - MARGIN * 2;
const NUM_COL = 22;
const COL_GAP = 8;
const TEXT_COL = CONTENT_W - NUM_COL - COL_GAP;
const TEXT_X = MARGIN + NUM_COL + COL_GAP;
const RIGHT = PAGE_W - MARGIN;
const FOOTER_Y = PAGE_H - 24;
const HEAD_BOTTOM = MARGIN + 6;
const STEP_TOP = MARGIN + 20;
const STEP_GAP = 13;
const LOGO_MAX_W = 34;
const LOGO_MAX_H = 15;
const HEAD_LOGO_W = 18;
const HEAD_LOGO_H = 7;
const META_COL_W = 43;
const META_DROP = 9;

const INK: [number, number, number] = [30, 27, 75];
const MUTED: [number, number, number] = [107, 114, 128];
const HAIR: [number, number, number] = [229, 231, 235];

export async function exportGuideAsPDF(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
  options?: ExportOptions,
): Promise<Blob> {
  const opts = options ?? (await loadExportOptions());
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const domain = extractDomain(steps);
  const brand = await loadBranding();
  const accent = hexToRgb(brand.accent) ?? [79, 70, 229];
  const logo = brand.logo ? fitLogo(brand.logo, LOGO_MAX_W, LOGO_MAX_H) : null;
  const headLogo = !opts.cover && brand.logo ? fitLogo(brand.logo, HEAD_LOGO_W, HEAD_LOGO_H) : null;
  const headRight = headLogo ? RIGHT - headLogo.width - 4 : RIGHT;
  const imgWidth = TEXT_COL * IMAGE_SCALE_FACTORS[opts.imageScale];
  if (opts.cover) {
    if (brand.logo && logo) {
      try {
        doc.addImage(brand.logo.dataUrl, 'PNG', RIGHT - logo.width, MARGIN, logo.width, logo.height);
      } catch (err) {
        logger.warn('PDF: failed to draw brand logo', err);
      }
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(i18n.t('export.guideLabel'), MARGIN, MARGIN + 4, { charSpace: 0.6 });

    doc.setFontSize(30);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(guide.title, CONTENT_W * 0.82);
    doc.text(titleLines, MARGIN, MARGIN + 26);

    const y = MARGIN + 26 + (titleLines.length - 1) * 11 + 8;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, RIGHT, y);

    const yLabel = y + 12;
    const yValue = yLabel + META_DROP;
    const drawLabel = (text: string, x: number) => {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MUTED);
      doc.text(text, x, yLabel, { charSpace: 0.4 });
    };

    drawLabel(i18n.t('export.steps').toUpperCase(), MARGIN);
    doc.setFontSize(30);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text(String(steps.length).padStart(2, '0'), MARGIN, yValue);

    drawLabel(i18n.t('export.created').toUpperCase(), MARGIN + META_COL_W);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    doc.text(formatDate(guide.createdAt), MARGIN + META_COL_W, yValue);

    if (domain) {
      const x = MARGIN + META_COL_W * 2;
      drawLabel(i18n.t('export.source').toUpperCase(), x);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...accent);
      doc.textWithLink(domain, x, yValue, { url: `https://${domain}` });
    }
  }
  const pageSteps: number[][] = [];
  const coverPages = opts.cover ? 1 : 0;

  const startStepPage = () => {
    if (coverPages > 0 || pageSteps.length > 0) doc.addPage();
    pageSteps.push([]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(guide.title, CONTENT_W * 0.7)[0], MARGIN, MARGIN + 3);
    if (brand.logo && headLogo) {
      try {
        doc.addImage(
          brand.logo.dataUrl,
          'PNG',
          RIGHT - headLogo.width,
          HEAD_BOTTOM - 1.5 - headLogo.height,
          headLogo.width,
          headLogo.height,
        );
      } catch (err) {
        logger.warn('PDF: failed to draw brand logo in running head', err);
      }
    }
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, HEAD_BOTTOM, RIGHT, HEAD_BOTTOM);
    return STEP_TOP;
  };

  let sy = startStepPage();

  for (const step of steps) {
    const stepNum = String(step.index + 1).padStart(2, '0');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const descLines = doc.splitTextToSize(step.description, TEXT_COL);

    const screenshot = opts.screenshots ? screenshots.get(step.id) : undefined;
    let imgDataUrl: string | null = null;
    let imgHeight = 0;
    let stepImgWidth = imgWidth;
    const textOverhead = 6 + descLines.length * 5 + 4;
    if (screenshot) {
      try {
        const rendered = await renderScreenshot(screenshot, { format: 'image/jpeg', quality: JPEG_QUALITY });
        imgDataUrl = await blobToDataUrl(rendered);
        const viewport = resolveViewport(screenshot);
        const fitted = fitImage(
          imgWidth,
          (viewport.height / viewport.width) * imgWidth,
          FOOTER_Y - 8 - STEP_TOP - textOverhead,
        );
        stepImgWidth = fitted.width;
        imgHeight = fitted.height;
      } catch (err) {
        logger.warn('PDF: failed to load screenshot for step', step.index, err);
      }
    }

    const blockH = textOverhead + imgHeight;
    if (sy + blockH > FOOTER_Y - 8 && sy > STEP_TOP) {
      sy = startStepPage();
    }
    pageSteps[pageSteps.length - 1].push(step.index + 1);

    doc.setFontSize(30);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text(stepNum, MARGIN, sy + 8);

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(TEXT_X, sy, RIGHT, sy);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(descLines, TEXT_X, sy + 6);

    let ux = TEXT_X + doc.getTextWidth(descLines[descLines.length - 1]);
    let uy = sy + 6 + (descLines.length - 1) * 5;

    if (step.url && opts.stepUrls) {
      const label = stepUrlLabel(step.url);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const sep = '   ·   ';
      const sepW = doc.getTextWidth(sep);
      const urlW = doc.getTextWidth(label);
      if (ux + sepW + urlW > RIGHT) {
        ux = TEXT_X;
        uy += 5;
      } else {
        doc.setTextColor(...MUTED);
        doc.text(sep, ux, uy);
        ux += sepW;
      }
      doc.setTextColor(...accent);
      doc.textWithLink(label, ux, uy, { url: step.url });
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.2);
      doc.line(ux, uy + 0.9, ux + urlW, uy + 0.9);
    }

    let iy = uy + 4;
    if (imgDataUrl) {
      doc.addImage(imgDataUrl, 'JPEG', TEXT_X, iy, stepImgWidth, imgHeight);
      const altText = screenshot?.edits?.alt || i18n.t('export.stepLabel', [stepNum]);
      doc.text(doc.splitTextToSize(altText, stepImgWidth), TEXT_X, iy + 4, { renderingMode: 'invisible' });
      iy += imgHeight;
    }
    sy = iy + STEP_GAP;
  }
  const totalPages = doc.getNumberOfPages();
  const attribution = brand.attribution ? i18n.t('export.madeWith') : '';
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);

    const onPage = pageSteps[p - 1 - coverPages];
    if (onPage?.length) {
      const range =
        onPage.length > 1
          ? i18n.t('export.stepsRange', [String(onPage[0]), String(onPage[onPage.length - 1]), String(steps.length)])
          : i18n.t('export.stepOf', [String(onPage[0]), String(steps.length)]);
      doc.text(range, headRight, MARGIN + 3, { align: 'right' });
    }

    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, FOOTER_Y, RIGHT, FOOTER_Y);
    const fy = FOOTER_Y + 4;
    if (brand.footer) doc.text(brand.footer, MARGIN, fy);
    if (attribution) doc.text(attribution, PAGE_W / 2, fy, { align: 'center' });
    doc.text(`${p} / ${totalPages}`, RIGHT, fy, { align: 'right' });
  }

  return doc.output('blob');
}

function stepUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const label = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    return label.length > 64 ? `${label.slice(0, 63)}…` : label;
  } catch {
    return url;
  }
}
