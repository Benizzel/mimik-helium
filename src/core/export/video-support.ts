export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 720;

export const FPS = 30;
export const STEP_ZOOMED_OUT_SEC = 1.5;
export const STEP_ZOOM_TRANSITION_SEC = 0.73;
export const STEP_ZOOMED_IN_SEC = 3;
export const STEP_SECONDS = STEP_ZOOMED_OUT_SEC + STEP_ZOOM_TRANSITION_SEC + STEP_ZOOMED_IN_SEC;

export const AVC_CODEC = 'avc1.64001f';
export const VP9_CODEC = 'vp09.00.31.08';

export type VideoContainer = 'mp4' | 'webm';

async function encodes(codec: string): Promise<boolean> {
  try {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
    });
    return Boolean(supported);
  } catch {
    return false;
  }
}

async function probe(): Promise<VideoContainer | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  if (await encodes(AVC_CODEC)) return 'mp4';
  return (await encodes(VP9_CODEC)) ? 'webm' : null;
}

let pending: Promise<VideoContainer | null> | undefined;

export function pickContainer(): Promise<VideoContainer | null> {
  pending ??= probe();
  return pending;
}

export async function canExportVideo(): Promise<boolean> {
  return (await pickContainer()) !== null;
}
