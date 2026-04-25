import {
  MarkerArea,
  Renderer,
  Activator,
  FrameMarker,
  CoverMarker,
  HighlightMarker,
  EllipseFrameMarker,
  EllipseMarker,
  ArrowMarker,
  LineMarker,
  CurveMarker,
  TextMarker,
  CalloutMarker,
  FreehandMarker,
  HighlighterMarker,
  PolygonMarker,
  ShapeMarkerEditor,
  ShapeOutlineMarkerEditor,
  ArrowMarkerEditor,
  LinearMarkerEditor,
  CurveMarkerEditor,
  TextMarkerEditor,
  CalloutMarkerEditor,
  FreehandMarkerEditor,
  PolygonMarkerEditor,
} from '@markerjs/markerjs3';
import type { AnnotationState, MarkerBase, MarkerBaseEditor } from '@markerjs/markerjs3';

const EDITOR_STYLES_ID = 'cmmc-image-editor-styles';

type ImageEditorResult = {
  dataUrl: string;
  state: AnnotationState;
};

type MarkerTypeDef = {
  name: string;
  icon: string;
  markerType: typeof MarkerBase;
  editorType: typeof MarkerBaseEditor<MarkerBase>;
};

let activeEditor: MarkerArea | null = null;

const MARKER_TYPES: MarkerTypeDef[] = [
  {
    name: 'Frame',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>',
    markerType: FrameMarker as unknown as typeof MarkerBase,
    editorType: ShapeOutlineMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Cover',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor"/>',
    markerType: CoverMarker as unknown as typeof MarkerBase,
    editorType: ShapeMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Highlight',
    icon: '<rect x="2" y="6" width="20" height="12" rx="1" fill="currentColor" opacity="0.4"/>',
    markerType: HighlightMarker as unknown as typeof MarkerBase,
    editorType: ShapeMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Ellipse',
    icon: '<ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="currentColor" stroke-width="2"/>',
    markerType: EllipseFrameMarker as unknown as typeof MarkerBase,
    editorType: ShapeOutlineMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Filled Ellipse',
    icon: '<ellipse cx="12" cy="12" rx="10" ry="7" fill="currentColor"/>',
    markerType: EllipseMarker as unknown as typeof MarkerBase,
    editorType: ShapeMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Arrow',
    icon: '<line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" stroke-width="2"/><polyline points="14,5 19,5 19,10" fill="none" stroke="currentColor" stroke-width="2"/>',
    markerType: ArrowMarker as unknown as typeof MarkerBase,
    editorType: ArrowMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Line',
    icon: '<line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" stroke-width="2"/>',
    markerType: LineMarker as unknown as typeof MarkerBase,
    editorType: LinearMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Curve',
    icon: '<path d="M4 18 Q12 2 20 18" fill="none" stroke="currentColor" stroke-width="2"/>',
    markerType: CurveMarker as unknown as typeof MarkerBase,
    editorType: CurveMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Text',
    icon: '<text x="6" y="18" font-size="18" font-weight="bold" fill="currentColor">T</text>',
    markerType: TextMarker as unknown as typeof MarkerBase,
    editorType: TextMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Callout',
    icon: '<rect x="2" y="2" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="8,15 6,22 14,15" fill="currentColor"/>',
    markerType: CalloutMarker as unknown as typeof MarkerBase,
    editorType: CalloutMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Freehand',
    icon: '<path d="M4 18 C8 8 12 16 16 6 S20 12 22 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    markerType: FreehandMarker as unknown as typeof MarkerBase,
    editorType: FreehandMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Highlighter',
    icon: '<line x1="4" y1="18" x2="20" y2="6" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.4"/>',
    markerType: HighlighterMarker as unknown as typeof MarkerBase,
    editorType: FreehandMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
  {
    name: 'Polygon',
    icon: '<polygon points="12,2 22,9 18,22 6,22 2,9" fill="none" stroke="currentColor" stroke-width="2"/>',
    markerType: PolygonMarker as unknown as typeof MarkerBase,
    editorType: PolygonMarkerEditor as unknown as typeof MarkerBaseEditor<MarkerBase>,
  },
];

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

    .cmmc-editor-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: #1a1a1a;
      flex-shrink: 0;
    }
    .cmmc-editor-top-bar button {
      background: none;
      border: 1px solid rgba(255,255,255,0.25);
      color: #e0e0e0;
      padding: 7px 18px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .cmmc-editor-top-bar .cmmc-save-btn {
      background: rgba(255,255,255,0.15);
      border-color: rgba(255,255,255,0.3);
      color: #fff;
    }
    .cmmc-editor-top-bar .cmmc-undo-redo {
      display: flex;
      gap: 8px;
    }
    .cmmc-editor-top-bar .cmmc-undo-redo button {
      padding: 6px 10px;
      border: none;
    }
    .cmmc-editor-top-bar .cmmc-undo-redo button:disabled {
      opacity: 0.3;
    }

    .cmmc-editor-tools {
      display: flex;
      overflow-x: auto;
      gap: 2px;
      padding: 6px 8px;
      background: #1a1a1a;
      flex-shrink: 0;
      -webkit-overflow-scrolling: touch;
    }
    .cmmc-editor-tools::-webkit-scrollbar {
      display: none;
    }
    .cmmc-tool-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      min-width: 40px;
      border-radius: 8px;
      border: none;
      background: rgba(255,255,255,0.08);
      color: #aaa;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      padding: 0;
    }
    .cmmc-tool-btn.active {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
    .cmmc-tool-btn svg {
      width: 22px;
      height: 22px;
    }

    .cmmc-editor-canvas {
      flex: 1;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      background: #000;
    }
    .cmmc-editor-canvas mjs-marker-area {
      display: block;
      width: 100%;
      height: 100%;
    }

    .cmmc-editor-bottom-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 8px 12px;
      background: #1a1a1a;
      flex-shrink: 0;
    }
    .cmmc-editor-bottom-bar button {
      background: none;
      border: 1px solid rgba(255,255,255,0.25);
      color: #e0e0e0;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .cmmc-editor-bottom-bar button:disabled {
      opacity: 0.3;
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

function createSvgIcon(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${content}</svg>`;
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

        // --- Top bar (Cancel / Undo+Redo / Save) ---
        const topBar = document.createElement('div');
        topBar.className = 'cmmc-editor-top-bar';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';

        const undoRedoDiv = document.createElement('div');
        undoRedoDiv.className = 'cmmc-undo-redo';
        const undoBtn = document.createElement('button');
        undoBtn.innerHTML = createSvgIcon('<path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2"/>');
        undoBtn.disabled = true;
        const redoBtn = document.createElement('button');
        redoBtn.innerHTML = createSvgIcon('<path d="M15 14l5-5-5-5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke="currentColor" stroke-width="2"/>');
        redoBtn.disabled = true;
        undoRedoDiv.appendChild(undoBtn);
        undoRedoDiv.appendChild(redoBtn);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'cmmc-save-btn';
        saveBtn.textContent = 'Save';

        topBar.appendChild(cancelBtn);
        topBar.appendChild(undoRedoDiv);
        topBar.appendChild(saveBtn);
        backdrop.appendChild(topBar);

        // --- Toolbar (marker type buttons) ---
        const toolsBar = document.createElement('div');
        toolsBar.className = 'cmmc-editor-tools';

        // Select tool (pointer)
        const selectBtn = document.createElement('button');
        selectBtn.className = 'cmmc-tool-btn active';
        selectBtn.innerHTML = createSvgIcon('<path d="M4 4l7 18 2.5-7.5L21 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
        selectBtn.title = 'Select';
        toolsBar.appendChild(selectBtn);

        // Delete tool
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'cmmc-tool-btn';
        deleteBtn.innerHTML = createSvgIcon('<polyline points="3,6 5,6 21,6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2"/>');
        deleteBtn.title = 'Delete selected';
        toolsBar.appendChild(deleteBtn);

        const toolButtons: HTMLButtonElement[] = [];
        MARKER_TYPES.forEach((mt) => {
          const btn = document.createElement('button');
          btn.className = 'cmmc-tool-btn';
          btn.innerHTML = createSvgIcon(mt.icon);
          btn.title = mt.name;
          toolsBar.appendChild(btn);
          toolButtons.push(btn);
        });

        backdrop.appendChild(toolsBar);

        // --- Canvas area ---
        const canvasArea = document.createElement('div');
        canvasArea.className = 'cmmc-editor-canvas';
        backdrop.appendChild(canvasArea);

        // Create MarkerArea
        const markerArea = new MarkerArea();
        activeEditor = markerArea;
        markerArea.targetImage = imgEl;
        markerArea.autoZoomIn = false;
        markerArea.autoZoomOut = true;

        // Register marker types
        MARKER_TYPES.forEach((mt) => {
          markerArea.registerMarkerType(mt.markerType, mt.editorType);
        });

        canvasArea.appendChild(markerArea);

        // --- Bottom bar (zoom controls) ---
        const bottomBar = document.createElement('div');
        bottomBar.className = 'cmmc-editor-bottom-bar';
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.textContent = '−';
        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.textContent = 'Fit';
        const zoomInBtn = document.createElement('button');
        zoomInBtn.textContent = '+';
        bottomBar.appendChild(zoomOutBtn);
        bottomBar.appendChild(zoomResetBtn);
        bottomBar.appendChild(zoomInBtn);
        backdrop.appendChild(bottomBar);

        // --- Event handlers ---

        const setActiveTool = (activeBtn: HTMLButtonElement) => {
          selectBtn.classList.remove('active');
          deleteBtn.classList.remove('active');
          toolButtons.forEach((b) => b.classList.remove('active'));
          activeBtn.classList.add('active');
        };

        selectBtn.addEventListener('click', () => {
          setActiveTool(selectBtn);
          markerArea.switchToSelectMode();
        });

        deleteBtn.addEventListener('click', () => {
          markerArea.deleteSelectedMarkers();
        });

        toolButtons.forEach((btn, i) => {
          btn.addEventListener('click', () => {
            setActiveTool(btn);
            markerArea.createMarker(MARKER_TYPES[i].markerType);
          });
        });

        // After a marker is created, switch back to select
        markerArea.addEventListener('markercreate', () => {
          setActiveTool(selectBtn);
        });

        // Update undo/redo button state
        const updateUndoRedo = () => {
          undoBtn.disabled = !markerArea.isUndoPossible;
          redoBtn.disabled = !markerArea.isRedoPossible;
        };

        markerArea.addEventListener('areastatechange', updateUndoRedo);

        undoBtn.addEventListener('click', () => {
          markerArea.undo();
          updateUndoRedo();
        });

        redoBtn.addEventListener('click', () => {
          markerArea.redo();
          updateUndoRedo();
        });

        // Zoom controls
        zoomInBtn.addEventListener('click', () => {
          markerArea.zoomLevel = Math.min(markerArea.zoomLevel + 0.25, 4);
        });
        zoomOutBtn.addEventListener('click', () => {
          markerArea.zoomLevel = Math.max(markerArea.zoomLevel - 0.25, 0.25);
        });
        zoomResetBtn.addEventListener('click', () => {
          markerArea.autoZoomIn = true;
          markerArea.autoZoomOut = true;
          markerArea.autoZoom();
        });

        // Restore previous state
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
