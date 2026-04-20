/**
 * Overlay Manager - Main controller for camera overlay UI
 */
import { TorchState } from './definitions';
import type {
  CameraMultiCapturePlugin,
  CameraOverlayResult,
  PhotoAddedEvent,
  PhotoUpdatedEvent,
  PhotoRemovedEvent,
  VideoAddedEvent,
  VideoRemovedEvent,
  VideoRecordingStartedEvent,
  VideoRecordingStoppedEvent,
} from './definitions';
import { CameraController } from './controllers/camera-controller';
import { GalleryController } from './controllers/gallery-controller';
import { merge } from 'lodash';
import { defaultButtons } from './ui/default-styles';
import { createButton, createShotCounter, updateShotCounter, setButtonIcon } from './ui/ui-factory';
import {
  createOverlayContainer,
  createPositionContainers,
  createBottomGridCells,
  createGallery,
} from './ui/layout-manager';
import type { ButtonsConfig, CameraOverlayUIOptions } from './types/ui-types';
import { PinchZoomHandler } from './ui/pinch-zoom-handler';
import { bindCaptureGestures } from './ui/capture-gesture-handler';
import type { CaptureGestureBinding } from './ui/capture-gesture-handler';

/**
 * Main class to manage camera overlay UI
 */
export class OverlayManager {
  private options: CameraOverlayUIOptions;
  private overlayElement: HTMLElement | null = null;
  private cameraController: CameraController;
  private galleryController: GalleryController | null = null;
  private isActive = false;
  private resolvePromise: ((value: CameraOverlayResult) => void) | null = null;
  private bodyBackgroundColor: string | null = null;
  private zoomContainer: HTMLElement | null = null;
  private zoomConfig: any = null;
  private zoomButtonsList: HTMLButtonElement[] = [];
  private zoomButtonLevels: number[] = [];
  private shotCounter: HTMLElement | null = null;
  private shotCount: number = 0;
  private torchButton: HTMLButtonElement | null = null;
  private torchConfig: any | null = null;
  private pinchHandler: PinchZoomHandler | null = null;
  private isRecordingVideo = false;
  private captureButton: HTMLButtonElement | null = null;
  private captureGestureBinding: CaptureGestureBinding | null = null;
  private recordingIndicator: HTMLElement | null = null;
  private recordingTimerText: HTMLElement | null = null;
  private recordingStartedAt = 0;
  private recordingIntervalId: number | null = null;
  private boundOrientationHandler: (() => void) | null = null;

  constructor(plugin: CameraMultiCapturePlugin, options: CameraOverlayUIOptions) {
    this.options = options;
    this.cameraController = new CameraController(plugin, options);
  }

