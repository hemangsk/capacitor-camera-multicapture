/**
 * Controller for gallery operations and captured images
 */
import type { CameraImageData, CapturedImage, PhotoAddedEvent, PhotoRemovedEvent } from '../definitions';
import { createThumbnailContainer } from '../ui/ui-factory';

/**
 * Manages gallery operations and captured images
 */
export class GalleryController {
  private galleryElement: HTMLElement;
  private images: CapturedImage[] = [];
  private thumbnailStyle: { width?: string; height?: string };
  private onImageRemoved: (images: CapturedImage[]) => void;
  private onPhotoAdded?: (event: PhotoAddedEvent) => void;
  private onPhotoRemoved?: (event: PhotoRemovedEvent) => void;

  constructor(
    galleryElement: HTMLElement,
    thumbnailStyle: { width?: string; height?: string } = { width: '80px' },
    onImageRemoved?: (images: CapturedImage[]) => void,
    onPhotoAdded?: (event: PhotoAddedEvent) => void,
    onPhotoRemoved?: (event: PhotoRemovedEvent) => void
  ) {
    this.galleryElement = galleryElement;
    this.thumbnailStyle = thumbnailStyle;
    this.onImageRemoved = onImageRemoved || (() => { });
    this.onPhotoAdded = onPhotoAdded;
    this.onPhotoRemoved = onPhotoRemoved;
  }

  /**
   * Adds a new image to the gallery
   */
  addImage(imageData: CameraImageData): void {
    console.log('Adding image to gallery:', imageData);
    const id = `img_${Date.now()}_${this.images.length}`;
    const newImage: CapturedImage = { id, data: imageData };

    this.images.push(newImage);
    this.renderGallery();
    this.scrollToLatestImage();

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
    this.renderGallery();
    this.onImageRemoved(this.images);

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
   * Clears all images from the gallery
   */
  clearGallery(): void {
    // Store images to remove before clearing
    const imagesToRemove = [...this.images];
    this.images = [];
    this.renderGallery();
    this.onImageRemoved(this.images);

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
   * Renders the gallery with current images
   */
  private renderGallery(): void {
    this.galleryElement.innerHTML = '';

    this.images.forEach(image => {
      const thumbnailContainer = createThumbnailContainer(
        image.data.thumbnail,
        this.thumbnailStyle,
        () => this.removeImage(image.id)
      );

      this.galleryElement.appendChild(thumbnailContainer);
    });
  }
  /**
     * Scrolls the gallery to show the most recently added image
     */
  private scrollToLatestImage(): void {
    if (this.images.length === 0) return;

    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      this.galleryElement.scrollTo({
        left: this.galleryElement.scrollWidth,
        behavior: 'smooth'
      });
    });
  }
}
