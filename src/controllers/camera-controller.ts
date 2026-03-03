/**
 * Controller for camera operations
 */
import { Capacitor } from '@capacitor/core';
import type { CameraImageData, CameraMultiCapturePlugin } from '../definitions';
import type { CameraOverlayUIOptions } from '../types/ui-types';

/**
 * Interface for camera rectangle dimensions
 */
export interface CameraRect {
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Manages camera operations
 */
export class CameraController {
  private plugin: CameraMultiCapturePlugin;
  private options: CameraOverlayUIOptions;
  private flashMode: 'on' | 'off' | 'auto' = 'off';
  private flashAutoModeEnabled: boolean = true;
  private currentZoom = 1;
  private availableCameras: {
    hasUltrawide: boolean;
    hasWide: boolean;
    hasTelephoto: boolean;
    ultrawideZoomFactor?: number;
    wideZoomFactor: number;
    telephotoZoomFactor?: number;
  } | null = null;
  
  constructor(plugin: CameraMultiCapturePlugin, options: CameraOverlayUIOptions) {
    this.plugin = plugin;
    this.options = options;
    this.flashAutoModeEnabled = options.flashAutoModeEnabled ?? true;
  }
  
  /**
   * Initializes the camera
   */
  async initialize(containerElement: HTMLElement, quality: number): Promise<void> {
    try {
      const rect = containerElement.getBoundingClientRect();
      const startOptions: any = {
        quality,
        direction: 'back',
        previewRect: {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y
        },
        containerId: containerElement.id || 'camera-container',
      };

      await this.plugin.start(startOptions);
    } catch (error) {
      console.error('Failed to start camera', error);
      throw error;
    }
  }
  
  /**
   * Captures an image
   */
  async captureImage(): Promise<CameraImageData | undefined> {
    try {
      const result = await this.plugin.capture();
      console.log('Capture result:', result);
      
      if (!result?.value?.uri) {
        throw new Error('No URI returned from native capture');
      }
      
      result.value.webPath = Capacitor.convertFileSrc(result.value.uri);
      return result?.value;
    } catch (error) {
      console.error('Failed to capture photo', error);
      throw error;
    }
  }
  
  /**
   * Sets the zoom level
   */
  async setZoom(level: number): Promise<void> {
    try {
      this.currentZoom = level;   // important
      await this.plugin.setZoom({ zoom: level });
    } catch (error) {
      console.error('Failed to set zoom', error);
      throw error;
    }
  }

  /**
   * Gets the current zoom level (tracked after setZoom calls)
   */
  getCurrentZoom(): number {
    return this.currentZoom;
  }

  /**
   * Gets available cameras information
   */
  async getAvailableCameras(): Promise<{
    hasUltrawide: boolean;
    hasWide: boolean;
    hasTelephoto: boolean;
    ultrawideZoomFactor?: number;
    wideZoomFactor: number;
    telephotoZoomFactor?: number;
  }> {
    try {
      if (!this.availableCameras) {
        this.availableCameras = await this.plugin.getAvailableCameras();
      }
      return this.availableCameras;
    } catch (error) {
      console.error('Failed to get available cameras', error);
      // Return default values
      return {
        hasUltrawide: false,
        hasWide: true,
        hasTelephoto: false,
        wideZoomFactor: 1.0
      };
    }
  }

  /**
   * Switches to a physical camera based on zoom factor
   * This will switch to the appropriate lens (ultrawide, wide, telephoto)
   */
  async switchToPhysicalCamera(zoomFactor: number): Promise<void> {
    try {
      await this.plugin.switchToPhysicalCamera({ zoomFactor });
    } catch (error) {
      console.error('Failed to switch physical camera', error);
      // Fallback to regular zoom
      await this.setZoom(zoomFactor);
    }
  }

  /**
   * Gets available zoom levels for the current camera
   */
  async getAvailableZoomLevels(): Promise<{ minZoom: number; maxZoom: number; presetLevels: number[] }> {
    return await this.plugin.getAvailableZoomLevels();
  }
  
  /**
   * Switches between front and back camera
   */
  async switchCamera(): Promise<void> {
    try {
      await this.plugin.switchCamera();
    } catch (error) {
      console.error('Failed to switch camera', error);
      throw error;
    }
  }
  
  /**
   * Stops the camera
   */
  async stop(): Promise<void> {
    try {
      await this.plugin.stop();
    } catch (error) {
      console.warn('Failed to stop camera', error);
    }
  }

  /**
   * Sets the flash mode
   */
  async setFlash(mode: 'on' | 'off' | 'auto'): Promise<void> {
    try {
      await this.plugin.setFlash({ flashMode: mode });
      this.flashMode = mode;
    } catch (error) {
      console.error('Failed to set flash mode', error);
      throw error;
    }
  }

