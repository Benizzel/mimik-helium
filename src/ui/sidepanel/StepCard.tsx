import { Check, Copy, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import type { Screenshot, Step } from '@/core/guides/types';
import { renderScreenshot } from '@/core/screenshot/render';
import { logger } from '@/lib/logger';
import ScreenshotView from '@/ui/shared/ScreenshotView';

interface DragHandleProps {
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

interface StepCardProps {
  step: Step;
  screenshot: Screenshot | undefined;
  onDescriptionChange: (stepId: string, description: string) => void;
  onDelete: (stepId: string) => void;
  dragHandleProps?: DragHandleProps;
  onOpenEditor?: (stepId: string, tool: 'annotate' | 'redact' | 'crop') => void;
  onCopy?: (stepId: string) => void;
}

export default function StepCard({
  step,
  screenshot,
  onDescriptionChange,
  onDelete,
  dragHandleProps,
  onOpenEditor,
}: StepCardProps) {
  const [description, setDescription] = useState(step.description);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const pressedOnScreenshot = useRef(false);

  useEffect(() => {
    setDescription(step.description);
  }, [step.description]);

  const handleDescriptionBlur = () => {
    if (description !== step.description) onDescriptionChange(step.id, description);
  };

  const handleDelete = () => {
    if (window.confirm(i18n.t('editor.deleteThisStep'))) onDelete(step.id);
  };

  const handleCopy = async () => {
    if (!screenshot) return;
    try {
      const rendered = await renderScreenshot(screenshot, { format: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': rendered })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logger.error(' Copy to clipboard failed', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
    dragHandleProps?.onDragOver(e);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (pressedOnScreenshot.current) {
      e.preventDefault();
      return;
    }
    dragHandleProps?.onDragStart(e);
  };

  return (
    <div
      draggable={!!dragHandleProps}
      onPointerDownCapture={(e) => {
        pressedOnScreenshot.current = !!(e.target as HTMLElement).closest('[data-screenshot-frame]');
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDragEnd={() => {
        setDragOver(false);
        dragHandleProps?.onDragEnd();
      }}
      className={`rounded-xl mb-3 overflow-hidden transition-shadow border border-border bg-card ${dragOver ? 'ring-2 ring-accent' : ''}`}
    >
      {screenshot ? (
        <ScreenshotView
          screenshot={screenshot}
          alt={`Step ${step.index + 1} screenshot`}
          className="!rounded-none !border-0"
          crop
          onOpenEditor={onOpenEditor ? (tool) => onOpenEditor(step.id, tool) : undefined}
        />
      ) : (
        <div className="w-full h-32 flex items-center justify-center text-sm bg-secondary text-purple">
          {i18n.t('editor.noScreenshot')}
        </div>
      )}

      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold shrink-0 bg-primary text-primary-foreground">
            {step.index + 1}
          </span>
          <textarea
            className="w-full text-[13px] font-medium resize-none outline-none border-0 bg-transparent p-0 leading-snug flex-1 text-foreground"
            value={description}
            rows={1}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
          />
        </div>
        <div className="flex items-center justify-end mt-1">
          <div className="flex items-center gap-0.5">
            {screenshot && (
              <button
                onClick={handleCopy}
                className={`p-1 rounded-md transition-colors ${copied ? 'text-success' : 'text-border hover:text-success'}`}
                title={i18n.t('editor.copyScreenshot')}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-1 rounded-md transition-colors text-border hover:text-destructive"
              title={i18n.t('recording.deleteStep')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
