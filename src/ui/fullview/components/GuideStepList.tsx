import { useEffect, useRef, useState } from 'react';
import { isBlock, stepNumbers } from '@/core/guides/blocks';
import { insertBlock, reorderSteps } from '@/core/guides/service';
import type { BlockType, Screenshot, Step } from '@/core/guides/types';
import { useFullview } from '@/stores/fullview';
import BlockCard from '@/ui/shared/BlockCard';
import CaptureTabDialog from '@/ui/shared/CaptureTabDialog';
import EmptyGuideState from '@/ui/shared/EmptyGuideState';
import { dominantRatio } from '@/ui/shared/ImagePlaceholder';
import InsertBlockMenu from '@/ui/shared/InsertBlockMenu';
import StepCard from '@/ui/sidepanel/StepCard';

interface GuideStepListProps {
  guideId: string;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
  onDescriptionChange: (stepId: string, description: string) => void;
  onDelete: (stepId: string) => void;
  onOpenEditor: (stepId: string, tool: 'annotate' | 'redact' | 'crop' | 'target') => void;
  onReorder: (newSteps: Step[]) => void;
  readOnly?: boolean;
  onChanged?: () => void;
  hasApiKey?: boolean;
  onInsertRecording?: (guideId: string, insertAtIndex: number, tabId: number) => void;
}

export default function GuideStepList({
  guideId,
  steps,
  screenshots,
  onDescriptionChange,
  onDelete,
  onOpenEditor,
  onReorder,
  readOnly,
  onChanged,
  hasApiKey,
  onInsertRecording,
}: GuideStepListProps) {
  const { scrollToStepId, setActiveStepId } = useFullview((s) => ({
    scrollToStepId: s.scrollToStepId,
    setActiveStepId: s.setActiveStepId,
  }));

  const [recordAtIndex, setRecordAtIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const frameRatio = dominantRatio(screenshots);
  const numbers = stepNumbers(steps);

  useEffect(() => {
    if (scrollToStepId) {
      stepRefs.current.get(scrollToStepId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [scrollToStepId]);

  useEffect(() => {
    if (steps.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveStepId(entry.target.getAttribute('data-step-id'));
          }
        }
      },
      { threshold: 0.5 },
    );
    for (const el of stepRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [steps, setActiveStepId]);

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const newSteps = [...steps];
      const [moved] = newSteps.splice(dragIndex, 1);
      newSteps.splice(dragOverIndex, 0, moved);
      reorderSteps(
        guideId,
        newSteps.map((s) => s.id),
      );
      onReorder(newSteps);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleInsertBlock = async (atIndex: number, blockType: BlockType) => {
    await insertBlock(guideId, atIndex, blockType, '');
    onChanged?.();
  };

  const dragHandlers = (idx: number) =>
    readOnly
      ? undefined
      : {
          onDragStart: (e: React.DragEvent) => {
            setDragIndex(idx);
            e.dataTransfer.effectAllowed = 'move';
          },
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOverIndex(idx);
          },
          onDragEnd: handleDragEnd,
        };

  const captureDialog = (
    <CaptureTabDialog
      open={recordAtIndex !== null}
      onCancel={() => setRecordAtIndex(null)}
      onStart={(tabId) => {
        const atIndex = recordAtIndex;
        setRecordAtIndex(null);
        if (atIndex !== null) onInsertRecording?.(guideId, atIndex, tabId);
      }}
    />
  );

  if (steps.length === 0) {
    return (
      <div className="flex flex-col">
        <EmptyGuideState />
        {!readOnly && (
          <InsertBlockMenu
            onInsert={(blockType) => handleInsertBlock(0, blockType)}
            onRecord={onInsertRecording && (() => setRecordAtIndex(0))}
          />
        )}
        {captureDialog}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!readOnly && (
        <InsertBlockMenu
          onInsert={(blockType) => handleInsertBlock(0, blockType)}
          onRecord={onInsertRecording && (() => setRecordAtIndex(0))}
        />
      )}
      {steps.map((step, idx) => (
        <div
          key={step.id}
          ref={(el) => {
            if (el) stepRefs.current.set(step.id, el);
            else stepRefs.current.delete(step.id);
          }}
          data-step-id={step.id}
        >
          {dragOverIndex === idx && dragIndex !== null && dragIndex !== idx && (
            <div className="h-1 bg-accent rounded-full mx-4 mb-2" />
          )}
          {isBlock(step) ? (
            <BlockCard
              step={step}
              onDescriptionChange={onDescriptionChange}
              onDelete={onDelete}
              onChanged={onChanged}
              readOnly={readOnly}
              dragHandleProps={dragHandlers(idx)}
            />
          ) : (
            <StepCard
              step={step}
              number={numbers.get(step.id) ?? 0}
              screenshot={screenshots.get(step.id)}
              placeholderRatio={frameRatio}
              frameRatio={frameRatio}
              onDescriptionChange={onDescriptionChange}
              onDelete={onDelete}
              onOpenEditor={onOpenEditor}
              readOnly={readOnly}
              hasApiKey={hasApiKey}
              onChanged={onChanged}
              dragHandleProps={dragHandlers(idx)}
            />
          )}
          {!readOnly && (
            <InsertBlockMenu
              onInsert={(blockType) => handleInsertBlock(idx + 1, blockType)}
              onRecord={onInsertRecording && (() => setRecordAtIndex(idx + 1))}
            />
          )}
        </div>
      ))}
      {captureDialog}
    </div>
  );
}
