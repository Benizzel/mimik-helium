import { ArrowLeft, Check, Layers, Maximize2, Pencil, Play, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import {
  createSnapshot,
  deleteStep,
  getGuide,
  onGuidesChanged,
  reorderSteps,
  updateGuideDescription,
  updateGuideTitle,
  updateStepDescription,
} from '@/core/guides/service';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { createTab, focusWindow, getExtensionURL, localStorage, queryTabs, updateTab } from '@/lib/browser-api';
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/messaging';
import { getMostCommonDomain } from '@/lib/utils';
import { Input } from '@/ui/components/ui/input';
import EmptyGuideState from '@/ui/shared/EmptyGuideState';
import FaviconImg from '@/ui/shared/FaviconImg';
import { guideDescriptionErrorMessage } from '@/ui/shared/guide-description-error';
import { dominantRatio } from '@/ui/shared/ImagePlaceholder';
import ExportMenu from './ExportMenu';
import StepCard from './StepCard';

interface GuideEditorProps {
  guideId: string;
  onBack: () => void;
  onGuideMe?: (guideId: string) => void;
}

interface OpenInFullViewOptions {
  stepId?: string;
  tool?: 'annotate' | 'redact' | 'crop' | 'target';
}

interface GuideData {
  guide: Guide;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
}

function flushFocusedField() {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.blur();
}

export default function GuideEditor({ guideId, onBack, onGuideMe }: GuideEditorProps) {
  const [data, setData] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const editingDescriptionRef = useRef(false);

  const applyGuide = useCallback((result: GuideData) => {
    setData(result);
    setTitle(result.guide.title);
    if (!editingDescriptionRef.current) setDescription(result.guide.description ?? '');
  }, []);

  const loadGuide = useCallback(async () => {
    const result = await getGuide(guideId);
    if (!result) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    applyGuide(result);
    setLoading(false);
  }, [guideId, applyGuide]);

  useEffect(() => {
    loadGuide();
  }, [loadGuide]);

  useEffect(() => {
    return onGuidesChanged(() => {
      if (!editing) loadGuide();
    });
  }, [editing, loadGuide]);

  useEffect(() => {
    localStorage.get(['aiApiKey']).then((s) => setHasApiKey(Boolean(s.aiApiKey)));
  }, []);

  const handleTitleBlur = useCallback(async () => {
    if (!data || title === data.guide.title) return;
    await updateGuideTitle(guideId, title);
    setData((prev) => (prev ? { ...prev, guide: { ...prev.guide, title } } : prev));
  }, [data, guideId, title]);

  const handleGuideDescriptionBlur = useCallback(async () => {
    if (data && description !== (data.guide.description ?? '')) {
      await updateGuideDescription(guideId, description);
      setData((prev) => (prev ? { ...prev, guide: { ...prev.guide, description } } : prev));
    }
    editingDescriptionRef.current = false;
  }, [data, guideId, description]);

  const handleGenerateDescription = useCallback(async () => {
    setGenerating(true);
    setDescriptionError(null);
    try {
      const result = await sendMessage('generateGuideDescription', { guideId });
      if (result.error) {
        setDescriptionError(guideDescriptionErrorMessage(result.error));
        return;
      }
      const generated = result.description;
      if (!generated) return;
      setDescription(generated);
      setData((prev) => (prev ? { ...prev, guide: { ...prev.guide, description: generated } } : prev));
    } catch {
      setDescriptionError(guideDescriptionErrorMessage('generation-failed'));
    } finally {
      setGenerating(false);
    }
  }, [guideId]);

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
        applyGuide(result);
      } else {
        setData(null);
        setLoading(true);
        await loadGuide();
      }
    },
    [guideId, loadGuide, applyGuide],
  );

  const openInFullView = useCallback((targetGuideId: string, options?: OpenInFullViewOptions) => {
    const params = new URLSearchParams({ guideId: targetGuideId });
    if (options?.stepId) params.set('stepId', options.stepId);
    if (options?.tool) params.set('tool', options.tool);
    const url = getExtensionURL(`/fullview.html?${params.toString()}`);
    queryTabs({ url: getExtensionURL('/fullview.html') }).then((tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        updateTab(tabs[0].id, { active: true, url });
        if (tabs[0].windowId) focusWindow(tabs[0].windowId);
      } else {
        createTab({ url });
      }
    });
  }, []);

  const toggleEditing = useCallback(() => {
    if (editing) {
      flushFocusedField();
      setEditing(false);
      return;
    }
    setEditing(true);
    createSnapshot(guideId).catch((err) => logger.error(' Snapshot before editing failed', err));
  }, [editing, guideId]);

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
          {editing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className="text-lg font-bold bg-transparent border-0 border-b border-transparent hover:border-border focus-visible:ring-0 focus-visible:border-accent shadow-none p-0 h-auto text-foreground"
            />
          ) : (
            <h2 className="flex-1 min-w-0 text-lg font-bold truncate text-foreground" title={title}>
              {title}
            </h2>
          )}
          <button
            onClick={() => openInFullView(guideId)}
            className="shrink-0 p-1.5 rounded-md transition-colors text-purple hover:text-accent hover:bg-secondary"
            title={i18n.t('library.openInFullView')}
          >
            <Maximize2 size={15} />
          </button>
          {!editing && data.steps.length > 0 && (
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
          <div className="ml-auto shrink-0 flex items-center gap-1">
            <button
              onClick={toggleEditing}
              className="shrink-0 p-1.5 rounded-md transition-colors text-purple hover:text-accent hover:bg-secondary"
              title={editing ? i18n.t('editor.done') : i18n.t('editor.edit')}
              aria-label={editing ? i18n.t('editor.done') : i18n.t('editor.edit')}
            >
              {editing ? <Check size={15} /> : <Pencil size={15} />}
            </button>
            <ExportMenu guideId={guideId} guide={data.guide} steps={data.steps} screenshots={data.screenshots} />
          </div>
        </div>
        <div className="mt-1 mb-1.5" style={{ marginLeft: '34px' }}>
          <textarea
            ref={(el) => {
              if (el) {
                el.style.height = '0';
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            value={description}
            rows={2}
            onChange={(e) => {
              setDescription(e.target.value);
              const el = e.target;
              el.style.height = '0';
              el.style.height = `${el.scrollHeight}px`;
            }}
            onFocus={() => {
              editingDescriptionRef.current = true;
            }}
            onBlur={handleGuideDescriptionBlur}
            placeholder={i18n.t('editor.descriptionPlaceholder')}
            className="w-full resize-none overflow-hidden bg-transparent p-0 text-xs leading-snug text-muted-foreground placeholder:text-muted-foreground/60 border-b border-transparent hover:border-border focus:outline-none focus:border-accent"
          />
          {hasApiKey && (
            <button
              type="button"
              onClick={handleGenerateDescription}
              disabled={generating}
              title={description ? i18n.t('editor.regenerateDescription') : i18n.t('editor.generateDescription')}
              className="mt-1 flex items-center gap-1 text-[11px] font-medium text-accent hover:text-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={11} className={generating ? 'animate-pulse' : ''} />
              {generating
                ? i18n.t('editor.generatingDescription')
                : description
                  ? i18n.t('editor.regenerateDescription')
                  : i18n.t('editor.generateDescription')}
            </button>
          )}
          {descriptionError && <p className="mt-1 text-[11px] text-destructive">{descriptionError}</p>}
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
                placeholderRatio={dominantRatio(data.screenshots)}
                frameRatio={dominantRatio(data.screenshots)}
                onDescriptionChange={handleDescriptionChange}
                onDelete={handleDeleteStep}
                onOpenEditor={(stepId, tool) => openInFullView(guideId, { stepId, tool })}
                readOnly={!editing}
                onChanged={loadGuide}
                dragHandleProps={
                  editing
                    ? {
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
                      }
                    : undefined
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
