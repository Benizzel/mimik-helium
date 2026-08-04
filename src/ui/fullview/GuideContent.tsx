import { Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TypeAnimation } from 'react-type-animation';
import { i18n } from '#imports';
import { deleteStep, getGuide, onGuidesChanged, updateGuideTitle, updateStepDescription } from '@/core/guides/service';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import type { ScreenshotEdits } from '@/core/screenshot/types';
import { openSidebar } from '@/lib/browser-api';
import { sendMessage } from '@/lib/messaging';
import { formatDate, getMostCommonDomain } from '@/lib/utils';
import { useFullview } from '@/stores/fullview';
import AnnotationEditor from '@/ui/shared/AnnotationEditor';
import FaviconImg from '@/ui/shared/FaviconImg';
import GuideStepList from './components/GuideStepList';

interface GuideContentProps {
  guideId: string;
  initialStepId?: string;
  initialTool?: 'annotate' | 'redact' | 'crop' | 'target';
}

interface GuideData {
  guide: Guide;
  steps: Step[];
  screenshots: Map<string, Screenshot>;
}

export default function GuideContent({ guideId, initialStepId, initialTool }: GuideContentProps) {
  const { setGuideTitle, setGuideStepCount, setGuideExportData, scrollToStep } = useFullview((s) => ({
    setGuideTitle: s.setGuideTitle,
    setGuideStepCount: s.setGuideStepCount,
    setGuideExportData: s.setGuideExportData,
    scrollToStep: s.scrollToStep,
  }));

  const [data, setData] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [typingTitle, setTypingTitle] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<'annotate' | 'redact' | 'crop' | 'target'>('annotate');
  const titleRef = useRef('');
  const appliedInitialRef = useRef(false);

  const loadGuide = useCallback(async () => {
    const result = await getGuide(guideId);
    if (result) {
      setData(result);
      const newTitle = result.guide.title;
      const prev = titleRef.current;
      if (
        prev === i18n.t('fullview_untitledGuide') &&
        newTitle !== i18n.t('fullview_untitledGuide') &&
        result.steps.length > 0
      ) {
        setTypingTitle(newTitle);
      } else {
        titleRef.current = newTitle;
        setTitle(newTitle);
      }
      document.title = `${newTitle} — ${i18n.t('app_name')}`;
      setGuideTitle(newTitle);
      setGuideStepCount(result.steps.length);
      setGuideExportData({ guideId, ...result });
    }
    setLoading(false);
  }, [guideId, setGuideTitle, setGuideStepCount, setGuideExportData]);

  useEffect(() => {
    loadGuide();
    return onGuidesChanged(() => loadGuide());
  }, [loadGuide]);

  const handleTitleBlur = useCallback(async () => {
    if (!data || title === data.guide.title) return;
    await updateGuideTitle(guideId, title);
    setData((prev) => (prev ? { ...prev, guide: { ...prev.guide, title } } : prev));
    document.title = `${title} — ${i18n.t('app_name')}`;
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
      await loadGuide();
    },
    [guideId, loadGuide],
  );

  const handleOpenEditor = useCallback((stepId: string, tool: 'annotate' | 'redact' | 'crop' | 'target') => {
    setEditingStepId(stepId);
    setEditingTool(tool);
  }, []);

  const handleEditorDone = useCallback(
    (edits: ScreenshotEdits) => {
      if (!editingStepId || !data) return;
      const screenshot = data.screenshots.get(editingStepId);
      if (!screenshot) return;
      setData((prev) => {
        if (!prev) return prev;
        const newScreenshots = new Map(prev.screenshots);
        newScreenshots.set(editingStepId, { ...screenshot, edits });
        return { ...prev, screenshots: newScreenshots };
      });
      setEditingStepId(null);
    },
    [editingStepId, data],
  );

  useEffect(() => {
    if (appliedInitialRef.current || !data || !initialStepId) return;
    if (!data.screenshots.has(initialStepId)) return;
    appliedInitialRef.current = true;
    scrollToStep(initialStepId);
    if (initialTool) {
      setEditingStepId(initialStepId);
      setEditingTool(initialTool);
    }
  }, [data, initialStepId, initialTool, scrollToStep]);

  if (loading)
    return (
      <div>
        <div className="h-10 w-2/3 rounded-lg bg-border/50 animate-pulse" />
        <div className="h-4 w-48 rounded bg-border/30 animate-pulse mt-3 mb-8" />
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border/50 p-4">
              <div
                className="aspect-video rounded-lg bg-[#f2f4fa] animate-pulse mb-3"
                style={{ animationDelay: `${i * 150}ms` }}
              />
              <div
                className="h-4 w-3/4 rounded bg-border/40 animate-pulse"
                style={{ animationDelay: `${i * 150 + 50}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  if (!data) return <p className="text-sm py-12 text-center text-purple">{i18n.t('fullview_guideNotFound')}</p>;

  const domain = getMostCommonDomain(data.steps);
  const editingScreenshot = editingStepId ? data.screenshots.get(editingStepId) : undefined;

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {editingStepId && editingScreenshot && (
        <AnnotationEditor
          screenshot={editingScreenshot}
          tool={editingTool}
          onDone={handleEditorDone}
          onCancel={() => setEditingStepId(null)}
        />
      )}

      <div
        className={
          title === i18n.t('fullview_untitledGuide') && !typingTitle && data.steps.length > 0 ? 'min-h-[88px]' : ''
        }
      >
        {title === i18n.t('fullview_untitledGuide') && !typingTitle && data.steps.length > 0 ? (
          <div className="text-[32px] font-extrabold leading-tight animate-gradient-text bg-[length:300%_100%] bg-clip-text text-transparent bg-gradient-to-r from-muted-foreground via-violet to-muted-foreground max-w-[480px]">
            {i18n.t('fullview_writingTitle')}
          </div>
        ) : typingTitle ? (
          <div className="relative text-[32px] font-extrabold leading-tight">
            <div className="invisible" aria-hidden="true">
              {typingTitle}
            </div>
            <div className="absolute inset-0 text-foreground">
              <TypeAnimation
                sequence={[
                  typingTitle,
                  () => {
                    titleRef.current = typingTitle;
                    setTitle(typingTitle);
                    setTypingTitle(null);
                  },
                ]}
                speed={70}
                cursor={false}
              />
              <span className="inline-block w-[3px] h-[30px] bg-violet ml-0.5 align-text-bottom animate-blink" />
            </div>
          </div>
        ) : (
          <textarea
            ref={(el) => {
              if (el) {
                el.style.height = '0';
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            value={title}
            rows={1}
            onChange={(e) => {
              setTitle(e.target.value);
              setGuideTitle(e.target.value);
              const el = e.target;
              el.style.height = '0';
              el.style.height = `${el.scrollHeight}px`;
            }}
            onBlur={handleTitleBlur}
            className="text-[32px] font-extrabold bg-transparent border-b-2 border-transparent hover:border-border focus:outline-none focus:border-accent w-full p-0 text-foreground resize-none leading-tight overflow-hidden"
          />
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2 mb-4 flex-wrap">
        <span className="inline-flex items-center text-[11px] font-medium text-muted-foreground bg-card border border-border px-2.5 py-0.5 rounded-full">
          {formatDate(data.guide.createdAt)}
        </span>
        <span className="inline-flex items-center text-[11px] font-medium text-muted-foreground bg-card border border-border px-2.5 py-0.5 rounded-full">
          {data.steps.length !== 1
            ? i18n.t('fullview_stepCountPlural', [String(data.steps.length)])
            : i18n.t('fullview_stepCount', [String(data.steps.length)])}
        </span>
        {domain && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground bg-card border border-border pl-1.5 pr-2.5 py-0.5 rounded-full">
            <FaviconImg domain={domain} size={14} className="rounded-full" />
            {domain}
          </span>
        )}
        {data.steps.length > 0 && (
          <button
            onClick={() => {
              openSidebar();
              void sendMessage('startGuideMe', { guideId });
            }}
            disabled={!data.steps.some((s) => s.elementMeta)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-0.5 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ml-auto"
          >
            <Play size={11} />
            {i18n.t('fullview_guideMe')}
          </button>
        )}
      </div>

      <GuideStepList
        guideId={guideId}
        steps={data.steps}
        screenshots={data.screenshots}
        onDescriptionChange={handleDescriptionChange}
        onDelete={handleDeleteStep}
        onOpenEditor={handleOpenEditor}
        onReorder={(newSteps) => setData((prev) => (prev ? { ...prev, steps: newSteps } : prev))}
      />
    </div>
  );
}
