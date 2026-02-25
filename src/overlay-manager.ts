/**
 * Overlay Manager - Main controller for camera overlay UI
 */
import type { CameraMultiCapturePlugin, CameraOverlayResult, PhotoAddedEvent, PhotoRemovedEvent } from './definitions';
import { CameraController } from './controllers/camera-controller';
import { GalleryController } from './controllers/gallery-controller';
import { merge } from 'lodash';
import { defaultButtons } from './ui/default-styles';
import { createButton, createShotCounter, updateShotCounter, setButtonIcon } from './ui/ui-factory';
import {
  createOverlayContainer,
  createPositionContainers,
  createBottomGridCells,
  createGallery
} from './ui/layout-manager';
import type {
  ButtonsConfig,
  CameraOverlayUIOptions,
} from './types/ui-types';


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
  private shotCounter: HTMLElement | null = null;
  private shotCount: number = 0;
  private torchButton: HTMLButtonElement | null = null;
  private torchConfig: any | null = null;

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

        await this.cameraController.initialize(
          container,
          this.options.quality ?? 90,
        );

        // Create zoom buttons after camera init
        if (this.zoomContainer && this.zoomConfig) {
          await this.createZoomButtonsAfterInit();
        }

      } catch (error) {
        console.error('Failed to initialize camera overlay', error);
        resolve({ images: [], cancelled: true });
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
      (images) => {
        if (this.options.showShotCounter) {
          this.shotCount = images.length;
          if (this.shotCounter) {
            updateShotCounter(this.shotCounter, this.shotCount);
          }
        }
      },
      (eventData: PhotoAddedEvent) => {
        this.emitPhotoAddedEvent(eventData);
      },
      (eventData: PhotoRemovedEvent) => {
        this.emitPhotoRemovedEvent(eventData);
      }
    );

    // Merge default buttons with user-provided options
    const buttons: ButtonsConfig = merge(
      defaultButtons,
      this.options.buttons || {}
    );

    // Create buttons
    const captureBtn = createButton(buttons.capture);
    
    // Create shot counter only if enabled
    if (this.options.showShotCounter) {
      this.shotCounter = createShotCounter();
    }
    
    // Place capture button back in center (no container needed)
    bottomCells.middle.appendChild(captureBtn);

    captureBtn.onclick = async () => {
      try {
        const imageData = await this.cameraController.captureImage();
        if (imageData && this.galleryController) {
          this.galleryController.addImage(imageData);
          
          // Increment shot counter and update UI (only if counter is enabled)
          if (this.options.showShotCounter) {
            this.shotCount++;
            if (this.shotCounter) {
              updateShotCounter(this.shotCounter, this.shotCount);
            }
          }
          
          // Check if we've reached maxCaptures limit
          if (this.options.maxCaptures && 
              this.galleryController.getImages().length >= this.options.maxCaptures) {
            // Auto-complete capture when limit is reached
            setTimeout(() => {
              this.completeCapture(false);
            }, 100); // Small delay to ensure image is properly added
          }
        }
      } catch (error) {
        console.error('Failed to capture image', error);
      }
    };

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
          gap: '0.625rem'
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

    window.addEventListener('orientationchange', () => {
      this.handleOrientationChange();
    });
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

    const updateTorchIcon = async (enabled: boolean) => {
      const icon = enabled ? config.onIcon : config.offIcon;
      if (icon) {
        await setButtonIcon(torchBtn, icon);
      }
    };

    torchBtn.onclick = async () => {
      try {
        const enabled = await this.cameraController.toggleTorch();
        await updateTorchIcon(enabled);
      } catch (error) {
        console.error('Failed to toggle torch', error);
      }
    };

    // Best-effort initial state sync; defaults to off if call fails.
    this.cameraController.getTorch()
      .then((enabled) => updateTorchIcon(enabled))
      .catch(() => { /* initial sync is optional */ });

    container.appendChild(torchBtn);
  }

  /**
   * Refreshes the torch icon based on current native torch state.
   */
  private async refreshTorchIconFromState(): Promise<void> {
    if (!this.torchButton || !this.torchConfig) return;
    try {
      const enabled = await this.cameraController.getTorch();
      const icon = enabled ? this.torchConfig.onIcon : this.torchConfig.offIcon;
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
    
    let currentZoomLevel = 1; // Default zoom level
    const zoomButtons: HTMLButtonElement[] = [];

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
      const zoomBtn = createButton({...config, text: displayText});

      // Make zoom buttons smaller and more compact
      Object.assign(zoomBtn.style, {
        padding: '5px 8px',
        minWidth: '40px',
        minHeight: '30px',
        margin: '0 3px',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.2s ease'
      });

      // Highlight the default 1x zoom
      if (level === 1) {
        Object.assign(zoomBtn.style, {
          backgroundColor: '#ffffff',
          color: '#000000',
          fontWeight: '700'
        });
      }

      zoomBtn.onclick = async () => {
        try {
          // Use smart zoom to handle physical camera switching
          await this.cameraController.performSmartZoom(level);
          currentZoomLevel = level;
          
          // Update button states
          zoomButtons.forEach((btn, btnIndex) => {
            const btnLevel = levels[btnIndex].level;
            
            if (btnLevel === currentZoomLevel) {
              // Highlight selected button
              Object.assign(btn.style, {
                backgroundColor: '#ffffff',
                color: '#000000',
                fontWeight: '700'
              });
            } else {
              // Reset non-selected buttons
              Object.assign(btn.style, {
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: '#ffffff',
                fontWeight: '500'
              });
            }
          });
        } catch (error) {
          console.error(`Failed to set zoom to ${level}x`, error);
        }
      };

      zoomButtons.push(zoomBtn);
      container.appendChild(zoomBtn);
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
   * Completes the capture process
   */
  private completeCapture(cancelled: boolean): void {
    const images = this.galleryController?.getImages() || [];

    this.cleanup();

    if (this.resolvePromise) {
      this.resolvePromise({
        images: !cancelled ? images.map(img => img.data) : [],
        cancelled
      });
      this.resolvePromise = null;
    }
  }

  /**
   * Cleans up resources
   */
  private cleanup(): void {
    this.torchButton = null;
    this.torchConfig = null;
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
    window.removeEventListener('orientationchange', () => {
      this.handleOrientationChange();
    });
  }
}
