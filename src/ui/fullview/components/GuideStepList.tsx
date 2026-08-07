import { useEffect, useRef, useState } from 'react';
import { reorderSteps } from '@/core/guides/service';
import type { Screenshot, Step } from '@/core/guides/types';
import { useFullview } from '@/stores/fullview';
import EmptyGuideState from '@/ui/shared/EmptyGuideState';
import { dominantRatio } from '@/ui/shared/ImagePlaceholder';
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
}: GuideStepListProps) {
  const { scrollToStepId, setActiveStepId } = useFullview((s) => ({
    scrollToStepId: s.scrollToStepId,
    setActiveStepId: s.setActiveStepId,
  }));

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const frameRatio = dominantRatio(screenshots);

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

  if (steps.length === 0) {
    return <EmptyGuideState />;
  }

  return (
    <div className="space-y-6">
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
          <StepCard
            step={step}
            screenshot={screenshots.get(step.id)}
            placeholderRatio={frameRatio}
            frameRatio={frameRatio}
            onDescriptionChange={onDescriptionChange}
            onDelete={onDelete}
            onOpenEditor={onOpenEditor}
            readOnly={readOnly}
            hasApiKey={hasApiKey}
            onChanged={onChanged}
            dragHandleProps={
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
                  }
            }
          />
        </div>
      ))}
    </div>
  );
}