  /**
   * Gets the current flash mode
   */
  getFlashMode(): 'on' | 'off' | 'auto' {
    return this.flashMode;
  }

  /**
   * Toggles flash mode between off, on, and optionally auto
   */
  async toggleFlash(): Promise<'on' | 'off' | 'auto'> {
    let newMode: 'on' | 'off' | 'auto';
    
    if (this.flashAutoModeEnabled) {
      // 3-mode cycle: off → on → auto → off
      switch (this.flashMode) {
        case 'off':
          newMode = 'on';
          break;
        case 'on':
          newMode = 'auto';
          break;
        case 'auto':
        default:
          newMode = 'off';
          break;
      }
    } else {
      // 2-mode cycle: off → on → off
      switch (this.flashMode) {
        case 'off':
          newMode = 'on';
          break;
        case 'on':
        case 'auto': // If somehow in auto mode, go to off
        default:
          newMode = 'off';
          break;
      }
    }
    
    await this.setFlash(newMode);
    return newMode;
  }

  /**
   * Gets whether auto mode is enabled
   */
  isFlashAutoModeEnabled(): boolean {
    return this.flashAutoModeEnabled;
  }

  /**
   * Updates the camera preview rectangle dimensions
   * Call this method when the container size changes (e.g., orientation change)
   */
  async refresh(): Promise<void> {

    setTimeout(async () => {
    try {
      const containerElement = document.getElementById(this.options.containerId);
      if (!containerElement) {
        throw new Error(`Container with ID ${this.options.containerId} not found`);
      }
      const rect = containerElement.getBoundingClientRect();
      await this.plugin.updatePreviewRect({
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y
      });
    } catch (error) {
      console.error('Failed to update preview rect', error);
        throw error;
      }
    }, 100);
  }

  /**
   * Gets smart zoom levels that include physical camera switches
   * Returns an array of zoom levels and whether each is a physical camera
   */
  async getSmartZoomLevels(): Promise<{ level: number; isPhysicalCamera: boolean }[]> {
    const cameras = await this.getAvailableCameras();
    const zoomLevels: { level: number; isPhysicalCamera: boolean }[] = [];
    
    // Add ultrawide if available
    if (cameras.hasUltrawide && cameras.ultrawideZoomFactor) {
      zoomLevels.push({ level: cameras.ultrawideZoomFactor, isPhysicalCamera: true });
    }
    
    // Always add wide (1x)
    zoomLevels.push({ level: cameras.wideZoomFactor, isPhysicalCamera: true });
    
    // Add telephoto if available
    if (cameras.hasTelephoto && cameras.telephotoZoomFactor) {
      zoomLevels.push({ level: cameras.telephotoZoomFactor, isPhysicalCamera: true });
    }
    
    // Add digital zoom levels
    const digitalZoomLevels = [3, 5, 10];
    for (const level of digitalZoomLevels) {
      // Only add if it's not already covered by a physical camera
      const isPhysicalCamera = zoomLevels.some(z => z.isPhysicalCamera && Math.abs(z.level - level) < 0.1);
      if (!isPhysicalCamera && level > cameras.wideZoomFactor) {
        // Only add if within device capabilities
        const zoomInfo = await this.getAvailableZoomLevels();
        if (level <= zoomInfo.maxZoom) {
          zoomLevels.push({ level, isPhysicalCamera: false });
        }
      }
    }
    
    // Sort by zoom level
    zoomLevels.sort((a, b) => a.level - b.level);
    
    return zoomLevels;
  }

  /**
   * Performs smart zoom - switches physical cameras when appropriate
   */
  async performSmartZoom(targetZoom: number): Promise<void> {
    const cameras = await this.getAvailableCameras();
    
    // Determine if this zoom level should trigger a physical camera switch
    const physicalCameraZooms: number[] = [];
    if (cameras.hasUltrawide && cameras.ultrawideZoomFactor) {
      physicalCameraZooms.push(cameras.ultrawideZoomFactor);
    }
    physicalCameraZooms.push(cameras.wideZoomFactor);
    if (cameras.hasTelephoto && cameras.telephotoZoomFactor) {
      physicalCameraZooms.push(cameras.telephotoZoomFactor);
    }
    
    // Check if target zoom matches a physical camera
    const matchingPhysicalCamera = physicalCameraZooms.find(z => Math.abs(z - targetZoom) < 0.1);
    
    if (matchingPhysicalCamera) {
      // Switch to the physical camera
      await this.switchToPhysicalCamera(targetZoom);
    } else {
      // Use digital zoom
      await this.setZoom(targetZoom);
    }
  }
}