  /**
   * Emits photoAdded event using pure JavaScript events
   */
  private emitPhotoAddedEvent(eventData: PhotoAddedEvent): void {
    try {
      const event = new CustomEvent('photoAdded', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit photoAdded event:', error);
    }
  }

  /**
   * Emits photoUpdated event using pure JavaScript events
   */
  private emitPhotoUpdatedEvent(eventData: PhotoUpdatedEvent): void {
    try {
      const event = new CustomEvent('photoUpdated', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit photoUpdated event:', error);
    }
  }

  /**
   * Emits photoRemoved event using pure JavaScript events
   */
  private emitPhotoRemovedEvent(eventData: PhotoRemovedEvent): void {
    try {
      const event = new CustomEvent('photoRemoved', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit photoRemoved event:', error);
    }
  }

  /**
   * Emits videoRecordingStarted event using pure JavaScript events.
   */
  private emitVideoRecordingStartedEvent(eventData: VideoRecordingStartedEvent): void {
    try {
      const event = new CustomEvent('videoRecordingStarted', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit videoRecordingStarted event:', error);
    }
  }

  /**
   * Emits videoRecordingStopped event using pure JavaScript events.
   */
  private emitVideoRecordingStoppedEvent(eventData: VideoRecordingStoppedEvent): void {
    try {
      const event = new CustomEvent('videoRecordingStopped', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit videoRecordingStopped event:', error);
    }
  }

  /**
   * Emits videoAdded event using pure JavaScript events.
   */
  private emitVideoAddedEvent(eventData: VideoAddedEvent): void {
    try {
      const event = new CustomEvent('videoAdded', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit videoAdded event:', error);
    }
  }

  /**
   * Emits videoRemoved event using pure JavaScript events.
   */
  private emitVideoRemovedEvent(eventData: VideoRemovedEvent): void {
    try {
      const event = new CustomEvent('videoRemoved', { detail: eventData });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('[CameraMultiCapture] Failed to emit videoRemoved event:', error);
    }
  }

  /**
   * Shows the camera overlay and returns captured images
   */
  async setup(): Promise<CameraOverlayResult> {
    // Only allow one active overlay at a time
    if (this.isActive) {
      throw new Error('Camera overlay is already active');
    }

    this.isActive = true;

    return new Promise<CameraOverlayResult>(async (resolve) => {
      this.resolvePromise = resolve;

      try {
        this.createOverlayUI();

        const container = document.getElementById(this.options.containerId);
        if (!container) {
          throw new Error(`Container with ID ${this.options.containerId} not found`);
        }

        this.bodyBackgroundColor = document.body.style.backgroundColor;
        document.body.style.backgroundColor = 'transparent';

        await this.cameraController.initialize(container, this.options.quality ?? 90);

        // Create zoom buttons after camera init
        if (this.zoomContainer && this.zoomConfig) {
          await this.createZoomButtonsAfterInit();
        }

        // JavaScript pinch-to-zoom when enabled
        if (this.options.pinchToZoom?.enabled) {
          this.pinchHandler = new PinchZoomHandler(
            this.cameraController,
            { options: this.options },
            (zoom) => this.updateZoomButtonSelection(zoom),
          );
          await this.pinchHandler.attach(container);
        }
      } catch (error) {
        console.error('Failed to initialize camera overlay', error);
        resolve({ images: [], videos: [], cancelled: true });
        this.cleanup();
      }
    });
  }

  async refresh(): Promise<void> {
    await this.cameraController.refresh();
  }

  private handleOrientationChange(): void {
    this.refresh();
  }

  /**
   * Creates the overlay UI
   */
  private createOverlayUI(): void {
    const container = document.getElementById(this.options.containerId);
    if (!container) {
      throw new Error(`Container with ID ${this.options.containerId} not found`);
    }

    // Create overlay container
    this.overlayElement = createOverlayContainer(this.options.containerId);

    // Create position containers
    const positions = createPositionContainers(this.overlayElement);

    // Create bottom grid cells
    const bottomCells = createBottomGridCells(positions.bottomGrid);

    const galleryElement = createGallery(this.overlayElement);
    if (this.options.maxCaptures === 1) {
      galleryElement.style.display = 'none';
    }
    this.galleryController = new GalleryController(
      galleryElement,
      this.options.thumbnailStyle,
      undefined,
      (eventData: PhotoAddedEvent) => {
        this.emitPhotoAddedEvent(eventData);
      },
      (eventData: PhotoUpdatedEvent) => {
        this.emitPhotoUpdatedEvent(eventData);
      },
      (eventData: PhotoRemovedEvent) => {
        this.emitPhotoRemovedEvent(eventData);
      },
      (eventData: VideoAddedEvent) => {
        this.emitVideoAddedEvent(eventData);
      },
      (eventData: VideoRemovedEvent) => {
        this.emitVideoRemovedEvent(eventData);
      },
      (totalCount: number) => {
        if (this.options.showShotCounter) {
          this.shotCount = totalCount;
          if (this.shotCounter) {
            updateShotCounter(this.shotCounter, this.shotCount);
          }
        }
      },
      typeof this.options.enableEditing === 'object' ? true : (this.options.enableEditing ?? false),
      typeof this.options.enableEditing === 'object' ? this.options.enableEditing.markerJsLicenseKey : undefined,
    );

    // Merge default buttons with user-provided options
    const buttons: ButtonsConfig = merge(defaultButtons, this.options.buttons || {});

    // Create buttons
    const captureBtn = createButton(buttons.capture);
    this.captureButton = captureBtn;

    // Create shot counter only if enabled
    if (this.options.showShotCounter) {
      this.shotCounter = createShotCounter();
    }

    // Place capture button back in center (no container needed)
    bottomCells.middle.appendChild(captureBtn);

    this.ensureRecordingGlowStyles();

    this.recordingIndicator = this.createRecordingIndicator();
    Object.assign(this.recordingIndicator.style, {
      position: 'absolute',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
    });
    this.overlayElement.appendChild(this.recordingIndicator);

    this.captureGestureBinding = bindCaptureGestures(captureBtn, {
      onTap: () => this.handleCaptureTap(),
      onHoldStart: () => this.handleCaptureHoldStart(),
      onHoldEnd: () => this.handleCaptureRelease(),
    });

    // Only show Done button if not in single capture mode
    if (this.options.maxCaptures !== 1) {
      const doneBtn = createButton(buttons.done);

      // If counter is enabled, create a container with counter and done button
      if (this.shotCounter) {
        const rightContainer = document.createElement('div');
        Object.assign(rightContainer.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.625rem',
        });

        rightContainer.appendChild(this.shotCounter);
        rightContainer.appendChild(doneBtn);
        bottomCells.right.appendChild(rightContainer);
      } else {
        // No counter, just add done button directly
        bottomCells.right.appendChild(doneBtn);
      }

      doneBtn.onclick = () => {
        this.completeCapture(false);
      };
    } else {
      // Single capture mode - if counter is enabled, show it in the right cell
      if (this.shotCounter) {
        bottomCells.right.appendChild(this.shotCounter);
      }
    }

    const cancelBtn = createButton(buttons.cancel);
    bottomCells.left.appendChild(cancelBtn);

    cancelBtn.onclick = () => {
      this.completeCapture(true);
    };

    if (buttons.switchCamera) {
      this.createSwitchCameraButton(buttons.switchCamera, positions.topRight);
    }

    if (buttons.torch) {
      this.createTorchButton(buttons.torch, positions.topRight);
    }

    if (buttons.flash) {
      this.createFlashButton(buttons.flash, positions.topLeft);
    }

    if (buttons.zoom) {
      // Store zoom config and container for later creation
      this.zoomConfig = buttons.zoom;
      this.zoomContainer = positions.zoomRow;
    }

    this.boundOrientationHandler = () => this.handleOrientationChange();
    window.addEventListener('orientationchange', this.boundOrientationHandler);
  }

  /**
   * Creates the switch camera button
   */
  private createSwitchCameraButton(config: any, container: HTMLElement): void {
    const switchBtn = createButton(config);

    switchBtn.onclick = async () => {
      try {
        await this.cameraController.switchCamera();
        await this.refreshTorchIconFromState();
      } catch (error) {
        console.error('Failed to switch camera', error);
      }
    };

    container.appendChild(switchBtn);
  }

  /**
   * Creates the torch (flashlight) toggle button, stacked below the switch camera button.
   */
  private createTorchButton(config: any, container: HTMLElement): void {
    const torchBtn = createButton({
      ...config,
      icon: config.offIcon,
    });

    this.torchButton = torchBtn;
    this.torchConfig = config;

    const updateTorchIcon = async (state: TorchState) => {
      const icon = state === TorchState.On ? config.onIcon : config.offIcon;
      if (icon) {
        await setButtonIcon(torchBtn, icon);
      }
    };

    torchBtn.onclick = async () => {
      try {
        const state = await this.cameraController.toggleTorch();
        await updateTorchIcon(state);
      } catch (error) {
        console.error('Failed to toggle torch', error);
      }
    };

    // Best-effort initial state sync; defaults to off if call fails.
    this.cameraController.getTorch()
      .then((state) => updateTorchIcon(state))
      .catch(() => { /* initial sync is optional */ });

    container.appendChild(torchBtn);
  }

  /**
   * Refreshes the torch icon based on current native torch state.
   */
  private async refreshTorchIconFromState(): Promise<void> {
    if (!this.torchButton || !this.torchConfig) return;
    try {
      const state = await this.cameraController.getTorch();
      const icon = state === TorchState.On ? this.torchConfig.onIcon : this.torchConfig.offIcon;
      if (icon) {
        await setButtonIcon(this.torchButton, icon);
      }
    } catch {
      // state sync failure is non-blocking; keep current icon
    }
  }

  /**
   * Creates zoom buttons after camera initialization
   */
  private async createZoomButtonsAfterInit(): Promise<void> {
    if (!this.zoomContainer || !this.zoomConfig) return;

    let smartZoomLevels: { level: number; isPhysicalCamera: boolean }[];

    try {
      // Get smart zoom levels that include physical camera switches
      smartZoomLevels = await this.cameraController.getSmartZoomLevels();
    } catch (error) {
      // Use fallback zoom levels
      const fallbackLevels = this.zoomConfig.levels || [1, 2, 3, 4];
      smartZoomLevels = fallbackLevels.map((level: number) => ({ level, isPhysicalCamera: false }));
    }

    // Create zoom buttons with the smart levels
    this.createZoomButtons(smartZoomLevels, this.zoomContainer);
  }

  /**
   * Creates smart zoom buttons with physical camera indication
   */
  private createZoomButtons(levels: { level: number; isPhysicalCamera: boolean }[], container: HTMLElement): void {
    const config = this.zoomConfig || {};

    // Track buttons and their corresponding zoom levels so we can update them from pinch and clicks
    this.zoomButtonsList = [];
    this.zoomButtonLevels = levels.map((z) => z.level);

    let currentZoomLevel = 1; // Default zoom level

    // Add zoom buttons in a horizontal row
    levels.forEach((zoomInfo) => {
      const level: any = zoomInfo.level;

      // Format zoom level display
      let displayText: string;
      if (level === 1) {
        // Special case for 1x - always show as "1x"
        displayText = '1x';
      } else if (level % 1 === 0) {
        // Show as integer for whole numbers (2x, 3x, etc.)
        displayText = `${Math.round(level)}x`;
      } else {
        // Round to one decimal place for fractional numbers (0.673434 -> 0.7x)
        displayText = `${Math.round(level * 10) / 10}x`;
      }

      // Create a button for each zoom level
      const zoomBtn = createButton({ ...config, text: displayText });

      // Make zoom buttons smaller and more compact
      Object.assign(zoomBtn.style, {
        padding: '5px 8px',
        minWidth: '40px',
        minHeight: '30px',
        margin: '0 3px',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.2s ease',
      });

      zoomBtn.onclick = async () => {
        try {
          // Use smart zoom to handle physical camera switching
          await this.cameraController.performSmartZoom(level);
          currentZoomLevel = level;

          // Update button states based on the new zoom level
          this.updateZoomButtonSelection(currentZoomLevel);
        } catch (error) {
          console.error(`Failed to set zoom to ${level}x`, error);
        }
      };

      this.zoomButtonsList.push(zoomBtn);
      container.appendChild(zoomBtn);
    });

    // Initial highlight (typically 1x)
    this.updateZoomButtonSelection(currentZoomLevel);
  }

  /**
   * Updates zoom button styles so the button closest to currentZoom is highlighted.
   */
  private updateZoomButtonSelection(currentZoom: number): void {
    if (!this.zoomButtonsList.length || !this.zoomButtonLevels.length) return;
    
    // Find the zoom level closest to the current zoom
    let nearestIdx = 0;
    let bestDist = Math.abs(this.zoomButtonLevels[0] - currentZoom);

    for (let i = 1; i < this.zoomButtonLevels.length; i++) {
      const d = Math.abs(this.zoomButtonLevels[i] - currentZoom);
      if (d < bestDist) {
        bestDist = d;
        nearestIdx = i;
      }
    }

    // Highlight only the nearest button
    this.zoomButtonsList.forEach((btn, idx) => {
      if (idx === nearestIdx) {
        Object.assign(btn.style, {
          backgroundColor: '#ffffff',
          color: '#000000',
          fontWeight: '700',
        });
      } else {
        Object.assign(btn.style, {
          backgroundColor: 'rgba(0,0,0,0.5)',
          color: '#ffffff',
          fontWeight: '500',
        });
      }
    });
  }

  /**
   * Creates the flash toggle button
   */
  private createFlashButton(config: any, container: HTMLElement): void {
    const flashBtn = createButton({
      ...config,
      icon: config.offIcon // Start with off icon
    });

    const updateFlashIcon = async (mode: 'on' | 'off' | 'auto') => {
      let icon: string;
      switch (mode) {
        case 'on':
          icon = config.onIcon;
          break;
        case 'auto':
          // Only show auto icon if auto mode is enabled, otherwise show off icon
          icon = this.cameraController.isFlashAutoModeEnabled() ? config.autoIcon : config.offIcon;
          break;
        case 'off':
        default:
          icon = config.offIcon;
          break;
      }
      // Only update icon if one is provided
      if (icon) {
        await setButtonIcon(flashBtn, icon);
      }
    };

    flashBtn.onclick = async () => {
      try {
        const newMode = await this.cameraController.toggleFlash();
        await updateFlashIcon(newMode);
      } catch (error) {
        console.error('Failed to toggle flash', error);
      }
    };

    container.appendChild(flashBtn);
  }

  /**
   * Handles quick tap capture for still images.
   */
  private async handleCaptureTap(): Promise<void> {
    try {
      // Turn off torch before capture when flash is enabled to prevent LED conflict
      const flashMode = this.cameraController.getFlashMode();
      if (flashMode === 'on' || flashMode === 'auto') {
        const torchState = await this.cameraController.getTorch();
        if (torchState === TorchState.On) {
          await this.cameraController.setTorch(TorchState.Off);
          await this.refreshTorchIconFromState();
        }
      }

      const imageData = await this.cameraController.captureImage();
      if (!imageData || !this.galleryController) return;

      this.galleryController.addImage(imageData);

      if (this.options.maxCaptures && this.galleryController.getImages().length >= this.options.maxCaptures) {
        setTimeout(() => this.completeCapture(false), 100);
      }
    } catch (error) {
      console.error('Failed to capture image', error);
    }
  }

  /**
   * Handles long press start to begin video recording.
   */
  private async handleCaptureHoldStart(): Promise<void> {
    if (this.isRecordingVideo || this.cameraController.getRecordingState()) {
      return;
    }
    try {
      await this.cameraController.startVideoRecording();
      this.isRecordingVideo = true;
      this.recordingStartedAt = Date.now();
      this.startRecordingTimer();
      this.showRecordingIndicator(true);
      this.setCaptureGlow(true);
      this.emitVideoRecordingStartedEvent({ timestamp: this.recordingStartedAt });
    } catch (error) {
      this.isRecordingVideo = false;
      console.error('Failed to start video recording', error);
    }
  }

  /**
   * Handles pointer release for either tap photo or stop video recording.
   */
  private async handleCaptureRelease(): Promise<void> {
    if (!this.isRecordingVideo) {
      return;
    }

    try {
      const videoData = await this.cameraController.stopVideoRecording();
      this.isRecordingVideo = false;
      this.stopRecordingTimer();
      this.showRecordingIndicator(false);
      this.setCaptureGlow(false);

      if (videoData && this.galleryController) {
        this.galleryController.addVideo(videoData);
        this.emitVideoRecordingStoppedEvent({
          video: videoData,
          totalCount: this.galleryController.getVideos().length,
        });
      }
      await this.refreshTorchIconFromState();
    } catch (error) {
      this.isRecordingVideo = false;
      this.stopRecordingTimer();
      this.showRecordingIndicator(false);
      this.setCaptureGlow(false);
      console.error('Failed to stop video recording', error);
    }
  }

  private ensureRecordingGlowStyles(): void {
    const id = 'cmmc-recording-glow-styles';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes cmmcCaptureGlow {
        0%   { filter: drop-shadow(0 0 6px rgba(255, 59, 48, 0.7)); }
        50%  { filter: drop-shadow(0 0 18px rgba(255, 59, 48, 1)) drop-shadow(0 0 40px rgba(255, 59, 48, 0.5)); }
        100% { filter: drop-shadow(0 0 6px rgba(255, 59, 48, 0.7)); }
      }
      .cmmc-capture-recording {
        animation: cmmcCaptureGlow 1.2s ease-in-out infinite !important;
        filter: drop-shadow(0 0 6px rgba(255, 59, 48, 0.7)) !important;
      }
    `;
    document.head.appendChild(style);
  }

  private setCaptureGlow(active: boolean): void {
    if (!this.captureButton) return;
    if (active) {
      this.captureButton.classList.add('cmmc-capture-recording');
    } else {
      this.captureButton.classList.remove('cmmc-capture-recording');
    }
  }

  private createRecordingIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    const dot = document.createElement('span');
    const timer = document.createElement('span');
    timer.textContent = '00:00';

    Object.assign(indicator.style, {
      display: 'none',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 10px',
      borderRadius: '14px',
      background: 'rgba(0, 0, 0, 0.55)',
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: '600',
      pointerEvents: 'none',
      zIndex: '4',
    });

    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#ff3b30',
      boxShadow: '0 0 10px rgba(255, 59, 48, 0.9)',
      animation: 'cmmcRecordPulse 1s infinite',
    });

    const styleTag = document.createElement('style');
    styleTag.textContent = `
      @keyframes cmmcRecordPulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    indicator.appendChild(styleTag);
    indicator.appendChild(dot);
    indicator.appendChild(timer);
    this.recordingTimerText = timer;

    return indicator;
  }

  private showRecordingIndicator(visible: boolean): void {
    if (!this.recordingIndicator) return;
    this.recordingIndicator.style.display = visible ? 'flex' : 'none';
    if (!visible && this.recordingTimerText) {
      this.recordingTimerText.textContent = '00:00';
    }
  }

  private startRecordingTimer(): void {
    this.stopRecordingTimer();
    this.recordingIntervalId = window.setInterval(() => {
      if (!this.recordingTimerText) return;
      const elapsedSeconds = Math.floor((Date.now() - this.recordingStartedAt) / 1000);
      if (this.options.maxRecordingDuration && elapsedSeconds >= this.options.maxRecordingDuration) {
        // Prevent duplicate stop calls while awaiting native stop completion.
        this.stopRecordingTimer();
        void this.handleCaptureRelease();
        return;
      }
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      this.recordingTimerText.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 200);
  }

  private stopRecordingTimer(): void {
    if (this.recordingIntervalId !== null) {
      clearInterval(this.recordingIntervalId);
      this.recordingIntervalId = null;
    }
  }

  /**
   * Completes the capture process
   */
  private completeCapture(cancelled: boolean): void {
    const images = this.galleryController?.getImages() || [];
    const videos = this.galleryController?.getVideos() || [];

    this.cleanup();

    if (this.resolvePromise) {
      this.resolvePromise({
        images: !cancelled ? images.map(img => img.data) : [],
        videos: !cancelled ? videos.map(vid => vid.data) : [],
        cancelled
      });
      this.resolvePromise = null;
    }
  }

  /**
   * Cleans up resources
   */
  private cleanup(): void {
    if (this.captureGestureBinding) {
      this.captureGestureBinding.detach();
      this.captureGestureBinding = null;
    }
    if (this.isRecordingVideo) {
      this.cameraController.stopVideoRecording().catch(() => {
        // best effort stop during cleanup
      });
      this.isRecordingVideo = false;
    }
    this.stopRecordingTimer();
    this.showRecordingIndicator(false);
    this.setCaptureGlow(false);
    this.recordingIndicator = null;
    this.recordingTimerText = null;
    this.captureButton = null;
    this.torchButton = null;
    this.torchConfig = null;
    if (this.pinchHandler) {
      this.pinchHandler.detach();
      this.pinchHandler = null;
    }
    this.cameraController.stop().catch((err) => {
      console.warn('Error stopping camera', err);
    });

    if (this.overlayElement && this.overlayElement.parentElement) {
      this.overlayElement.parentElement.removeChild(this.overlayElement);
    }

    this.overlayElement = null;
    this.galleryController = null;
    this.isActive = false;
    this.shotCounter = null;
    this.shotCount = 0; // Reset shot count for next session
    if (this.bodyBackgroundColor) {
      document.body.style.backgroundColor = this.bodyBackgroundColor;
    }
    if (this.boundOrientationHandler) {
      window.removeEventListener('orientationchange', this.boundOrientationHandler);
      this.boundOrientationHandler = null;
    }
  }
}
