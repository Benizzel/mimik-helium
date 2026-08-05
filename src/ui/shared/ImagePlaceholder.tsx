import { ImageOff } from 'lucide-react';

interface ImagePlaceholderProps {
  label: string;
  ratio?: number;
  className?: string;
}

export default function ImagePlaceholder({ label, ratio, className = '' }: ImagePlaceholderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/60 ${className}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      <span className="flex items-center justify-center w-11 h-11 rounded-full bg-card text-muted-foreground shadow-sm">
        <ImageOff size={19} />
      </span>
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}
