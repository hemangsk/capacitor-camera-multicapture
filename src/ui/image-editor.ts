import { AnnotationEditor } from '@markerjs/markerjs-ui';
import { Activator } from '@markerjs/markerjs3';
import type { AnnotationState } from '@markerjs/markerjs3';

const EDITOR_STYLES_ID = 'cmmc-image-editor-styles';

type ImageEditorResult = {
  dataUrl: string;
  state: AnnotationState;
};

let activeEditor: AnnotationEditor | null = null;

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
      align-items: center;
      justify-content: center;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      box-sizing: border-box;
    }
    .cmmc-editor-backdrop annotation-editor {
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

        const editor = document.createElement('annotation-editor') as AnnotationEditor;
        editor.targetImage = imgEl;
        editor.theme = 'dark';
        editor.settings.rendererSettings.naturalSize = true;
        editor.settings.rendererSettings.imageType = 'image/jpeg';
        editor.settings.rendererSettings.imageQuality = 1;

        activeEditor = editor;
        backdrop.appendChild(editor);

        if (previousState) {
          editor.markerArea.addEventListener('areainit', () => {
            editor.restoreState(previousState as AnnotationState);
          }, { once: true });
        }

        const cleanup = () => {
          activeEditor = null;
          if (backdrop) {
            backdrop.remove();
            backdrop = null;
          }
        };

        editor.addEventListener('editorsave', (event) => {
          const { dataUrl, state } = event.detail;
          cleanup();
          resolve(dataUrl ? { dataUrl, state } : null);
        });

        editor.addEventListener('editorclose', () => {
          cleanup();
          resolve(null);
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
