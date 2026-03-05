/**
 * Controller for gallery operations and captured images
 */
import type { CameraImageData, CameraVideoData, CapturedImage, CapturedVideo, PhotoAddedEvent, PhotoRemovedEvent } from '../definitions';
import { createThumbnailContainer } from '../ui/ui-factory';
import { openImagePreview, openVideoPreview } from '../ui/media-viewer';
import { openImageEditor, isEditorActive } from '../ui/image-editor';
import type { MarkerAreaState } from 'markerjs2';

type CaptureEntry =
  | { type: 'image'; item: CapturedImage }
  | { type: 'video'; item: CapturedVideo };

/**
 * Manages gallery operations and captured images
 */
export class GalleryController {
  private galleryElement: HTMLElement;
  private images: CapturedImage[] = [];
  private videos: CapturedVideo[] = [];
  private captureOrder: CaptureEntry[] = [];
  private thumbnailStyle: { width?: string; height?: string };
  private onImageRemoved: (images: CapturedImage[]) => void;
  private onPhotoAdded?: (event: PhotoAddedEvent) => void;
  private onPhotoRemoved?: (event: PhotoRemovedEvent) => void;
  private onMediaCountChanged?: (totalCount: number) => void;
  private editorStates: Map<string, MarkerAreaState> = new Map();

  constructor(
    galleryElement: HTMLElement,
    thumbnailStyle: { width?: string; height?: string } = { width: '80px' },
    onImageRemoved?: (images: CapturedImage[]) => void,
    onPhotoAdded?: (event: PhotoAddedEvent) => void,
    onPhotoRemoved?: (event: PhotoRemovedEvent) => void,
    onMediaCountChanged?: (totalCount: number) => void
  ) {
    this.galleryElement = galleryElement;
    this.thumbnailStyle = thumbnailStyle;
    this.onImageRemoved = onImageRemoved || (() => { });
    this.onPhotoAdded = onPhotoAdded;
    this.onPhotoRemoved = onPhotoRemoved;
    this.onMediaCountChanged = onMediaCountChanged;
  }

  private notifyMediaCountChanged(): void {
    this.onMediaCountChanged?.(this.images.length + this.videos.length);
  }

  /**
   * Adds a new image to the gallery
   */
  addImage(imageData: CameraImageData): void {
    console.log('Adding image to gallery:', imageData);
    const id = `img_${Date.now()}_${this.images.length}`;
    const newImage: CapturedImage = { id, data: imageData };

    this.images.push(newImage);
    this.captureOrder.push({ type: 'image', item: newImage });
    this.renderGallery();
    this.scrollToLatest();
    this.notifyMediaCountChanged();

    // Trigger photoAdded callback with detailed logging
    const eventData: PhotoAddedEvent = {
      image: imageData,
      totalCount: this.images.length
    };
    
    console.log('[CameraMultiCapture] Photo added to gallery:', {
      imageId: id,
      totalCount: this.images.length,
      imageUri: imageData.uri,
      timestamp: new Date().toISOString()
    });
    
    if (this.onPhotoAdded) {
      try {
        this.onPhotoAdded(eventData);
        console.log('[CameraMultiCapture] photoAdded callback executed successfully');
      } catch (error) {
        console.error('[CameraMultiCapture] Failed to execute photoAdded callback:', error);
      }
    } else {
      console.log('[CameraMultiCapture] No photoAdded callback registered');
    }
  }

