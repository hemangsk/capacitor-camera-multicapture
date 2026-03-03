import type { CameraOverlayUIOptions } from '../types/ui-types';
import { CameraController } from '../controllers/camera-controller';

export interface PinchZoomConfig {
  options: CameraOverlayUIOptions;
}

export type ZoomSelectionUpdater = (zoom: number) => void;

/**
 * Encapsulates JavaScript pinch-to-zoom gesture handling for the camera overlay.
 */
export class PinchZoomHandler {
  private pinchElement: HTMLElement | null = null;
  private pinchStartDistance: number = 0;
  private pinchStartZoom: number = 1;
  private pinchMinZoom: number = 1;
  private pinchMaxZoom: number = 1;
  private pinchPresetLevels: number[] = [];
  private isPinching = false;
  private boundPinchStart: ((e: TouchEvent) => void) | null = null;
  private boundPinchMove: ((e: TouchEvent) => void) | null = null;
  private boundPinchEnd: ((e: TouchEvent) => void) | null = null;

  constructor(
    private readonly cameraController: CameraController,
    private readonly config: PinchZoomConfig,
    private readonly updateZoomSelection: ZoomSelectionUpdater
  ) {}

  /**
   * Attach pinch handlers to the given container and initialise zoom ranges.
   */
  async attach(container: HTMLElement): Promise<void> {
    try {
      const zoomInfo = await this.cameraController.getAvailableZoomLevels();
      this.pinchMinZoom = zoomInfo.minZoom;
      this.pinchMaxZoom = zoomInfo.maxZoom;
      this.pinchPresetLevels = zoomInfo.presetLevels?.length
        ? zoomInfo.presetLevels
        : [zoomInfo.minZoom, 1, zoomInfo.maxZoom];
    } catch {
      this.pinchMinZoom = 1;
      this.pinchMaxZoom = 10;
      this.pinchPresetLevels = [1, 2, 3, 5, 10];
    }

    this.pinchElement = container;
    this.boundPinchStart = this.onPinchStart.bind(this);
    this.boundPinchMove = this.onPinchMove.bind(this);
    this.boundPinchEnd = this.onPinchEnd.bind(this);
    container.addEventListener('touchstart', this.boundPinchStart, { passive: true });
    container.addEventListener('touchmove', this.boundPinchMove, { passive: false });
    container.addEventListener('touchend', this.boundPinchEnd, { passive: true });
    container.addEventListener('touchcancel', this.boundPinchEnd, { passive: true });
  }

  /**
   * Detach pinch handlers and clear state.
   */
  detach(): void {
    const el = this.pinchElement;
    if (!el || !this.boundPinchStart || !this.boundPinchMove || !this.boundPinchEnd) return;
    el.removeEventListener('touchstart', this.boundPinchStart);
    el.removeEventListener('touchmove', this.boundPinchMove);
    el.removeEventListener('touchend', this.boundPinchEnd);
    el.removeEventListener('touchcancel', this.boundPinchEnd);
    this.pinchElement = null;
    this.boundPinchStart = null;
    this.boundPinchMove = null;
    this.boundPinchEnd = null;
  }

  private getPinchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  private onPinchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      this.isPinching = true;
      this.pinchStartDistance = this.getPinchDistance(e.touches);
      this.pinchStartZoom = this.cameraController.getCurrentZoom();
    }
  }

  private onPinchMove(e: TouchEvent): void {
    if (e.touches.length !== 2 || !this.isPinching || this.pinchStartDistance <= 0) return;
    e.preventDefault();
    const dist = this.getPinchDistance(e.touches);
    const scale = dist / this.pinchStartDistance;
    let zoom = this.pinchStartZoom * scale;
    zoom = Math.max(this.pinchMinZoom, Math.min(this.pinchMaxZoom, zoom));
    this.cameraController.setZoom(zoom).catch((err) => console.warn('Set zoom failed', err));
    this.updateZoomSelection(zoom);
  }

  private onPinchEnd(e: TouchEvent): void {
    if (e.touches.length >= 2) return;
    if (!this.isPinching) return;
    this.isPinching = false;
    this.pinchStartDistance = 0;
    const lockToNearest = this.config.options.pinchToZoom?.lockToNearestStep === true;
    if (lockToNearest && this.pinchPresetLevels.length > 0) {
      const current = this.cameraController.getCurrentZoom();
      let nearest = this.pinchPresetLevels[0];
      let best = Math.abs(nearest - current);
      for (const level of this.pinchPresetLevels) {
        const d = Math.abs(level - current);
        if (d < best) {
          best = d;
          nearest = level;
        }
      }
      this.cameraController.setZoom(nearest).catch((err) => console.warn('Set zoom failed', err));
      this.updateZoomSelection(nearest);
    } else {
      // Even without snapping, move the highlight to the closest zoom button
      const current = this.cameraController.getCurrentZoom();
      this.updateZoomSelection(current);
    }
  }
}

