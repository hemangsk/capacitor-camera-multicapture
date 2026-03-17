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
    captureBtn.addEventListener('pointerdown', startHoldTimer);
    captureBtn.addEventListener('pointerup', releaseHandler);
    captureBtn.addEventListener('pointerleave', releaseHandler);
    captureBtn.addEventListener('pointercancel', releaseHandler);

    return {
      detach: () => {
        clearHoldTimer();
        captureBtn.removeEventListener('click', clickHandler);
        captureBtn.removeEventListener('pointerdown', startHoldTimer);
        captureBtn.removeEventListener('pointerup', releaseHandler);
        captureBtn.removeEventListener('pointerleave', releaseHandler);
        captureBtn.removeEventListener('pointercancel', releaseHandler);
      },
    };
  }

  captureBtn.addEventListener('touchstart', startHoldTimer);
  captureBtn.addEventListener('touchend', releaseHandler);
  captureBtn.addEventListener('touchcancel', releaseHandler);
  captureBtn.addEventListener('mousedown', startHoldTimer);
  captureBtn.addEventListener('mouseup', releaseHandler);
  captureBtn.addEventListener('mouseleave', releaseHandler);

  return {
    detach: () => {
      clearHoldTimer();
      captureBtn.removeEventListener('click', clickHandler);
      captureBtn.removeEventListener('touchstart', startHoldTimer);
      captureBtn.removeEventListener('touchend', releaseHandler);
      captureBtn.removeEventListener('touchcancel', releaseHandler);
      captureBtn.removeEventListener('mousedown', startHoldTimer);
      captureBtn.removeEventListener('mouseup', releaseHandler);
      captureBtn.removeEventListener('mouseleave', releaseHandler);
    },
  };
}
