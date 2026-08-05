import { ImageOff } from 'lucide-react';
import type { Screenshot } from '@/core/guides/types';
import { resolveViewport } from '@/core/screenshot/geometry';

interface ImagePlaceholderProps {
  label: string;
  ratio?: number;
  className?: string;
}

const DEFAULT_RATIO = 16 / 10;

export default function ImagePlaceholder({ label, ratio = DEFAULT_RATIO, className = '' }: ImagePlaceholderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/60 ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <span className="flex items-center justify-center w-11 h-11 rounded-full bg-card text-muted-foreground shadow-sm">
        <ImageOff size={19} />
      </span>
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}

export function siblingRatio(screenshots: Map<string, Screenshot>): number | undefined {
  for (const screenshot of screenshots.values()) {
    const viewport = resolveViewport(screenshot);
    if (viewport.width && viewport.height) return viewport.width / viewport.height;
  }
  return undefined;
}
