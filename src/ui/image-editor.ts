import { Activator, MarkerArea } from 'markerjs2';

const EDITOR_STYLES_ID = 'cmmc-image-editor-styles';

export type ImageEditorResult = {
  dataUrl: string;
  state: unknown;
};

let editorOpen = false;

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
 * Opens the Marker.js 2 annotation editor on a given image source.
 * Resolves with the annotated image data-URL and editor state, or null if cancelled.
 */
export function openImageEditor(
  src: string,
  previousState?: unknown,
  licenseKey?: string,
): Promise<ImageEditorResult | null> {
  if (editorOpen) return Promise.resolve(null);

  editorOpen = true;
  ensureEditorStyles();

  return new Promise<ImageEditorResult | null>((resolve) => {
    let settled = false;

    const finish = (value: ImageEditorResult | null) => {
      if (settled) return;
      settled = true;
      editorOpen = false;
      resolve(value);
    };

    void (async () => {
      let backdrop: HTMLElement | null = null;

      try {
        backdrop = document.createElement('div');
        backdrop.className = 'cmmc-editor-backdrop';
        document.body.appendChild(backdrop);

        const img = await loadImageElement(src);
        backdrop.appendChild(img);

        const markerArea = new MarkerArea(img);
        markerArea.targetRoot = backdrop;
        markerArea.renderAtNaturalSize = true;
        markerArea.renderImageType = 'image/jpeg';
        markerArea.renderImageQuality = 1;

        if (licenseKey && licenseKey.trim()) {
          Activator.addKey(licenseKey.trim());
        }

        markerArea.addEventListener('render', (event: { dataUrl: string; state: unknown }) => {
          backdrop?.remove();
          backdrop = null;
          finish({ dataUrl: event.dataUrl, state: event.state });
        });

        markerArea.addEventListener('close', () => {
          backdrop?.remove();
          backdrop = null;
          finish(null);
        });

        markerArea.show();

        if (previousState) {
          try {
            markerArea.restoreState(previousState as never);
          } catch {
            /* e.g. state from an older editor version */
          }
        }
      } catch (_err) {
        backdrop?.remove();
        finish(null);
      }
    })();
  });
}

export function isEditorActive(): boolean {
  return editorOpen;
}
