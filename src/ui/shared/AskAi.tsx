import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import { REWRITE_PRESETS, type RewritePreset } from '@/core/capture/ai/prompts';
import { sendMessage } from '@/lib/messaging';
import { rewriteErrorMessage } from '@/ui/shared/rewrite-error';
import Toast from '@/ui/shared/Toast';

const PRESET_LABEL_KEYS = {
  shorter: 'editor.rewriteShorter',
  detail: 'editor.rewriteDetail',
  grammar: 'editor.rewriteGrammar',
  formal: 'editor.rewriteFormal',
  casual: 'editor.rewriteCasual',
} as const satisfies Record<RewritePreset, string>;

const PRESET_ORDER = Object.keys(PRESET_LABEL_KEYS) as RewritePreset[];

interface Span {
  start: number;
  end: number;
  lead: string;
  core: string;
  trail: string;
}

function readSpan(value: string, start: number, end: number): Span | null {
  const raw = value.slice(start, end);
  const core = raw.trim();
  if (!core) return null;
  const lead = raw.slice(0, raw.indexOf(core[0]));
  return { start, end, lead, core, trail: raw.slice(lead.length + core.length) };
}

export function useAskAi(value: string, onReplace: (next: string) => void, enabled = true) {
  const [span, setSpan] = useState<Span | null>(null);
  const [active, setActive] = useState<Span | null>(null);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && result === null) inputRef.current?.focus();
  }, [active, result]);

  const reset = useCallback(() => {
    setActive(null);
    setSpan(null);
    setInstruction('');
    setResult(null);
  }, []);

  const onSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    setSpan(readSpan(el.value, el.selectionStart, el.selectionEnd));
  }, []);

  const run = useCallback(
    async (target: Span, prompt: string) => {
      if (!prompt.trim() || busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await sendMessage('rewriteSelection', { text: target.core, instruction: prompt });
        if (response.error) {
          setError(rewriteErrorMessage(response.error));
          return;
        }
        if (response.text) setResult(response.text);
      } catch {
        setError(rewriteErrorMessage('generation-failed'));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const replace = useCallback(() => {
    if (!active || !result) return;
    if (value.slice(active.start, active.end) !== active.lead + active.core + active.trail) {
      setError(i18n.t('editor.rewriteErrorStale'));
      reset();
      return;
    }
    onReplace(value.slice(0, active.start) + active.lead + result + active.trail + value.slice(active.end));
    reset();
  }, [active, result, value, onReplace, reset]);

  const panel = !enabled ? null : (
    <>
      {span && !active && (
        <button
          type="button"
          onClick={() => setActive(span)}
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-accent hover:text-deep"
        >
          <Sparkles size={11} />
          {i18n.t('editor.rewriteAskAi')}
        </button>
      )}

      {active && (
        <div className="mt-1.5 rounded-lg border border-border bg-card overflow-hidden">
          {result === null ? (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
                <Sparkles size={12} className="shrink-0 text-accent" />
                <input
                  ref={inputRef}
                  value={instruction}
                  disabled={busy}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void run(active, instruction);
                    }
                    if (e.key === 'Escape') reset();
                  }}
                  placeholder={i18n.t('editor.rewritePlaceholder')}
                  className="flex-1 min-w-0 bg-transparent p-0 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
                />
                {busy ? (
                  <Loader2 size={12} className="shrink-0 animate-spin text-accent" />
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{i18n.t('editor.rewriteEnter')}</span>
                )}
              </div>
              <div className="py-1">
                {PRESET_ORDER.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(active, REWRITE_PRESETS[preset])}
                    className="w-full px-2.5 py-1 text-left text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    {i18n.t(PRESET_LABEL_KEYS[preset])}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="px-2.5 py-2 text-[12px] leading-snug text-foreground whitespace-pre-wrap border-b border-border">
                {result}
              </p>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  type="button"
                  onClick={replace}
                  className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-deep"
                >
                  {i18n.t('editor.rewriteReplace')}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                >
                  {i18n.t('editor.rewriteDiscard')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <Toast message={error} onDismiss={() => setError(null)} />
    </>
  );

  return { onSelect, panel };
}
