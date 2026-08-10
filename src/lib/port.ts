import { browser } from '#imports';
import type { CaptureStateValue } from '@/core/capture/machine';
import { logger } from '@/lib/logger';
import type { VoiceErrorReason } from '@/lib/voice-messages';

const PORT_NAME = 'mimik-panel';

export interface PanelStateUpdate {
  type: 'STATE_UPDATE';
  state: CaptureStateValue;
  stepCount: number;
  currentGuideId: string | null;
}

export type VoicePhase = 'idle' | 'recording' | 'transcribing' | 'error';

export interface PanelVoiceUpdate {
  type: 'VOICE_UPDATE';
  phase: VoicePhase;
  reason?: VoiceErrorReason;
  error?: string;
  narrated?: number;
}

type PortMessage = PanelStateUpdate | PanelVoiceUpdate;

export function connectToBackground(callbacks: {
  onStateUpdate: (update: PanelStateUpdate) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onVoiceUpdate?: (update: PanelVoiceUpdate) => void;
}): () => void {
  let port: ReturnType<typeof browser.runtime.connect> | null = null;
  let destroyed = false;

  function connect() {
    if (destroyed) return;

    try {
      port = browser.runtime.connect({ name: PORT_NAME });
      logger.debug('Port connected to background');
      callbacks.onConnect();

      port.onMessage.addListener((msg: PortMessage) => {
        if (msg.type === 'STATE_UPDATE') {
          callbacks.onStateUpdate(msg);
        } else if (msg.type === 'VOICE_UPDATE') {
          callbacks.onVoiceUpdate?.(msg);
        }
      });

      port.onDisconnect.addListener(() => {
        port = null;
        if (!destroyed) {
          logger.debug('Port disconnected, reconnecting in 1s...');
          callbacks.onDisconnect();
          setTimeout(connect, 1000);
        }
      });
    } catch {
      if (!destroyed) {
        logger.debug('Port connect failed, retrying in 1s...');
        setTimeout(connect, 1000);
      }
    }
  }

  connect();

  return () => {
    destroyed = true;
    port?.disconnect();
    port = null;
  };
}

const connectedPorts = new Set<ReturnType<typeof browser.runtime.connect>>();

export function setupPortListener(onPanelConnect?: (port: ReturnType<typeof browser.runtime.connect>) => void) {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;

    connectedPorts.add(port);
    onPanelConnect?.(port);

    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  });
}

function broadcastToPanel(message: PortMessage): void {
  for (const port of connectedPorts) {
    try {
      port.postMessage(message);
    } catch {
      connectedPorts.delete(port);
    }
  }
}

export function broadcastStateToPanel(update: PanelStateUpdate): void {
  broadcastToPanel(update);
}

export function broadcastVoiceToPanel(update: PanelVoiceUpdate): void {
  broadcastToPanel(update);
}
