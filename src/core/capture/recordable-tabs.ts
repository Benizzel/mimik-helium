import { queryTabs } from '@/lib/browser-api';

const WEBSTORE_PREFIX = 'https://chrome.google.com/webstore';

export interface RecordableTab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

export function isRecordableUrl(url: string | undefined): boolean {
  if (!url || url.startsWith(WEBSTORE_PREFIX)) return false;
  return /^https?:/.test(url);
}

export async function getRecordableTabs(): Promise<RecordableTab[]> {
  const tabs = await queryTabs({ currentWindow: true });
  return tabs
    .filter((tab) => tab.id !== undefined && isRecordableUrl(tab.url || tab.pendingUrl))
    .map((tab) => ({
      id: tab.id as number,
      title: tab.title || ((tab.url || tab.pendingUrl) as string),
      url: (tab.url || tab.pendingUrl) as string,
      favIconUrl: tab.favIconUrl,
    }));
}
