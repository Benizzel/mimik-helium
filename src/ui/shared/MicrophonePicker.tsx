import { Mic, Square, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { i18n } from '#imports';
import { getActiveTab } from '@/lib/browser-api';
import { openMicPermissionPage } from '@/lib/offscreen';
import { Button } from '@/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/ui/select';
import {
  isMicrophoneMissing,
  type MicrophoneDevice,
  microphoneListState,
  nextMicLevel,
  SPEAKING_LEVEL,
  SYSTEM_DEFAULT_VALUE,
  toMicrophoneOptions,
  toSelectValue,
  toStoredMicrophoneId,
} from './microphones';

interface MicrophonePickerProps {
  value: string;
  onChange: (deviceId: string) => void;
}

interface MicTest {
  stream: MediaStream;
  context: AudioContext;
  timer: number;
}

const MICROPHONE: PermissionDescriptor = { name: 'microphone' as PermissionName };
const ANALYSER_FFT_SIZE = 2048;
const METER_INTERVAL_MS = 80;

export default function MicrophonePicker({ value, onChange }: MicrophonePickerProps) {
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [testFailed, setTestFailed] = useState(false);
  const test = useRef<MicTest | null>(null);
  const triggerId = useId();

  const refresh = useCallback(async () => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    setDevices(await media.enumerateDevices().catch(() => [] as MediaDeviceInfo[]));
  }, []);

  const stopTest = useCallback(() => {
    const running = test.current;
    test.current = null;
    setTesting(false);
    setLevel(0);
    if (!running) return;
    window.clearInterval(running.timer);
    for (const track of running.stream.getTracks()) track.stop();
    void running.context.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    void refresh();
    const media = navigator.mediaDevices;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    media?.addEventListener('devicechange', refresh);
    document.addEventListener('visibilitychange', onVisible);

    let status: PermissionStatus | undefined;
    navigator.permissions
      ?.query(MICROPHONE)
      .then((result) => {
        status = result;
        result.addEventListener('change', refresh);
      })
      .catch(() => undefined);

    return () => {
      media?.removeEventListener('devicechange', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      status?.removeEventListener('change', refresh);
    };
  }, [refresh]);

  useEffect(() => stopTest, [stopTest]);

  const requestAccess = useCallback(async () => {
    const tab = await getActiveTab().catch(() => undefined);
    await openMicPermissionPage(tab?.id).catch(() => undefined);
    await refresh();
  }, [refresh]);

  const startTest = useCallback(async () => {
    stopTest();
    setTestFailed(false);
    const deviceId = value.trim();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const context = new AudioContext();
      if (context.state === 'suspended') await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      const mute = context.createGain();
      mute.gain.value = 0;
      context.createMediaStreamSource(stream).connect(analyser);
      analyser.connect(mute);
      mute.connect(context.destination);

      const frame = new Float32Array(analyser.fftSize);
      let current = 0;
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(frame);
        let sum = 0;
        for (const sample of frame) sum += sample * sample;
        current = nextMicLevel(Math.sqrt(sum / frame.length), current);
        setLevel(current);
      }, METER_INTERVAL_MS);

      test.current = { stream, context, timer };
      setTesting(true);
    } catch {
      setTestFailed(true);
    }
  }, [stopTest, value]);

  const state = microphoneListState(devices);
  const options = toMicrophoneOptions(devices);
  const missing = isMicrophoneMissing(value, options);

  return (
    <div>
      <label
        htmlFor={state === 'ready' ? triggerId : undefined}
        className="block text-[11px] font-semibold text-foreground mb-1"
      >
        {i18n.t('settings.microphone')}
      </label>

      {state === 'no-devices' && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.microphoneNone')}</p>
      )}

      {state === 'unlabelled' && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {i18n.t('settings.microphoneNeedsAccess')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void requestAccess()}
            className="w-full text-[11px] font-semibold"
          >
            <Mic size={12} />
            {i18n.t('settings.microphoneGrantAccess')}
          </Button>
        </div>
      )}

      {state === 'ready' && (
        <div className="space-y-2">
          <Select
            value={toSelectValue(value)}
            onValueChange={(next) => {
              stopTest();
              onChange(toStoredMicrophoneId(next));
            }}
          >
            <SelectTrigger
              id={triggerId}
              aria-label={i18n.t('settings.microphone')}
              className="rounded-lg border-border bg-card text-[13px] font-medium text-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SYSTEM_DEFAULT_VALUE}>{i18n.t('settings.microphoneDefault')}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.deviceId} value={option.deviceId}>
                  {option.label}
                </SelectItem>
              ))}
              {missing && (
                <SelectItem value={toSelectValue(value)}>{i18n.t('settings.microphoneUnavailable')}</SelectItem>
              )}
            </SelectContent>
          </Select>

          {missing && (
            <p className="flex items-start gap-1.5 text-[10px] text-destructive leading-relaxed">
              <TriangleAlert size={11} className="shrink-0 mt-0.5" />
              <span>{i18n.t('settings.microphoneMissing')}</span>
            </p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => (testing ? stopTest() : void startTest())}
            className="w-full text-[11px] font-semibold"
          >
            {testing ? <Square size={11} /> : <Mic size={11} />}
            {i18n.t(testing ? 'settings.microphoneTestStop' : 'settings.microphoneTest')}
          </Button>

          {testing ? (
            <div className="space-y-1">
              <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-100 motion-reduce:transition-none"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
              <p aria-live="polite" className="text-[10px] text-muted-foreground">
                {i18n.t(level > SPEAKING_LEVEL ? 'voice.micHearing' : 'voice.micQuiet')}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground leading-relaxed">{i18n.t('settings.microphoneTestHint')}</p>
          )}

          {testFailed && (
            <p className="text-[10px] text-destructive leading-relaxed">{i18n.t('settings.microphoneTestFailed')}</p>
          )}
        </div>
      )}
    </div>
  );
}
