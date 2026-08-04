import { Download, FileCode, FileDown, FileText, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { exportGuideAsHTML } from '@/core/export/html-export';
import { exportGuideAsMarkdown } from '@/core/export/markdown-export';
import { exportGuideAsPDF } from '@/core/export/pdf-export';
import { getGuide } from '@/core/guides/service';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { Button } from '@/ui/components/ui/button';

interface ExportMenuProps {
  guideId: string;
  guide: Guide;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({
  guideId,
  guide: guideProp,
  steps: stepsProp,
  screenshots: screenshotsProp,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleExport(type: 'html' | 'markdown' | 'pdf') {
    setOpen(false);
    setExporting(true);
    try {
      const fresh = await getGuide(guideId);
      const guide = fresh?.guide ?? guideProp;
      const steps = fresh?.steps ?? stepsProp;
      const screenshots = fresh?.screenshots ?? screenshotsProp;

      if (type === 'html') {
        const html = await exportGuideAsHTML(guide, steps, screenshots);
        downloadFile(html, `${guide.title}.html`, 'text/html');
      } else if (type === 'markdown') {
        const md = await exportGuideAsMarkdown(guide, steps, screenshots);
        downloadFile(md, `${guide.title}.md`, 'text/markdown');
      } else {
        const blob = await exportGuideAsPDF(guide, steps, screenshots);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${guide.title}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }

  const items = [
    { type: 'html' as const, icon: FileCode, label: i18n.t('exportMenu.html') },
    { type: 'markdown' as const, icon: FileText, label: i18n.t('exportMenu.markdown') },
    { type: 'pdf' as const, icon: FileDown, label: i18n.t('exportMenu.pdf') },
  ];

  return (
    <div ref={menuRef} className="relative">
      <Button size="sm" onClick={() => setOpen((prev) => !prev)} disabled={exporting}>
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {i18n.t('common.export')}
      </Button>

      {open && !exporting && (
        <div className="absolute right-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-lg py-1 z-10">
          {items.map((item) => (
            <button
              key={item.type}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-secondary"
              onClick={() => handleExport(item.type)}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
