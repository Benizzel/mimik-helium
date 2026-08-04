import { ArrowLeft, Layers, Maximize2, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { i18n } from '#imports';
import { deleteStep, getGuide, reorderSteps, updateGuideTitle, updateStepDescription } from '@/core/guides/service';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { createTab, focusWindow, getExtensionURL, queryTabs, updateTab } from '@/lib/browser-api';
import { sendMessage } from '@/lib/messaging';
import { getMostCommonDomain } from '@/lib/utils';
import { Input } from '@/ui/components/ui/input';
import EmptyGuideState from '@/ui/shared/EmptyGuideState';
import FaviconImg from '@/ui/shared/FaviconImg';
import ExportMenu from './ExportMenu';
import StepCard from './StepCard';

interface GuideEditorProps {
  guideId: string;
  onBack: () => void;
  onGuideMe?: (guideId: string) => void;
}

interface GuideData {
  guide: Guide;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
}

export default function GuideEditor({ guideId, onBack, onGuideMe }: GuideEditorProps) {
  const [data, setData] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const loadGuide = useCallback(async () => {
    const result = await getGuide(guideId);
    if (!result) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setData(result);
    setTitle(result.guide.title);
    setLoading(false);
  }, [guideId]);

  useEffect(() => {
    loadGuide();
  }, [loadGuide]);

  const handleTitleBlur = useCallback(async () => {
    if (!data || title === data.guide.title) return;
    await updateGuideTitle(guideId, title);
    setData((prev) => (prev ? { ...prev, guide: { ...prev.guide, title } } : prev));
  }, [data, guideId, title]);

  const handleDescriptionChange = useCallback(async (stepId: string, description: string) => {
    await updateStepDescription(stepId, description);
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.map((s) => (s.id === stepId ? { ...s, description } : s)) };
    });
  }, []);

  const handleDeleteStep = useCallback(
    async (stepId: string) => {
      await deleteStep(guideId, stepId);
      const result = await getGuide(guideId);
      if (result) {
        setData(result);
        setTitle(result.guide.title);
      } else {
        setData(null);
        setLoading(true);
        await loadGuide();
      }
    },
    [guideId, loadGuide],
  );

  const openInFullView = useCallback(
    (targetGuideId: string, stepId?: string, tool?: 'annotate' | 'redact' | 'crop') => {
      const params = new URLSearchParams({ guideId: targetGuideId });
      if (stepId) params.set('stepId', stepId);
      if (tool) params.set('tool', tool);
      const url = getExtensionURL(`/fullview.html?${params.toString()}`);
      queryTabs({ url: getExtensionURL('/fullview.html') }).then((tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          updateTab(tabs[0].id, { active: true, url });
          if (tabs[0].windowId) focusWindow(tabs[0].windowId);
        } else {
          createTab({ url });
        }
      });
    },
    [],
  );

  if (loading) return <p className="text-sm text-purple p-4">{i18n.t('common.loading')}</p>;

  if (notFound || !data) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-purple hover:text-foreground mb-4">
          <ArrowLeft size={18} />
          {i18n.t('common.back')}
        </button>
        <p className="text-sm text-destructive">{i18n.t('fullview.guideNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-card flex flex-col">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="shrink-0 p-1 rounded text-purple hover:text-foreground"
            title={i18n.t('editor.backToLibrary')}
          >
            <ArrowLeft size={18} />
          </button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="text-lg font-bold bg-transparent border-0 border-b border-transparent hover:border-border focus-visible:ring-0 focus-visible:border-accent shadow-none p-0 h-auto text-foreground"
          />
          <button
            onClick={() => openInFullView(guideId)}
            className="shrink-0 p-1.5 rounded-md transition-colors text-purple hover:text-accent hover:bg-secondary"
            title={i18n.t('library.openInFullView')}
          >
            <Maximize2 size={15} />
          </button>
          {data.steps.length > 0 && (
            <button
              onClick={async () => {
                await sendMessage('startGuideMe', { guideId });
                onGuideMe?.(guideId);
              }}
              disabled={!data.steps.some((s) => s.elementMeta)}
              className="shrink-0 p-1.5 rounded-md transition-colors text-purple hover:text-accent hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
              title={i18n.t('editor.guideMe')}
            >
              <Play size={15} />
            </button>
          )}
          <div className="ml-auto shrink-0">
            <ExportMenu guideId={guideId} guide={data.guide} steps={data.steps} screenshots={data.screenshots} />
          </div>
        </div>
        <div className="text-[11px] flex items-center gap-2 text-muted-foreground" style={{ marginLeft: '34px' }}>
          <span className="flex items-center gap-1">
            <Layers size={11} />
            {data.steps.length !== 1
              ? i18n.t('fullview.stepCountPlural', [String(data.steps.length)])
              : i18n.t('fullview.stepCount', [String(data.steps.length)])}
          </span>
          {(() => {
            const d = getMostCommonDomain(data.steps);
            if (!d) return null;
            return (
              <span className="flex items-center gap-1">
                <span className="text-border">·</span>
                <FaviconImg domain={d} size={12} className="rounded-full" />
                {d}
              </span>
            );
          })()}
        </div>
      </div>
      <div className="px-4 pt-1 pb-4 flex-1 flex flex-col">
        {data.steps.length === 0 ? (
          <EmptyGuideState />
        ) : (
          data.steps.map((step, idx) => (
            <div key={step.id}>
              {dragOverIndex === idx && dragIndex !== null && dragIndex !== idx && (
                <div className="h-1 bg-accent rounded-full mx-4 mb-1" />
              )}
              <StepCard
                step={step}
                screenshot={data.screenshots.get(step.id)}
                onDescriptionChange={handleDescriptionChange}
                onDelete={handleDeleteStep}
                onOpenEditor={(stepId, tool) => openInFullView(guideId, stepId, tool)}
                dragHandleProps={{
                  onDragStart: (e: React.DragEvent) => {
                    setDragIndex(idx);
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragOver: (e: React.DragEvent) => {
                    e.preventDefault();
                    setDragOverIndex(idx);
                  },
                  onDragEnd: () => {
                    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
                      setData((prev) => {
                        if (!prev) return prev;
                        const newSteps = [...prev.steps];
                        const [moved] = newSteps.splice(dragIndex, 1);
                        newSteps.splice(dragOverIndex, 0, moved);
                        reorderSteps(
                          guideId,
                          newSteps.map((s) => s.id),
                        );
                        return { ...prev, steps: newSteps };
                      });
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  },
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
