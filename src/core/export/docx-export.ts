import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { i18n } from '#imports';
import { blobToArrayBuffer, extractDomain, formatDate } from '@/core/export/utils';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { logger } from '@/lib/logger';

type SupportedDocxImageType = 'bmp' | 'gif' | 'jpg' | 'png';

const DOCX_MAX_IMAGE_WIDTH = 520;
const DOCX_MAX_IMAGE_HEIGHT = 640; // px @ 96dpi, fits one page after margins
const DOCX_STEP_INDENT = 900;
const DOCX_FONT_FAMILY = 'Helvetica';

/** Scale screenshot to fit page bounds without upscaling or distorting. */
export function fitDocxImageSize(
  screenshotWidth: number,
  screenshotHeight: number,
  leftIndent = 0,
): { width: number; height: number } {
  const maxWidth = DOCX_MAX_IMAGE_WIDTH - Math.round(leftIndent / 20);
  const scale = Math.min(maxWidth / screenshotWidth, DOCX_MAX_IMAGE_HEIGHT / screenshotHeight, 1);
  return {
    width: Math.max(1, Math.round(screenshotWidth * scale)),
    height: Math.max(1, Math.round(screenshotHeight * scale)),
  };
}

function buildGradientDividerParagraph(): Paragraph {
  const gradientSegments = ['4F46E5', '635BED', '8178F4', 'A4A1F9', 'C7D2FE', '9BD2FE', '60C8FB', '38BDF8'];

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
    children: gradientSegments.map(
      (color) =>
        new TextRun({
          text: '--------',
          font: DOCX_FONT_FAMILY,
          color,
          bold: true,
          size: 16,
        }),
    ),
  });
}

function buildMetaTable(guide: Guide, domain: string | null): Table {
  const baseCell = {
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    margins: { top: 0, bottom: 0, left: 80, right: 80 },
  };

  return new Table({
    width: { size: 70, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            ...baseCell,
            width: { size: domain ? 50 : 100, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: i18n.t('export.created').toUpperCase(),
                    font: DOCX_FONT_FAMILY,
                    bold: true,
                    color: '6B7280',
                    size: 14,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({ text: formatDate(guide.createdAt), font: DOCX_FONT_FAMILY, color: '1E1B4B', size: 24 }),
                ],
              }),
            ],
          }),
          ...(domain
            ? [
                new TableCell({
                  ...baseCell,
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      spacing: { after: 40 },
                      children: [
                        new TextRun({
                          text: i18n.t('export.source').toUpperCase(),
                          font: DOCX_FONT_FAMILY,
                          bold: true,
                          color: '6B7280',
                          size: 14,
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      children: [new TextRun({ text: domain, font: DOCX_FONT_FAMILY, color: '4F46E5', size: 24 })],
                    }),
                  ],
                }),
              ]
            : []),
        ],
      }),
    ],
  });
}

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

async function buildImageParagraph(
  screenshot: Screenshot,
  stepIndex: number,
  leftIndent = 0,
): Promise<Paragraph | null> {
  const imageType = getDocxImageType(screenshot.mimeType);
  if (!imageType) {
    logger.warn('DOCX: unsupported screenshot mime type', screenshot.mimeType, 'for step', stepIndex);
    return null;
  }

  try {
    const arrayBuffer = await blobToArrayBuffer(screenshot.blob);
    const { width, height } = fitDocxImageSize(screenshot.width, screenshot.height, leftIndent);

    return new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: leftIndent },
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
  const coverChildren: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3300, after: 200 },
      children: [
        new TextRun({
          text: i18n.t('export.stepsCount', [String(steps.length)]),
          font: DOCX_FONT_FAMILY,
          bold: true,
          color: '4F46E5',
          size: 20,
        }),
      ],
    }),
    buildGradientDividerParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [new TextRun({ text: guide.title, font: DOCX_FONT_FAMILY, bold: true, size: 44, color: '1E1B4B' })],
    }),
    buildMetaTable(guide, domain),
    new Paragraph({ spacing: { after: 420 } }),
  ];

  const children: Array<Paragraph | Table> = [...coverChildren];

  if (steps.length > 0) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
      }),
    );
  }

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
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: '', font: DOCX_FONT_FAMILY })],
      }),
      new Paragraph({
        indent: { left: DOCX_STEP_INDENT / 2 },
        spacing: { after: 180 },
        children: [
          new TextRun({ text: stepNumber, font: DOCX_FONT_FAMILY, bold: true, color: '818CF8', size: 32 }),
          new TextRun({ text: '   ', font: DOCX_FONT_FAMILY }),
          new TextRun({ text: step.description, font: DOCX_FONT_FAMILY, color: '1E1B4B', size: 24 }),
        ],
      }),
    );

    const screenshot = screenshots.get(step.id);
    if (screenshot) {
      const imageParagraph = await buildImageParagraph(screenshot, step.index, DOCX_STEP_INDENT / 2);
      if (imageParagraph) {
        children.push(imageParagraph);
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: DOCX_FONT_FAMILY,
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
