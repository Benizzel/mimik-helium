import type { Screenshot } from '@/core/guides/types';
import { resolveViewport } from '@/core/screenshot/geometry';
import MascotIcon from '@/ui/shared/MascotIcon';

interface ImagePlaceholderProps {
  label: string;
  ratio?: number;
  className?: string;
}

const DEFAULT_RATIO = 16 / 10;

export default function ImagePlaceholder({ label, ratio = DEFAULT_RATIO, className = '' }: ImagePlaceholderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/60 text-muted-foreground ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <MascotIcon size={64} pose="lookaway" tone="muted" />
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
