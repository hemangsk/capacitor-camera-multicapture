import { WebPlugin } from '@capacitor/core';
import type { CameraImageData, CameraMultiCapturePlugin, CameraOverlayOptions, CameraOverlayResult, CameraPreviewRect, PermissionStatus } from './definitions';

export class CameraMultiCaptureWeb extends WebPlugin implements CameraMultiCapturePlugin {
  async capture(): Promise<{ value: CameraImageData }> {
    console.warn('[CameraMultiCapture] capture() not available on web.');
    return { value: { uri: '', base64: '', webPath: '' } };
  }

  async stop(): Promise<void> {
    console.warn('[CameraMultiCapture] stop() not available on web.');
  }

  async start(_options?: CameraOverlayOptions): Promise<CameraOverlayResult> {
    console.warn('[CameraMultiCapture] start() not available on web. Use initialize instead.');
    return { images: [], cancelled: true };
  }

  async switchCamera(): Promise<void> {
    console.warn('[CameraMultiCapture] switchCamera() not available on web.');
  }

  async setZoom(_options: { zoom: number }): Promise<void> {
    console.warn('[CameraMultiCapture] setZoom() not available on web.');
  }

  async setFlash(_options: { enableFlash: boolean }): Promise<void> {
    console.warn('[CameraMultiCapture] setFlash() not available on web.');
  }

  async updatePreviewRect(_options: CameraPreviewRect): Promise<void> {
    console.warn('[CameraMultiCapture] updatePreviewRect() not available on web.');
  }

  async checkPermissions(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      throw this.unavailable('Permissions API not available in this browser.');
    }

    try {
      // Check camera permission
      const cameraResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      // For photos/storage, we'll assume granted since most browsers handle this transparently
      // Web browsers typically don't have a separate "photos" permission - file access is handled by user interaction
      const photosState: 'granted' | 'denied' | 'prompt' = 'granted';

      return {
        camera: cameraResult.state as 'granted' | 'denied' | 'prompt',
        photos: photosState
      };
    } catch (error) {
      // If permission query fails, assume we need to prompt
      return {
        camera: 'prompt',
        photos: 'granted'
      };
    }
  }

  async requestPermissions(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw this.unavailable('Camera API not available in this browser.');
    }

    try {
      // Request camera access - this will prompt the user
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Stop the stream immediately since we only needed it for permission
      stream.getTracks().forEach(track => track.stop());
      
      // After successful camera access, check permissions again
      return await this.checkPermissions();
    } catch (error) {
      // Permission was denied or error occurred
      console.error('Camera permission request failed:', error);
      
      // Return denied state
      return {
        camera: 'denied',
        photos: 'granted' // Web doesn't have separate photos permission
      };
    }
  }
}

const CameraMultiCapture = new CameraMultiCaptureWeb();
export { CameraMultiCapture };
