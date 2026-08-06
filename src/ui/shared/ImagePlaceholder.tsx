import { ImageUp } from 'lucide-react';
import { useState } from 'react';
import { i18n } from '#imports';
import type { Screenshot } from '@/core/guides/types';
import { resolveViewport } from '@/core/screenshot/geometry';
import MascotIcon from '@/ui/shared/MascotIcon';
import ReplaceImageDialog from '@/ui/shared/ReplaceImageDialog';

interface ImagePlaceholderProps {
  label: string;
  ratio?: number;
  className?: string;
  onUpload?: (file: File) => void | Promise<void>;
}

const DEFAULT_RATIO = 16 / 10;

export default function ImagePlaceholder({
  label,
  ratio = DEFAULT_RATIO,
  className = '',
  onUpload,
}: ImagePlaceholderProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/60 text-muted-foreground ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <MascotIcon size={64} pose="lookaway" tone="muted" />
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      {onUpload && (
        <>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card/90 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary hover:text-accent"
          >
            <ImageUp size={13} />
            {i18n.t('screenshotView.addImage')}
          </button>
          <ReplaceImageDialog
            open={uploadOpen}
            onSelect={(file) => {
              setUploadOpen(false);
              void onUpload(file);
            }}
            onCancel={() => setUploadOpen(false)}
          />
        </>
      )}
    </div>
  );
}

const RATIO_BUCKET_PRECISION = 100;

export function dominantRatio(screenshots: Map<string, Screenshot>): number | undefined {
  const buckets = new Map<number, { ratio: number; count: number }>();

  for (const screenshot of screenshots.values()) {
    const viewport = resolveViewport(screenshot);
    if (!viewport.width || !viewport.height) continue;
    const ratio = viewport.width / viewport.height;
    const key = Math.round(ratio * RATIO_BUCKET_PRECISION) / RATIO_BUCKET_PRECISION;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { ratio, count: 1 });
  }

  let winner: { ratio: number; count: number } | undefined;
  for (const bucket of buckets.values()) {
    if (!winner || bucket.count > winner.count) winner = bucket;
  }
  return winner?.ratio;
}
