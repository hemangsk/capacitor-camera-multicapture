import { WebPlugin } from '@capacitor/core';
import type { CameraImageData, CameraMultiCapturePlugin, CameraOverlayOptions, CameraOverlayResult, CameraPreviewRect, PermissionStatus } from './definitions';

export class CameraMultiCaptureWeb extends WebPlugin implements CameraMultiCapturePlugin {
  async capture(): Promise<{ value: CameraImageData }> {
    console.warn('[CameraMultiCapture] capture() not available on web.');
    return { value: { uri: '', thumbnail: '', webPath: '' } };
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

  async getFlash(): Promise<{ flashMode: 'on' | 'off' | 'auto' }> {
    console.warn('[CameraMultiCapture] getFlash() not available on web.');
    return { flashMode: 'off' };
  }

  async setFlash(_options: { flashMode: 'on' | 'off' | 'auto' }): Promise<void> {
    console.warn('[CameraMultiCapture] setFlash() not available on web.');
  }

  async setTorch(_options: { enabled: boolean }): Promise<void> {
    console.warn('[CameraMultiCapture] setTorch() not available on web.');
  }

  async getTorch(): Promise<{ enabled: boolean }> {
    console.warn('[CameraMultiCapture] getTorch() not available on web.');
    return { enabled: false };
  }

  async getAvailableZoomLevels(): Promise<{ minZoom: number; maxZoom: number; presetLevels: number[] }> {
    console.warn('[CameraMultiCapture] getAvailableZoomLevels() not available on web.');
    // Return default values for web
    return {
      minZoom: 1.0,
      maxZoom: 4.0,
      presetLevels: [1, 2, 3, 4]
    };
  }

  async updatePreviewRect(_options: CameraPreviewRect): Promise<void> {
    console.warn('[CameraMultiCapture] updatePreviewRect() not available on web.');
  }

  async getAvailableCameras(): Promise<{
    hasUltrawide: boolean;
    hasWide: boolean;
    hasTelephoto: boolean;
    ultrawideZoomFactor?: number;
    wideZoomFactor: number;
    telephotoZoomFactor?: number;
  }> {
    console.warn('[CameraMultiCapture] getAvailableCameras() not available on web.');
    return {
      hasUltrawide: false,
      hasWide: true,
      hasTelephoto: false,
      wideZoomFactor: 1.0
    };
  }

  async switchToPhysicalCamera(_options: { zoomFactor: number }): Promise<void> {
    console.warn('[CameraMultiCapture] switchToPhysicalCamera() not available on web.');
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

  async queueBackgroundUpload(_options: {
    imageUri: string;
    uploadEndpoint: string;
    headers: Record<string, string>;
    formData?: Record<string, string>;
    method?: 'POST' | 'PUT';
    deleteAfterUpload?: boolean;
  }): Promise<{ jobId: string }> {
    console.warn('[CameraMultiCapture] queueBackgroundUpload() not available on web.');
    return { jobId: 'web-not-supported' };
  }

  async getUploadStatus(_options: { jobId: string }): Promise<{ 
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    error?: string;
  }> {
    console.warn('[CameraMultiCapture] getUploadStatus() not available on web.');
    return { status: 'failed', error: 'Web platform not supported' };
  }
}

const CameraMultiCapture = new CameraMultiCaptureWeb();
export { CameraMultiCapture };
