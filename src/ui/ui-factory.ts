/**
 * Factory for creating UI elements
 */
import { ButtonStyle, IconButtonConfig } from '../types/ui-types';

/**
 * Loads an icon from either an inline SVG string or a file path
 */
async function loadIcon(iconSource: string): Promise<string> {
  // Check if it's an inline SVG (starts with <svg)
  if (iconSource.trim().startsWith('<svg')) {
    return iconSource;
  }
  
  // Check if it's a file path (ends with .svg)
  if (iconSource.endsWith('.svg')) {
    try {
      const response = await fetch(iconSource);
      if (!response.ok) {
        throw new Error(`Failed to load SVG: ${response.status} ${response.statusText}`);
      }
      const svgContent = await response.text();
      return svgContent;
    } catch (error) {
      console.error(`Failed to load SVG from path: ${iconSource}`, error);
      // Re-throw error - let the existing fallback system handle it
      throw error;
    }
  }
  
  // If it's neither, treat as inline SVG
  return iconSource;
}

/**
 * Sets the icon for a button element, supporting both inline SVG and file paths
 */
export async function setButtonIcon(element: HTMLButtonElement, iconSource: string): Promise<void> {
  // Only proceed if iconSource is provided and not empty
  if (!iconSource || iconSource.trim() === '') {
    return;
  }
  
  const svgContent = await loadIcon(iconSource);
  element.innerHTML = svgContent;
  
  // Apply size styling if specified
  const style = (element as any).__buttonStyle as ButtonStyle;
  if (style?.size && element.querySelector('svg')) {
    const svg = element.querySelector('svg');
    svg?.setAttribute('width', `${style.size}px`);
    svg?.setAttribute('height', `${style.size}px`);
  }
}

/**
 * Creates a button with the specified configuration
 */
export function createButton(config: IconButtonConfig, text?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  
  // Store style reference for later use in setButtonIcon
  (btn as any).__buttonStyle = config.style;
  
  if (text) {
    btn.textContent = text;
  } else if (config.text) {
    btn.textContent = config.text;
  } else if (config.icon) {
    // Only load icon if one is provided
    setButtonIcon(btn, config.icon).catch(error => {
      console.error('Failed to set button icon:', error);
    });
  }
  
  const style = config.style || {};
  
  applyButtonStyle(btn, style);
  
  return btn;
}

/**
 * Applies styles to a button element
 */
export function applyButtonStyle(element: HTMLButtonElement, style: ButtonStyle): void {
  Object.assign(element.style, {
    borderRadius: style.radius ? `${style.radius}px` : '30px',
    padding: style.padding || '10px',
    backgroundColor: style.backgroundColor || '#ffffff',
    color: style.color || '#000000',
    border: style.border || 'none',
    opacity: style.opacity !== undefined ? style.opacity.toString() : '1',
    boxShadow: style.boxShadow || 'none',
    filter: style.filter || 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '44px',
    minHeight: '44px'
  });
  
  if (style.size && element.querySelector('svg')) {
    const svg = element.querySelector('svg');
    svg?.setAttribute('width', `${style.size}px`);
    svg?.setAttribute('height', `${style.size}px`);
  }
}

/**
 * Creates a thumbnail image container
 */
export function createThumbnailContainer(
  thumbnailData: string, 
  thumbnailStyle: { width?: string; height?: string },
  onRemove: () => void
): HTMLElement {
  const thumbnailContainer = document.createElement('div');
  const width = thumbnailStyle?.width || '80px';
  const height = thumbnailStyle?.height || '80px';
  Object.assign(thumbnailContainer.style, {
    position: 'relative',
    display: 'inline-block',
    width: width,
    height: height,
    marginRight: '10px',
    borderRadius: '4px',
    overflow: 'hidden',
    flexShrink: '0',
    boxSizing: 'border-box',
    contentVisibility: 'auto',
    containIntrinsicSize: `${width} ${height}`
  });
  
  const thumbnail = document.createElement('img');
  thumbnail.src = thumbnailData;
  thumbnail.loading = 'lazy';
  thumbnail.decoding = 'async';
  
  Object.assign(thumbnail.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '4px',
    cursor: 'pointer'
  });
  
  const removeBtn = createRemoveButton(onRemove);
  
  thumbnailContainer.appendChild(thumbnail);
  thumbnailContainer.appendChild(removeBtn);
  
  return thumbnailContainer;
}

/**
 * Creates a remove button for thumbnails
 */
export function createRemoveButton(onRemove: (e: Event) => void): HTMLButtonElement {
  const removeBtn = document.createElement('button');
  Object.assign(removeBtn.style, {
    position: 'absolute',
    top: '3px',
    right: '3px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: '3'
  });
  
  removeBtn.innerHTML = '×';
  
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    onRemove(e);
  };
  
  return removeBtn;
}

/**
 * Creates a shot counter element with animation
 */
export function createShotCounter(): HTMLElement {
  const counter = document.createElement('div');
  counter.id = 'shot-counter';
  
  Object.assign(counter.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '0', // Remove default margin since it's now handled by container gap
    transition: 'all 0.3s ease',
    transform: 'scale(1)',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '3'
  });
  
  counter.textContent = '0';
  
  return counter;
}

/**
 * Updates the shot counter with animation
 */
export function updateShotCounter(counter: HTMLElement, count: number): void {
  const displayCount = count > 99 ? '99+' : count.toString();
  
  // Show counter if it's hidden and count > 0
  if (count > 0 && counter.style.opacity === '0') {
    counter.style.opacity = '1';
  }
  
  // Hide counter if count is 0
  if (count === 0) {
    counter.style.opacity = '0';
    counter.textContent = '0';
    return;
  }
  
  // Animation effect
  counter.style.transform = 'scale(1.2)';
  counter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)'; // Green flash
  
  // Update the text
  counter.textContent = displayCount;
  
  // Reset animation after a short delay
  setTimeout(() => {
    counter.style.transform = 'scale(1)';
    counter.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
  }, 200);
}
