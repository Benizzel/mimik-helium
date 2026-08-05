import PQueue from 'p-queue';
import { sendMessage } from '@/lib/messaging';
import { extractDOMContext } from '../dom/context';
import { extractElementMeta } from '../dom/element-meta';
import { findFocusableAncestor, isMimikElement, isNavigatingClick, isTextField } from '../dom/element-utils';
import { InputSession } from './input-session';

const DEDUP_MS = 300;
const DRAG_MIN_PX = 30;
const INTERCEPT_DELAY_MS = 100;
const PAINT_FRAMES = 3;

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    let remaining = PAINT_FRAMES;
    const tick = () => {
      if (--remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let lastClickTarget: Element | null = null;
let lastClickTime = 0;

export interface CaptureHandle {
  stop: () => void;
}

const PASSIVE_CAPTURE = { capture: true, passive: true } as const;
const ACTIVE_CAPTURE = { capture: true } as const;

class CaptureController {
  private input: InputSession;
  private queue = new PQueue({ concurrency: 1 });
  private listeners: [string, EventListener, AddEventListenerOptions][] = [];
  private dragStartX: number | null = null;
  private dragStartY: number | null = null;
  private dragStartElement: Element | null = null;

  constructor(
    private guideId: string,
    isTopFrame: boolean,
  ) {
    this.input = new InputSession(guideId);
    this.listeners = [
      ['click', this.onClick.bind(this), ACTIVE_CAPTURE],
      ['auxclick', this.onAuxClick.bind(this), ACTIVE_CAPTURE],
      ['keydown', this.onKeydown.bind(this), ACTIVE_CAPTURE],
      ['input', this.onInput.bind(this), PASSIVE_CAPTURE],
      ['focusout', this.onFocusOut.bind(this), PASSIVE_CAPTURE],
    ];
    if (isTopFrame) {
      this.listeners.push(
        ['copy', this.onClipboard.bind(this), PASSIVE_CAPTURE],
        ['paste', this.onClipboard.bind(this), PASSIVE_CAPTURE],
        ['cut', this.onClipboard.bind(this), PASSIVE_CAPTURE],
        ['pointerdown', this.onPointerDown.bind(this), PASSIVE_CAPTURE],
        ['pointerup', this.onPointerUp.bind(this), PASSIVE_CAPTURE],
        ['dragend', this.onDragEnd.bind(this), PASSIVE_CAPTURE],
      );
    }
    for (const [event, handler, opts] of this.listeners) {
      window.addEventListener(event, handler, opts);
    }
  }

  private async captureAction(action: string, target: HTMLElement, point?: { x: number; y: number }) {
    await waitForPaint();
    const elementMeta = extractElementMeta(target);
    await sendMessage('captureStep', {
      guideId: this.guideId,
      action,
      elementMeta: point ? { ...elementMeta, clickPoint: point } : elementMeta,
      domContext: extractDOMContext(target, action),
    });
  }

  private onClick(e: Event) {
    const me = e as MouseEvent;
    const raw = me.target;
    if (!raw || !(raw instanceof Element)) return;
    const target = findFocusableAncestor(raw);
    if (isMimikElement(target)) return;

    const now = Date.now();
    if (target === lastClickTarget && now - lastClickTime < DEDUP_MS) return;
    lastClickTarget = target;
    lastClickTime = now;

    if (isTextField(target)) {
      this.queue.add(async () => {
        if (this.input.active && this.input.target !== target) await this.input.finalize();
        if (!this.input.active) await this.input.start(target);
      });
      return;
    }

    if (isNavigatingClick(target)) {
      me.preventDefault();
      me.stopImmediatePropagation();
      this.queue.add(() => this.captureAction('click', target, { x: me.clientX, y: me.clientY }));
      const anchor = target.closest('a[href]') as HTMLAnchorElement;
      if (anchor) {
        const href = anchor.href;
        requestAnimationFrame(() =>
          setTimeout(() => {
            window.location.href = href;
          }, INTERCEPT_DELAY_MS),
        );
      }
      return;
    }

    this.queue.add(() => this.captureAction('click', target, { x: me.clientX, y: me.clientY }));
  }

  private onAuxClick(e: Event) {
    const raw = (e as MouseEvent).target;
    if (!raw || !(raw instanceof Element)) return;
    const target = findFocusableAncestor(raw);
    if (isMimikElement(target)) return;
    this.queue.add(() =>
      this.captureAction('auxclick', target, { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }),
    );
  }

  private onKeydown(e: Event) {
    const ke = e as KeyboardEvent;
    const target = ke.target instanceof HTMLElement ? ke.target : document.activeElement;
    if (!target || !(target instanceof HTMLElement) || isMimikElement(target)) return;

    if (this.input.active && (ke.key === 'Enter' || ke.key === 'Escape')) {
      this.queue.add(() => this.input.finalize());
      return;
    }

    if (isTextField(target)) return;
    this.queue.add(() => this.captureAction(`keydown:${ke.key}`, target));
  }

  private onInput(e: Event) {
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      )
    )
      return;

    if (target instanceof HTMLSelectElement) {
      this.queue.add(() => this.captureAction('input', target));
      return;
    }

    if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) return;

    if (this.input.active && this.input.target !== target) {
      this.queue.add(() => this.input.finalize());
    }

    if (!this.input.active) {
      this.queue.add(() => this.input.start(target));
    } else {
      this.input.update(target);
    }
  }

  private onFocusOut(e: Event) {
    if (!this.input.active) return;
    const related = (e as FocusEvent).relatedTarget;
    if (related instanceof Element && related === this.input.target) return;
    this.queue.add(() => this.input.finalize());
  }

  private onClipboard(e: Event) {
    const target =
      (e as ClipboardEvent).target instanceof HTMLElement
        ? ((e as ClipboardEvent).target as HTMLElement)
        : document.activeElement;
    if (!target || !(target instanceof HTMLElement) || isMimikElement(target)) return;
    this.queue.add(() => this.captureAction(e.type, target));
  }

  private onPointerDown(e: Event) {
    const pe = e as PointerEvent;
    this.dragStartX = pe.pageX;
    this.dragStartY = pe.pageY;
    this.dragStartElement = pe.target instanceof Element ? pe.target : null;
  }

  private onPointerUp(e: Event) {
    const pe = e as PointerEvent;
    if (this.dragStartX == null || this.dragStartY == null || !this.dragStartElement) {
      this.dragStartX = this.dragStartY = null;
      this.dragStartElement = null;
      return;
    }

    const dx = Math.abs(pe.pageX - this.dragStartX);
    const dy = Math.abs(pe.pageY - this.dragStartY);

    if (dx >= DRAG_MIN_PX || dy >= DRAG_MIN_PX) {
      const target = findFocusableAncestor(this.dragStartElement);
      if (!isMimikElement(target)) this.queue.add(() => this.captureAction('drag', target));
    }

    this.dragStartX = this.dragStartY = null;
    this.dragStartElement = null;
  }

  private onDragEnd(e: Event) {
    if (!e.target || !(e.target instanceof Element) || isMimikElement(e.target)) return;
    this.queue.add(() => this.captureAction('drag', findFocusableAncestor(e.target as Element)));
  }

  stop() {
    for (const [event, handler, opts] of this.listeners) {
      window.removeEventListener(event, handler, opts);
    }
    this.queue.add(() => this.input.finalize());
  }
}

export function startCapture(guideId: string, isTopFrame = true): CaptureHandle {
  const controller = new CaptureController(guideId, isTopFrame);
  return {
    stop: () => controller.stop(),
  };
}
