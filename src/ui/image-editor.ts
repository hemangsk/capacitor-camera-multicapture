import { MarkerArea, MarkerAreaState } from 'markerjs2';

const EDITOR_STYLES_ID = 'cmmc-image-editor-styles';

type ImageEditorResult = {
  dataUrl: string;
  state: MarkerAreaState;
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
      align-items: center;
      justify-content: center;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      box-sizing: border-box;
    }
    .cmmc-editor-backdrop img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
    .__markerjs2_ {
      z-index: 100000 !important;
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
 * Opens the marker.js 2 annotation editor on a given image source.
 * Resolves with the annotated image data-URL and editor state, or null if cancelled.
 */
export function openImageEditor(
  src: string,
  previousState?: unknown,
  licenseKey?: string,
): Promise<ImageEditorResult | null> {
  if (activeEditor) return Promise.resolve(null);

  ensureEditorStyles();

  return new Promise<ImageEditorResult | null>((resolve) => {
    void (async () => {
      let backdrop: HTMLElement | null = null;

      try {
        backdrop = document.createElement('div');
        backdrop.className = 'cmmc-editor-backdrop';
        document.body.appendChild(backdrop);

        const imgEl = await loadImageElement(src);
        backdrop.appendChild(imgEl);

        const markerArea = new MarkerArea(imgEl);
        if (licenseKey) {
          markerArea.addLicenseKey(licenseKey);
        }
        activeEditor = markerArea;

        markerArea.targetRoot = backdrop;
        markerArea.renderAtNaturalSize = true;
        markerArea.renderImageType = 'image/jpeg';
        markerArea.renderImageQuality = 1;

        markerArea.uiStyleSettings.undoButtonVisible = true;
        markerArea.uiStyleSettings.redoButtonVisible = true;
        markerArea.uiStyleSettings.zoomButtonVisible = true;
        markerArea.uiStyleSettings.zoomOutButtonVisible = true;
        markerArea.uiStyleSettings.clearButtonVisible = true;
        markerArea.uiStyleSettings.resultButtonBlockVisible = true;
        markerArea.uiStyleSettings.toolbarBackgroundColor = '#1a1a2e';
        markerArea.uiStyleSettings.toolboxBackgroundColor = '#16213e';
        markerArea.uiStyleSettings.toolboxColor = '#ffffff';
        markerArea.uiStyleSettings.toolbarColor = '#e0e0e0';

        markerArea.addEventListener('render', (event) => {
          activeEditor = null;
          if (backdrop) {
            backdrop.remove();
            backdrop = null;
          }
          resolve({ dataUrl: event.dataUrl, state: event.state });
        });

        markerArea.addEventListener('close', () => {
          activeEditor = null;
          if (backdrop) {
            backdrop.remove();
            backdrop = null;
          }
          resolve(null);
        });

        markerArea.show();

        if (previousState) {
          markerArea.restoreState(previousState as MarkerAreaState);
        }
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