  /**
   * Removes an image from the gallery
   */
  removeImage(imageId: string): void {
    const imageToRemove = this.images.find(img => img.id === imageId);
    this.images = this.images.filter(img => img.id !== imageId);
    this.captureOrder = this.captureOrder.filter(
      entry => !(entry.type === 'image' && entry.item.id === imageId)
    );
    this.renderGallery();
    this.onImageRemoved(this.images);
    this.notifyMediaCountChanged();

    // Trigger photoRemoved callback with detailed logging
    const eventData: PhotoRemovedEvent = {
      imageId,
      totalCount: this.images.length
    };
    
    console.log('[CameraMultiCapture] Photo removed from gallery:', {
      removedImageId: imageId,
      remainingCount: this.images.length,
      removedImageUri: imageToRemove?.data.uri || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    if (this.onPhotoRemoved) {
      try {
        this.onPhotoRemoved(eventData);
        console.log('[CameraMultiCapture] photoRemoved callback executed successfully');
      } catch (error) {
        console.error('[CameraMultiCapture] Failed to execute photoRemoved callback:', error);
      }
    } else {
      console.log('[CameraMultiCapture] No photoRemoved callback registered');
    }
  }

  /**
   * Adds a new video to the gallery
   */
  addVideo(videoData: CameraVideoData): void {
    const id = `vid_${Date.now()}_${this.videos.length}`;
    const newVideo: CapturedVideo = { id, data: videoData };

    this.videos.push(newVideo);
    this.captureOrder.push({ type: 'video', item: newVideo });
    this.renderGallery();
    this.scrollToLatest();
    this.notifyMediaCountChanged();
  }

  /**
   * Removes a video from the gallery
   */
  removeVideo(videoId: string): void {
    this.videos = this.videos.filter(vid => vid.id !== videoId);
    this.captureOrder = this.captureOrder.filter(
      entry => !(entry.type === 'video' && entry.item.id === videoId)
    );
    this.renderGallery();
    this.notifyMediaCountChanged();
  }

  /**
   * Clears all images from the gallery
   */
  clearGallery(): void {
    // Store images to remove before clearing
    const imagesToRemove = [...this.images];
    this.images = [];
    this.videos = [];
    this.captureOrder = [];
    this.renderGallery();
    this.onImageRemoved(this.images);
    this.notifyMediaCountChanged();

    console.log(`[CameraMultiCapture] Clearing gallery - triggering ${imagesToRemove.length} photoRemoved callbacks`);

    // Trigger photoRemoved callbacks for each cleared image
    if (this.onPhotoRemoved) {
      imagesToRemove.forEach((image, index) => {
        const eventData: PhotoRemovedEvent = {
          imageId: image.id,
          totalCount: 0 // All images are being cleared
        };
        
        console.log(`[CameraMultiCapture] Triggering photoRemoved callback ${index + 1}/${imagesToRemove.length}:`, {
          removedImageId: image.id,
          imageUri: image.data.uri,
          timestamp: new Date().toISOString()
        });
        
        try {
          this.onPhotoRemoved!(eventData);
          console.log(`[CameraMultiCapture] photoRemoved callback ${index + 1} executed successfully`);
        } catch (error) {
          console.error(`[CameraMultiCapture] Failed to execute photoRemoved callback ${index + 1}:`, error);
        }
      });
    } else {
      console.log('[CameraMultiCapture] No photoRemoved callback registered for gallery clear');
    }
  }

  /**
   * Gets all captured images
   */
  getImages(): CapturedImage[] {
    return this.images;
  }

  /**
   * Gets all captured videos
   */
  getVideos(): CapturedVideo[] {
    return this.videos;
  }

  /**
   * Replaces an existing image's data (e.g. after annotation) and re-renders.
   */
  updateImage(imageId: string, newData: CameraImageData): void {
    const target = this.images.find(img => img.id === imageId);
    if (!target) return;
    target.data = newData;

    const entry = this.captureOrder.find(
      e => e.type === 'image' && e.item.id === imageId
    );
    if (entry && entry.type === 'image') {
      entry.item.data = newData;
    }

    this.renderGallery();
  }

  /**
   * Opens marker.js editor on the given image and replaces it on save.
   */
  private handleEditImage(image: CapturedImage): void {
    if (isEditorActive()) return;

    const src = image.data.webPath || image.data.uri;
    const previousState = this.editorStates.get(image.id);

    openImageEditor(src, previousState).then((result) => {
      if (!result) return;

      this.editorStates.set(image.id, result.state);

      const updatedData: CameraImageData = {
        ...image.data,
        uri: result.dataUrl,
        webPath: result.dataUrl,
        thumbnail: result.dataUrl,
      };
      this.updateImage(image.id, updatedData);
    }).catch((err) => {
      console.error('[CameraMultiCapture] Image editor error:', err);
    });
  }

  /**
   * Renders the gallery in chronological capture order
   */
  private renderGallery(): void {
    this.galleryElement.innerHTML = '';

    this.captureOrder.forEach(entry => {
      if (entry.type === 'image') {
        const image = entry.item;
        const src = image.data.webPath || image.data.uri;
        const thumbnailContainer = createThumbnailContainer(
          image.data.thumbnail,
          this.thumbnailStyle,
          () => this.removeImage(image.id),
          {
            onTap: () => openImagePreview(
              src,
              image.data.thumbnail,
              () => this.handleEditImage(image),
            ),
          }
        );
        this.galleryElement.appendChild(thumbnailContainer);
      } else {
        const video = entry.item;
        const src = video.data.webPath || video.data.uri;
        const thumbnailContainer = createThumbnailContainer(
          video.data.thumbnail,
          this.thumbnailStyle,
          () => this.removeVideo(video.id),
          {
            isVideo: true,
            duration: video.data.duration,
            onTap: () => openVideoPreview(src, video.data.thumbnail),
          }
        );
        this.galleryElement.appendChild(thumbnailContainer);
      }
    });
  }

  private scrollToLatest(): void {
    if (this.captureOrder.length === 0) return;

    requestAnimationFrame(() => {
      this.galleryElement.scrollTo({
        left: this.galleryElement.scrollWidth,
        behavior: 'smooth'
      });
    });
  }
}
