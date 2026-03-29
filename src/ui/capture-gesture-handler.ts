export interface CaptureGestureHandlers {
  onTap: () => Promise<void>;
  onHoldStart: () => Promise<void>;
  onHoldEnd: () => Promise<void>;
}

export interface CaptureGestureBinding {
  detach: () => void;
}

/**
 * Binds capture button gestures:
 * - quick tap triggers photo capture
 * - hold for holdDelayMs triggers video recording start
 * - release stops active video recording
 */
export function bindCaptureGestures(
  captureBtn: HTMLButtonElement,
  handlers: CaptureGestureHandlers,
  holdDelayMs = 500
): CaptureGestureBinding {
  let holdTimerId: number | null = null;
  let suppressNextClickAfterHold = false;

  // Prevent iOS from hijacking long-press touches. On newer iPhones (15+)
  // with Haptic Touch, without these properties iOS fires pointercancel or
  // pointerleave ~4 seconds into a hold, interrupting video recording.
  captureBtn.style.touchAction = 'none';
  (captureBtn.style as any).webkitTouchCallout = 'none';
  (captureBtn.style as any).webkitUserSelect = 'none';
  captureBtn.style.userSelect = 'none';

  const clearHoldTimer = () => {
    if (holdTimerId === null) return;
    clearTimeout(holdTimerId);
    holdTimerId = null;
  };

  const startHoldTimer = () => {
    clearHoldTimer();
    holdTimerId = window.setTimeout(async () => {
      suppressNextClickAfterHold = true;
      await handlers.onHoldStart();
    }, holdDelayMs);
  };

  const clickHandler = async () => {
    if (suppressNextClickAfterHold) {
      suppressNextClickAfterHold = false;
      return;
    }
    await handlers.onTap();
  };

  const releaseHandler = async () => {
    clearHoldTimer();
    await handlers.onHoldEnd();
  };

  captureBtn.addEventListener('click', clickHandler);

  if ('PointerEvent' in window) {
    const onPointerDown = (e: PointerEvent) => {
      // Capture the pointer so the element keeps receiving events even if the
      // finger drifts slightly off the button. This prevents spurious
      // pointerleave events on iOS that would stop recording prematurely.
      captureBtn.setPointerCapture(e.pointerId);
      startHoldTimer();
    };

    captureBtn.addEventListener('pointerdown', onPointerDown);
    captureBtn.addEventListener('pointerup', releaseHandler);
    captureBtn.addEventListener('pointercancel', releaseHandler);

    return {
      detach: () => {
        clearHoldTimer();
        captureBtn.removeEventListener('click', clickHandler);
        captureBtn.removeEventListener('pointerdown', onPointerDown);
        captureBtn.removeEventListener('pointerup', releaseHandler);
        captureBtn.removeEventListener('pointercancel', releaseHandler);
      },
    };
  }

  // Touch/mouse fallback for browsers without PointerEvent
  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    startHoldTimer();
  };

  captureBtn.addEventListener('touchstart', onTouchStart, { passive: false });
  captureBtn.addEventListener('touchend', releaseHandler);
  captureBtn.addEventListener('touchcancel', releaseHandler);
  captureBtn.addEventListener('mousedown', startHoldTimer);
  captureBtn.addEventListener('mouseup', releaseHandler);
  captureBtn.addEventListener('mouseleave', releaseHandler);

  return {
    detach: () => {
      clearHoldTimer();
      captureBtn.removeEventListener('click', clickHandler);
      captureBtn.removeEventListener('touchstart', onTouchStart);
      captureBtn.removeEventListener('touchend', releaseHandler);
      captureBtn.removeEventListener('touchcancel', releaseHandler);
      captureBtn.removeEventListener('mousedown', startHoldTimer);
      captureBtn.removeEventListener('mouseup', releaseHandler);
      captureBtn.removeEventListener('mouseleave', releaseHandler);
    },
  };
}
