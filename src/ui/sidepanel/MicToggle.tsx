import { Mic, MicOff } from 'lucide-react';
import { useCallback } from 'react';
import { i18n } from '#imports';
import { getActiveTab, localStorage } from '@/lib/browser-api';
import { abortVoiceCapture, openMicPermissionPage } from '@/lib/offscreen';

interface MicToggleProps {
  enabled: boolean;
  live: boolean;
  onChange: (enabled: boolean) => void;
}

const MICROPHONE: PermissionDescriptor = { name: 'microphone' as PermissionName };

async function microphoneGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query(MICROPHONE);
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export default function MicToggle({ enabled, live, onChange }: MicToggleProps) {
  const toggle = useCallback(async () => {
    const next = !enabled;
    onChange(next);
    await localStorage.set({ voiceEnabled: next });

    if (!next) {
      if (live) await abortVoiceCapture().catch(() => undefined);
      return;
    }

    if (await microphoneGranted()) return;
    const tab = await getActiveTab();
    await openMicPermissionPage(tab?.id).catch(() => undefined);
  }, [enabled, live, onChange]);

  const Icon = enabled ? Mic : MicOff;

  return (
    <button
      onClick={() => void toggle()}
      aria-pressed={enabled}
      className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
        enabled
          ? 'border-accent bg-secondary text-accent'
          : 'border-border text-muted-foreground hover:border-accent hover:text-accent'
      }`}
      title={i18n.t(enabled ? 'voice.turnOff' : 'voice.turnOn')}
    >
      <Icon size={16} />
    </button>
  );
}
