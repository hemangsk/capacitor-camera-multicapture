import { MarkerArea, Renderer, Activator } from '@markerjs/markerjs3';
import type { AnnotationState } from '@markerjs/markerjs3';

const EDITOR_STYLES_ID = 'cmmc-image-editor-styles';

type ImageEditorResult = {
  dataUrl: string;
  state: AnnotationState;
};

let activeEditor: MarkerArea | null = null;

function ensureEditorStyles(): void {
  if (document.getElementById(EDITOR_STYLES_ID)) return;

  const style = document.createElement('style');
  style.id = EDITOR_STYLES_ID;
  style.textContent = `
    .cmmc-editor-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #000;
      display: flex;
      flex-direction: column;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      box-sizing: border-box;
    }
    .cmmc-editor-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: #1a1a2e;
      z-index: 100001;
      flex-shrink: 0;
    }
    .cmmc-editor-toolbar button {
      background: none;
      border: 1px solid rgba(255,255,255,0.3);
      color: #e0e0e0;
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 15px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .cmmc-editor-toolbar button.cmmc-save-btn {
      background: #4CAF50;
      border-color: #4CAF50;
      color: #fff;
    }
    .cmmc-editor-area {
      flex: 1;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .cmmc-editor-area marker-area {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;
  document.head.appendChild(style);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Opens the marker.js 3 annotation editor on a given image source.
 * Resolves with the annotated image data-URL and editor state, or null if cancelled.
 */
export function openImageEditor(
  src: string,
  previousState?: unknown,
  licenseKey?: string,
): Promise<ImageEditorResult | null> {
  if (activeEditor) return Promise.resolve(null);

  ensureEditorStyles();

  if (licenseKey) {
    Activator.addKey('markerjs3', licenseKey);
  }

  return new Promise<ImageEditorResult | null>((resolve) => {
    void (async () => {
      let backdrop: HTMLElement | null = null;

      try {
        backdrop = document.createElement('div');
        backdrop.className = 'cmmc-editor-backdrop';
        document.body.appendChild(backdrop);

        const imgEl = await loadImageElement(src);

        // Toolbar with cancel/save
        const toolbar = document.createElement('div');
        toolbar.className = 'cmmc-editor-toolbar';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'cmmc-save-btn';
        saveBtn.textContent = 'Save';

        toolbar.appendChild(cancelBtn);
        toolbar.appendChild(saveBtn);
        backdrop.appendChild(toolbar);

        // Editor area
        const editorArea = document.createElement('div');
        editorArea.className = 'cmmc-editor-area';
        backdrop.appendChild(editorArea);

        // Create MarkerArea (web component)
        const markerArea = document.createElement('marker-area') as MarkerArea;
        activeEditor = markerArea;
        editorArea.appendChild(markerArea);

        markerArea.targetImage = imgEl;

        if (previousState) {
          markerArea.addEventListener('areainit', () => {
            markerArea.restoreState(previousState as AnnotationState);
          }, { once: true });
        }

        const cleanup = () => {
          activeEditor = null;
          if (backdrop) {
            backdrop.remove();
            backdrop = null;
          }
        };

        cancelBtn.addEventListener('click', () => {
          cleanup();
          resolve(null);
        });

        saveBtn.addEventListener('click', async () => {
          try {
            const state = markerArea.getState();

            const renderer = new Renderer();
            renderer.targetImage = imgEl;
            renderer.naturalSize = true;
            renderer.imageType = 'image/jpeg';
            renderer.imageQuality = 1;

            const dataUrl = await renderer.rasterize(state);

            cleanup();
            resolve({ dataUrl, state });
          } catch (_err) {
            cleanup();
            resolve(null);
          }
        });
      } catch (_err) {
        activeEditor = null;
        if (backdrop) {
          backdrop.remove();
        }
        resolve(null);
      }
    })();
  });
}

export function isEditorActive(): boolean {
  return activeEditor !== null;
}
