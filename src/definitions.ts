import type { PermissionState } from '@capacitor/core';

export interface ThumbnailStyle {
  width?: string;
  height?: string;
}

export type CameraDirection = 'front' | 'back';

export type CaptureMode = 'minimizeLatency' | 'maxQuality';

export interface Resolution {
  width: number;
  height: number;
}

export interface ButtonStyle {
  radius?: number;
  color?: string;
  backgroundColor?: string;
  padding?: string;
  size?: number;
  activeColor?: string;
  border?: string;
  opacity?: number;
  boxShadow?: string;
  filter?: string; // CSS filter property (e.g., blur, brightness, contrast, etc.)
}

export interface CameraOverlayButtons {
  capture?: {
    icon?: string;
    style?: ButtonStyle;
    position?: 'center' | 'left' | 'right' | 'custom';
  };
  done?: {
    icon?: string;
    style?: ButtonStyle;
    text?: string;
  };
  cancel?: {
    icon?: string;
    style?: ButtonStyle;
    text?: string;
  };
  switchCamera?: {
    icon?: string;
    style?: ButtonStyle;
    position?: 'topLeft' | 'topRight' | 'custom';
  };
  zoom?: {
    icon?: string;
    style?: ButtonStyle;
    levels?: number[];
  };
  flash?: {
    onIcon?: string;
    offIcon?: string;
    autoIcon?: string;
    style?: ButtonStyle;
    position?: 'topLeft' | 'topRight' | 'custom';
  };
}

export interface CameraPreviewRect {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface CameraOverlayOptions {
  buttons?: CameraOverlayButtons;
  thumbnailStyle?: { width: string; height: string };
  quality?: number;
  containerId: string;
  previewRect?: CameraPreviewRect;
  direction?: CameraDirection;
  captureMode?: CaptureMode;
  resolution?: Resolution;
  zoom?: number;
  autoFocus?: boolean;
  flash?: 'on' | 'off' | 'auto';
  maxCaptures?: number;
  flashAutoModeEnabled?: boolean;
  showShotCounter?: boolean;
}


/**
 * Interface for captured images
 */
export interface CapturedImage {
  id: string;
  data: CameraImageData;
}

/**
 * Structure for image data returned by the camera
 */
export interface CameraImageData {
  uri: string;
  thumbnail: string; // Optimized thumbnail as Base64 data URI
  webPath?: string;
}

/**
 * Event data for photo added event
 */
export interface PhotoAddedEvent {
  image: CameraImageData;
  totalCount: number;
}

/**
 * Event data for photo removed event
 */
export interface PhotoRemovedEvent {
  imageId: string;
  totalCount: number;
}

export interface CameraOverlayResult {
  images: CameraImageData[];
  cancelled: boolean;
}

/**
 * Permission status for the camera multi-capture plugin
 */
export interface PermissionStatus {
  camera: PermissionState;
  photos: PermissionState;
}

export interface CameraMultiCapturePlugin {
  /**
   * Starts the camera overlay session.
   */
  start(options?: CameraOverlayOptions): Promise<CameraOverlayResult>;

  /**
   * Captures a single frame.
   */
  capture(): Promise<{ value: CameraImageData }>;

  /**
   * Stops and tears down the camera session.
   */
  stop(): Promise<void>;

  /**
   * Switches the camera between front and back.
   */
  switchCamera(): Promise<void>;

  /**
   * Sets the zoom level of the camera.
   */
  setZoom(options: { zoom: number }): Promise<void>;

  /**
   * Gets the available zoom levels supported by the current camera.
   * Returns minimum and maximum zoom ratios, and suggested preset levels.
   */
  getAvailableZoomLevels(): Promise<{
    minZoom: number;
    maxZoom: number;
    presetLevels: number[];
  }>;

  /**
   * Gets information about available physical cameras
   */
  getAvailableCameras(): Promise<{
    hasUltrawide: boolean;
    hasWide: boolean;
    hasTelephoto: boolean;
    ultrawideZoomFactor?: number;
    wideZoomFactor: number;
    telephotoZoomFactor?: number;
  }>;

  /**
   * Switches to a specific physical camera based on zoom factor
   * @param zoomFactor The target zoom factor (e.g., 0.5 for ultrawide, 1.0 for wide, 2.0+ for telephoto)
   */
  switchToPhysicalCamera(options: { zoomFactor: number }): Promise<void>;

  /**
   * Updates the camera preview rectangle dimensions.
   * Call this when the container size changes (e.g., orientation change).
   */
  updatePreviewRect(options: CameraPreviewRect): Promise<void>;

  /**
   * Sets the flash mode of the camera.
   */
  setFlash(options: { flashMode: 'on' | 'off' | 'auto' }): Promise<void>;

  /**
   * Gets the current flash mode.
   */
  getFlash(): Promise<{ flashMode: 'on' | 'off' | 'auto' }>;

  /**
   * Check camera and photo library permissions
   */
  checkPermissions(): Promise<PermissionStatus>;

  /**
   * Request camera and photo library permissions
   */
  requestPermissions(): Promise<PermissionStatus>;

  /**
   * Generic background upload - works with any backend
   */
  queueBackgroundUpload(options: {
    imageUri: string;
    uploadEndpoint: string;
    headers: Record<string, string>;
    formData?: Record<string, string>;
    method?: 'POST' | 'PUT';
    deleteAfterUpload?: boolean; // Default: true
  }): Promise<{ jobId: string }>;

  /**
   * Check upload job status
   */
  getUploadStatus(options: { jobId: string }): Promise<{ 
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    error?: string;
  }>;
}
