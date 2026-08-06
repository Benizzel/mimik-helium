import { useEffect } from 'react';
import { useFullview } from '@/stores/fullview';
import GuideContent from './GuideContent';
import LibraryContent from './LibraryContent';
import { useRoute } from './router';
import SearchModal from './SearchModal';
import TopNav from './TopNav';

export default function FullViewApp() {
  const route = useRoute();
  const { toggleSearch, historyOpen } = useFullview((s) => ({
    toggleSearch: s.toggleSearch,
    historyOpen: s.historyOpen,
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSearch]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav route={route} />
      <SearchModal />

      {route.page === 'library' && (
        <main className="flex-1 p-8 max-w-6xl mx-auto w-full">
          <LibraryContent category={route.category} />
        </main>
      )}

      {route.page === 'guide' && (
        <main className="flex-1 py-10 px-6">
          <div className={`mx-auto ${historyOpen ? 'max-w-[1032px]' : 'max-w-[720px]'}`}>
            <GuideContent
              guideId={route.guideId}
              initialStepId={route.stepId}
              initialTool={route.tool}
              initialHistory={route.history}
            />
          </div>
        </main>
      )}
    </div>
  );
}
