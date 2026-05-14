import { AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import { i18n } from '#imports';
import { blobToArrayBuffer, extractDomain, formatDate } from '@/core/export/utils';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { logger } from '@/lib/logger';

type SupportedDocxImageType = 'bmp' | 'gif' | 'jpg' | 'png';

const DOCX_MAX_IMAGE_WIDTH = 520;

function getDocxImageType(mimeType: string): SupportedDocxImageType | null {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    default:
      return null;
  }
}

async function buildImageParagraph(screenshot: Screenshot, stepIndex: number): Promise<Paragraph | null> {
  const imageType = getDocxImageType(screenshot.mimeType);
  if (!imageType) {
    logger.warn('DOCX: unsupported screenshot mime type', screenshot.mimeType, 'for step', stepIndex);
    return null;
  }

  try {
    const arrayBuffer = await blobToArrayBuffer(screenshot.blob);
    const width = Math.min(screenshot.width, DOCX_MAX_IMAGE_WIDTH);
    const height = Math.max(1, Math.round((screenshot.height / screenshot.width) * width));

    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [
        new ImageRun({
          type: imageType,
          data: new Uint8Array(arrayBuffer),
          transformation: { width, height },
        }),
      ],
    });
  } catch (err) {
    logger.warn('DOCX: failed to load screenshot for step', stepIndex, err);
    return null;
  }
}

export async function exportGuideAsDOCX(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
): Promise<Blob> {
  const domain = extractDomain(steps);
  const meta = [
    i18n.t('export.stepsCount', [String(steps.length)]),
    i18n.t('export.createdLabel', [formatDate(guide.createdAt)]),
    ...(domain ? [i18n.t('export.sourceLabel', [domain])] : []),
  ].join(' · ');

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [
        new TextRun({ text: i18n.t('export.stepsCount', [String(steps.length)]), bold: true, color: '4F46E5' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [new TextRun({ text: guide.title, bold: true, size: 36, color: '1E1B4B' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: steps.length > 0 ? 360 : 0 },
      children: [new TextRun({ text: meta, italics: true, color: '6B7280' })],
    }),
  ];

  for (const step of steps) {
    const stepNumber = String(step.index + 1).padStart(2, '0');

    children.push(
      new Paragraph({
        border: {
          top: {
            color: 'C7D2FE',
            size: 6,
            space: 1,
            style: BorderStyle.SINGLE,
          },
        },
        spacing: { before: 240, after: 100 },
        children: [
          new TextRun({
            text: i18n.t('export.stepLabel', [stepNumber]),
            bold: true,
            color: '818CF8',
            size: 24,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: step.description, color: '1E1B4B', size: 24 })],
      }),
    );

    const screenshot = screenshots.get(step.id);
    if (screenshot) {
      const imageParagraph = await buildImageParagraph(screenshot, step.index);
      if (imageParagraph) {
        children.push(imageParagraph);
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
