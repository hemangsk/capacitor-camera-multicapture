/**
 * Controller for camera operations
 */
import type { CameraImageData, CameraMultiCapturePlugin } from '../definitions';
import { CameraOverlayUIOptions } from '../types/ui-types';

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
  
  constructor(plugin: CameraMultiCapturePlugin, options: CameraOverlayUIOptions) {
    this.plugin = plugin;
    this.options = options;
  }
  
  /**
   * Initializes the camera
   */
  async initialize(containerElement: HTMLElement, quality: number): Promise<void> {
    try {
      const rect = containerElement.getBoundingClientRect();
      await this.plugin.start({
        quality,
        direction: 'back',
        previewRect: {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y
        },
        containerId: containerElement.id || 'camera-container',
      });
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
      await this.plugin.setZoom({ zoom: level });
    } catch (error) {
      console.error('Failed to set zoom', error);
      throw error;
    }
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
}
