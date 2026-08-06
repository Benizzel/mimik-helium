import { ChevronRight, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { i18n } from '#imports';
import { getSnapshots, revertToSnapshot } from '@/core/guides/service';
import { groupSnapshots } from '@/core/guides/snapshot-groups';
import type { Snapshot } from '@/core/guides/types';
import { formatDateTime } from '@/lib/utils';

function isQuotaError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'DexieError2QuotaExceededError');
}

interface VersionHistoryPanelProps {
  guideId: string;
  selectedId: string | null;
  onSelect: (snapshot: Snapshot | null) => void;
  onRestored: () => void;
  onClose: () => void;
}

export default function VersionHistoryPanel({
  guideId,
  selectedId,
  onSelect,
  onRestored,
  onClose,
}: VersionHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSnapshots(guideId)
      .then((list) => {
        if (!cancelled) setSnapshots(list);
      })
      .catch(() => {
        if (!cancelled) setError(i18n.t('history.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guideId]);

  const handleRestore = async (snapshot: Snapshot) => {
    if (restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const undo = await revertToSnapshot(snapshot.id);
      if (!undo) {
        setError(i18n.t('history.restoreError'));
        return;
      }
      setSnapshots(await getSnapshots(guideId));
      setExpanded(new Set());
      onSelect(null);
      onRestored();
    } catch (e) {
      setError(i18n.t(isQuotaError(e) ? 'history.storageFull' : 'history.restoreError'));
    } finally {
      setRestoring(false);
    }
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const entry = (snapshot: Snapshot) => {
    const active = selectedId === snapshot.id;
    return (
      <div key={snapshot.id} className="relative pl-5 py-2.5">
        <span
          className={`absolute left-0 top-4 w-2 h-2 rounded-full border-2 ${
            active ? 'bg-accent border-accent' : 'bg-card border-border'
          }`}
        />
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onSelect(active ? null : snapshot)}
          className={`block w-full text-left text-[12px] ${
            active ? 'font-semibold text-foreground' : 'text-muted-foreground'
          }`}
        >
          {formatDateTime(snapshot.createdAt)}
        </button>
        {active && (
          <button
            type="button"
            disabled={restoring}
            onClick={() => void handleRestore(snapshot)}
            className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-accent disabled:opacity-50"
          >
            <RotateCcw size={11} />
            {i18n.t('history.restore')}
          </button>
        )}
      </div>
    );
  };

  return (
    <aside className="w-72 shrink-0 border-l border-border pl-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 h-10">
        <button
          type="button"
          onClick={onClose}
          aria-label={i18n.t('common.close')}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
        <span className="text-[13px] font-semibold text-foreground">{i18n.t('history.title')}</span>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-destructive py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-[11px] text-muted-foreground py-2">{i18n.t('common.loading')}</p>
      ) : snapshots.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-2">{i18n.t('history.empty')}</p>
      ) : (
        <div className="relative border-l border-dashed border-border ml-1 pl-2 flex-1 min-h-0 overflow-y-auto">
          <div className="pl-5 py-2.5 relative">
            <span className="absolute left-0 top-4 w-2 h-2 rounded-full bg-accent border-2 border-accent" />
            <span className="text-[12px] font-semibold text-foreground">{i18n.t('history.current')}</span>
          </div>
          {groupSnapshots(snapshots).map((row) =>
            row.kind === 'entry' ? (
              entry(row.snapshot)
            ) : (
              <div key={row.snapshots[0].id}>
                <button
                  type="button"
                  aria-expanded={expanded.has(row.snapshots[0].id)}
                  onClick={() => toggle(row.snapshots[0].id)}
                  className="flex items-center gap-1 py-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    size={11}
                    className={
                      expanded.has(row.snapshots[0].id) ? 'rotate-90 transition-transform' : 'transition-transform'
                    }
                  />
                  {i18n.t('history.unchangedVersions', [String(row.snapshots.length)])}
                </button>
                {expanded.has(row.snapshots[0].id) && row.snapshots.map(entry)}
              </div>
            ),
          )}
        </div>
      )}
    </aside>
  );
}
