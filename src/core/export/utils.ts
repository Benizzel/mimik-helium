import { i18n } from '#imports';
import type { Step } from '@/core/guides/types';

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function extractDomain(steps: Step[]): string | null {
  const stepWithUrl = steps.find((s) => s.url);
  if (!stepWithUrl) return null;
  try {
    return new URL(stepWithUrl.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', es: 'es', 'pt-BR': 'pt-BR', fr: 'fr', de: 'de-DE' };

export function formatDate(timestamp: number): string {
  let locale = 'en-US';
  try {
    const meta = i18n.t('meta.locale');
    if (meta && LOCALE_MAP[meta]) locale = LOCALE_MAP[meta];
  } catch {}
  return new Date(timestamp).toLocaleDateString(locale, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function fetchFaviconBase64(domain: string): Promise<string | null> {
  try {
    const url = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=32&drop_404_icon=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}
