import { FileCode, FileDown, FileText, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { i18n } from '#imports';
import { downloadBlob, downloadText, safeFilename } from '@/core/export/download';
import { exportGuideAsHTML } from '@/core/export/html-export';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
  type ImageScale,
  loadExportOptions,
  saveExportOptions,
} from '@/core/export/options';
import { exportGuideAsPDF } from '@/core/export/pdf-export';
import { paginatePreview, withPreviewStyles } from '@/core/export/preview';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { Button } from '@/ui/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/components/ui/dialog';

const PREVIEW_STEP_LIMIT = 6;
const IMAGE_SCALES: ImageScale[] = ['small', 'medium', 'large'];

interface ExportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guide: Guide;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
}

type ExportFormat = 'docx' | 'html' | 'markdown' | 'pdf';

export default function ExportPreviewModal({ open, onOpenChange, guide, steps, screenshots }: ExportPreviewModalProps) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [preview, setPreview] = useState('');
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    if (open) loadExportOptions().then(setOptions);
  }, [open]);

  const previewSteps = useMemo(() => steps.slice(0, PREVIEW_STEP_LIMIT), [steps]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRendering(true);
    const timer = setTimeout(async () => {
      const html = await exportGuideAsHTML(guide, previewSteps, screenshots, options);
      if (cancelled) return;
      setPreview(withPreviewStyles(html));
      setRendering(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, guide, previewSteps, screenshots, options]);

  const update = (patch: Partial<ExportOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    void saveExportOptions(next);
  };

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    try {
      if (format === 'html') {
        const html = await exportGuideAsHTML(guide, steps, screenshots, options);
        downloadText(html, safeFilename(guide.title, 'html'), 'text/html');
      } else if (format === 'pdf') {
        downloadBlob(await exportGuideAsPDF(guide, steps, screenshots, options), safeFilename(guide.title, 'pdf'));
      } else if (format === 'docx') {
        const { exportGuideAsDOCX } = await import('@/core/export/docx-export');
        downloadBlob(await exportGuideAsDOCX(guide, steps, screenshots, options), safeFilename(guide.title, 'docx'));
      } else {
        const { exportGuideAsMarkdown } = await import('@/core/export/markdown-export');
        const md = await exportGuideAsMarkdown(guide, steps, screenshots);
        downloadText(md, safeFilename(guide.title, 'md'), 'text/markdown');
      }
    } finally {
      setExporting(null);
    }
  }

  const toggles: Array<{ key: keyof ExportOptions; label: string; hint: string }> = [
    { key: 'cover', label: i18n.t('exportPreview.cover'), hint: i18n.t('exportPreview.coverHint') },
    { key: 'screenshots', label: i18n.t('exportPreview.screenshots'), hint: i18n.t('exportPreview.screenshotsHint') },
    { key: 'stepUrls', label: i18n.t('exportPreview.stepUrls'), hint: i18n.t('exportPreview.stepUrlsHint') },
  ];

  const formats: Array<{ key: ExportFormat; icon: typeof FileText; label: string }> = [
    { key: 'pdf', icon: FileDown, label: i18n.t('exportMenu.pdf') },
    { key: 'docx', icon: FileText, label: i18n.t('exportMenu.docx') },
    { key: 'html', icon: FileCode, label: i18n.t('exportMenu.html') },
    { key: 'markdown', icon: FileText, label: i18n.t('exportMenu.markdown') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[1180px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b border-border">
          <DialogTitle className="text-[15px] font-bold">{i18n.t('exportPreview.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex h-[74vh] min-h-[420px]">
          <div className="w-[268px] shrink-0 border-r border-border p-4 space-y-4 overflow-y-auto">
            <div className="space-y-3">
              {toggles.map(({ key, label, hint }) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-semibold text-foreground">{label}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug">{hint}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={Boolean(options[key])}
                    onClick={() => update({ [key]: !options[key] } as Partial<ExportOptions>)}
                    className={`w-9 h-5 rounded-full transition-colors relative shrink-0 mt-0.5 ${
                      options[key] ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        options[key] ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className={`pt-3 border-t border-border ${options.screenshots ? '' : 'opacity-45'}`}>
              <div className="text-[12px] font-semibold text-foreground mb-2">{i18n.t('exportPreview.imageScale')}</div>
              <div className="flex gap-1.5">
                {IMAGE_SCALES.map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    disabled={!options.screenshots}
                    onClick={() => update({ imageScale: scale })}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-[11px] transition-colors disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground ${
                      options.imageScale === scale
                        ? 'border-accent text-accent'
                        : 'border-border text-muted-foreground hover:border-accent hover:text-foreground'
                    }`}
                  >
                    {i18n.t(`exportPreview.scale_${scale}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-1.5">
              {formats.map(({ key, icon: Icon, label }) => (
                <Button
                  key={key}
                  size="sm"
                  variant="ghost"
                  disabled={exporting !== null}
                  onClick={() => handleExport(key)}
                  className="w-full justify-start gap-2 border border-border hover:border-accent"
                >
                  {exporting === key ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                  {i18n.t('exportPreview.download', [label])}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-[#3F3F46] relative overflow-hidden">
            {rendering && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-card border border-border rounded-full px-2.5 py-1">
                <Loader2 size={11} className="animate-spin" />
                {i18n.t('exportPreview.rendering')}
              </div>
            )}
            <iframe
              title={i18n.t('exportPreview.title')}
              srcDoc={preview}
              onLoad={(event) => {
                const doc = event.currentTarget.contentDocument;
                if (doc) paginatePreview(doc);
              }}
              className="w-full h-full border-0"
            />
            {steps.length > PREVIEW_STEP_LIMIT && (
              <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-muted-foreground bg-card/95 border-t border-border py-1.5">
                {i18n.t('exportPreview.truncated', [String(PREVIEW_STEP_LIMIT), String(steps.length)])}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
