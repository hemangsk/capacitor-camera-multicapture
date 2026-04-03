import type { PermissionState } from '@capacitor/core';

export interface ThumbnailStyle {
  width?: string;
  height?: string;
}

export enum TorchState {
  Off = 0,
  On = 1,
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
  /**
   * Torch (continuous flashlight) toggle button.
   * Independent of capture flash and typically shown below switchCamera.
   */
  torch?: {
    onIcon?: string;
    offIcon?: string;
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

export interface PinchToZoomOptions {
  /**
   * Enable pinch-to-zoom gesture control
   * @default false
   */
  enabled?: boolean;
  /**
   * Lock zoom to nearest preset level when gesture ends.
   * If false, allows continuous/nonstandard zoom factors
   * @default false
   */
  lockToNearestStep?: boolean;
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
  /**
   * Maximum video recording duration in seconds.
   * If omitted, recording duration is unlimited until user releases.
   */
  maxRecordingDuration?: number;
  flashAutoModeEnabled?: boolean;
  showShotCounter?: boolean;
  /**
   * Pinch-to-zoom configuration for physical camera zoom control
   */
  pinchToZoom?: PinchToZoomOptions;
  /**
   * Whether to show the edit (annotate) button on photo previews.
   * When false, markerjs2 is never loaded.
   * @default false
   */
  enableEditing?: boolean;
  /**
   * Save captured photos and videos to the device gallery.
   * @default false
   */
  enableSaving?: boolean;
  /**
   * Album name for saved media in the device gallery.
   * @default "Camera"
   */
  galleryAlbumName?: string;
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
  thumbnail: string;
  webPath?: string;
  /**
   * Original native file URI before any annotation was applied.
   * Present only on images that were edited; gives access to the
   * unannotated source while `uri` / `webPath` hold the annotated render.
   */
  sourceUri?: string;
  /**
   * markerjs2 editor state, present only when `enableEditing` is true
   * and the image was annotated.
   * Pass to `MarkerArea.restoreState()` to continue editing in the parent app.
   */
  editorState?: unknown;
}

/**
 * Structure for video data returned by the camera
 */
export interface CameraVideoData {
  uri: string;
  thumbnail: string; // Optimized thumbnail as Base64 data URI
  webPath?: string;
  duration: number; // Duration in seconds
}

/**
 * Interface for captured videos
 */
export interface CapturedVideo {
  id: string;
  data: CameraVideoData;
}

/**
 * Event data for photo added event
 */
export interface PhotoAddedEvent {
  imageId: string;
  image: CameraImageData;
  totalCount: number;
}

/**
 * Event data for photo updated event (e.g. after annotation)
 */
export interface PhotoUpdatedEvent {
  imageId: string;
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

/**
 * Event data for video recording started event
 */
export interface VideoRecordingStartedEvent {
  timestamp: number;
}

/**
 * Event data for video recording stopped event
 */
export interface VideoRecordingStoppedEvent {
  video: CameraVideoData;
  totalCount: number;
}

export interface CameraOverlayResult {
  images: CameraImageData[];
  videos: CameraVideoData[];
  cancelled: boolean;
}

/**
 * Permission status for the camera multi-capture plugin
 */
export interface PermissionStatus {
  camera: PermissionState;
  photos: PermissionState;
  audio: PermissionState;
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
   * Starts recording video.
   */
  startVideoRecording(): Promise<void>;

  /**
   * Stops recording video and returns video metadata.
   */
  stopVideoRecording(): Promise<{ value: CameraVideoData }>;

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
   * Sets the torch (continuous flashlight) on or off.
   * Torch is independent of the capture flash setting.
   */
  setTorch(options: { enabled: boolean }): Promise<void>;

  /**
   * Gets whether the torch is currently enabled.
   */
  getTorch(): Promise<{ enabled: boolean }>;

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
