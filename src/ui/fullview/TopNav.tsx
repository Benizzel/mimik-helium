import {
  Check,
  ChevronRight,
  Download,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { i18n } from '#imports';
import { createSnapshot } from '@/core/guides/service';
import { logger } from '@/lib/logger';
import { useFullview } from '@/stores/fullview';
import { Button } from '@/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import MascotIcon from '@/ui/shared/MascotIcon';
import ExportPreviewModal from './ExportPreviewModal';
import type { Route } from './router';
import { navigate } from './router';

interface TopNavProps {
  route: Route;
}

const navItems = [
  { key: 'all' as const, labelKey: 'fullview_allGuides' as const, icon: FileText },
  { key: 'starred' as const, labelKey: 'fullview_starred' as const, icon: Star },
  { key: 'trash' as const, labelKey: 'fullview_trash' as const, icon: Trash2 },
];

export default function TopNav({ route }: TopNavProps) {
  const {
    counts,
    guideTitle,
    guideStepCount,
    guideExportData: exportData,
    setSearchOpen,
    editing,
    setEditing,
    setHistoryOpen,
    bumpHistoryRefresh,
  } = useFullview((s) => ({
    counts: s.counts,
    guideTitle: s.guideTitle,
    guideStepCount: s.guideStepCount,
    guideExportData: s.guideExportData,
    setSearchOpen: s.setSearchOpen,
    editing: s.editing,
    setEditing: s.setEditing,
    setHistoryOpen: s.setHistoryOpen,
    bumpHistoryRefresh: s.bumpHistoryRefresh,
  }));
  const [exportOpen, setExportOpen] = useState(false);

  const toggleEditing = (guideId: string) => {
    if (editing) {
      setEditing(false);
      return;
    }
    setEditing(true);
    createSnapshot(guideId)
      .then((snapshot) => {
        if (snapshot) bumpHistoryRefresh();
      })
      .catch((err) => logger.error(' Snapshot before editing failed', err));
  };

  return (
    <header className="flex items-center gap-5 px-7 h-16 shrink-0 bg-gradient-to-br from-violet to-violet-light">
      {/* Brand */}
      <button
        onClick={() => navigate({ page: 'library', category: 'all' })}
        className="flex items-center gap-2 mr-4 cursor-pointer h-full"
      >
        <div className="mb-1">
          <MascotIcon size={22} />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-foreground">{i18n.t('app_name')}</span>
      </button>

      {route.page === 'guide'
        ? guideTitle && (
            <>
              <ChevronRight size={14} className="text-foreground opacity-25" />
              {guideTitle === i18n.t('fullview_untitledGuide') && guideStepCount > 0 ? (
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[5px] h-[5px] rounded-full bg-foreground animate-bounce"
                      style={{ animationDelay: `${i * 150}ms`, animationDuration: '1.2s' }}
                    />
                  ))}
                </span>
              ) : (
                <span className="text-[13px] font-medium truncate max-w-sm text-foreground">{guideTitle}</span>
              )}
            </>
          )
        : navItems.map((item) => {
            const active = route.page === 'library' && route.category === item.key;
            const count = counts[item.key];
            return (
              <button
                key={item.key}
                onClick={() => navigate({ page: 'library', category: item.key })}
                className={`flex items-center gap-1.5 text-[13px] h-8 px-3 rounded-md transition-all
                ${active ? 'bg-primary text-primary-foreground font-semibold' : 'text-deep font-medium hover:bg-foreground/10'}`}
              >
                <item.icon size={13.5} />
                {i18n.t(item.labelKey)}
                {count > 0 && (
                  <span className={`text-[11px] ml-0.5 ${active ? 'text-primary-foreground/70' : 'text-violet-dark'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 h-8 rounded-lg w-52 cursor-pointer bg-white/40 border-0 hover:bg-white/60"
        >
          <Search size={14} className="shrink-0 text-violet-dark" />
          <span className="text-[12px] flex-1 text-left text-violet-dark">{i18n.t('fullview_searchPlaceholder')}</span>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-foreground/10 text-violet-dark">⌘K</span>
        </Button>
        {route.page === 'guide' && exportData && (
          <>
            <Button size="sm" variant="secondary" onClick={() => toggleEditing(exportData.guideId)}>
              {editing ? <Check size={14} /> : <Pencil size={14} />}
              {editing ? i18n.t('editor.done') : i18n.t('editor.edit')}
            </Button>
            <Button size="sm" onClick={() => setExportOpen(true)}>
              <Download size={14} />
              {i18n.t('common.export')}
            </Button>
            <ExportPreviewModal
              open={exportOpen}
              onOpenChange={setExportOpen}
              guide={exportData.guide}
              steps={exportData.steps}
              screenshots={exportData.screenshots}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={i18n.t('editor.moreActions')}
                  title={i18n.t('editor.moreActions')}
                  className="text-foreground hover:bg-foreground/10"
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setHistoryOpen(true);
                    setEditing(false);
                  }}
                >
                  <History size={14} />
                  {i18n.t('editor.versionHistory')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}
