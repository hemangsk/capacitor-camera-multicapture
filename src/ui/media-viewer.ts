import BiggerPicture from 'bigger-picture';

import bpCss from 'bigger-picture/css-text';

const BP_STYLES_ID = 'cmmc-bigger-picture-styles';

type BiggerPictureInstance = ReturnType<typeof BiggerPicture>;
type BiggerPictureItem = {
  img?: string;
  thumb?: string;
  alt?: string;
  sources?: { src: string; type: string }[];
  width?: number;
  height?: number;
};

let bpInstance: BiggerPictureInstance | null = null;
let activeBackHandler: (() => void) | null = null;
const DEFAULT_MEDIA_WIDTH = 1920;
const DEFAULT_MEDIA_HEIGHT = 1080;

function ensureStyles(): void {
  const existing = document.getElementById(BP_STYLES_ID);
  if (existing && existing.tagName.toLowerCase() !== 'style') {
    existing.remove();
  }

  const style = document.getElementById(BP_STYLES_ID) as HTMLStyleElement | null;
  if (style) {
    return;
  }

  const styleEl = document.createElement('style');
  styleEl.id = BP_STYLES_ID;
  styleEl.textContent = `${bpCss}
    .bp-wrap,
    .bp-wrap * {
      animation-duration: 0ms !important;
      transition-duration: 0ms !important;
      transition-delay: 0ms !important;
    }
    .bp-wrap {
      --cmmc-safe-top-extra: 0px;
      --cmmc-safe-bottom-extra: 0px;
    }
    .bp-wrap > div:first-child {
      background: #000 !important;
    }
    .bp-x {
      top: env(safe-area-inset-top) !important;
    }
    .bp-img-wrap {
      top: calc(env(safe-area-inset-top) + var(--cmmc-safe-top-extra)) !important;
      bottom: calc(env(safe-area-inset-bottom) + var(--cmmc-safe-bottom-extra)) !important;
      height: auto !important;
    }
    .bp-vid,
    .bp-if {
      max-height: calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--cmmc-safe-top-extra) - var(--cmmc-safe-bottom-extra)) !important;
      margin-top: calc(env(safe-area-inset-top) + var(--cmmc-safe-top-extra)) !important;
      margin-bottom: calc(env(safe-area-inset-bottom) + var(--cmmc-safe-bottom-extra)) !important;
    }
    .bp-controls .cmmc-bp-edit {
      position: absolute;
      top: env(safe-area-inset-top);
      left: 0;
      z-index: 10;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: #fff;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }
    .bp-controls .cmmc-bp-edit:hover {
      background: none;
    }
    .bp-controls .cmmc-bp-edit svg {
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));
    }
  `;
  document.head.appendChild(styleEl);
}

function getInstance(): BiggerPictureInstance {
  if (bpInstance) {
    return bpInstance;
  }

  bpInstance = BiggerPicture({
    target: document.body,
  });
  return bpInstance;
}

function getMimeType(src: string): string {
  const normalized = src.toLowerCase();
  if (normalized.endsWith('.webm')) return 'video/webm';
  if (normalized.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

function readSafeAreaInset(property: 'top' | 'bottom'): number {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.zIndex = '-1';
  if (property === 'top') {
    probe.style.top = '0';
    probe.style.paddingTop = 'env(safe-area-inset-top)';
  } else {
    probe.style.bottom = '0';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
  }
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const raw = property === 'top' ? computed.paddingTop : computed.paddingBottom;
  probe.remove();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyDynamicSafeArea(container: HTMLElement): void {
  const closeButton = container.querySelector('.bp-x') as HTMLElement | null;
  const media = container.querySelector('.bp-vid, .bp-if, .bp-img') as HTMLElement | null;
  if (!closeButton || !media) {
    container.style.setProperty('--cmmc-safe-top-extra', '0px');
    container.style.setProperty('--cmmc-safe-bottom-extra', '0px');
    return;
  }

  const closeRect = closeButton.getBoundingClientRect();
  const mediaRect = media.getBoundingClientRect();
  const safeBottom = readSafeAreaInset('bottom');

  const topOverlap = Math.max(0, closeRect.bottom - mediaRect.top);
  const bottomLimit = window.innerHeight - safeBottom;
  const bottomOverlap = Math.max(0, mediaRect.bottom - bottomLimit);

  container.style.setProperty('--cmmc-safe-top-extra', `${topOverlap}px`);
  container.style.setProperty('--cmmc-safe-bottom-extra', `${bottomOverlap}px`);
}

function getImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getVideoDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      if (width > 0 && height > 0) {
        resolve({ width, height });
      } else {
        resolve(null);
      }
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.src = src;
  });
}

function injectEditButton(container: HTMLElement, onEdit: () => void): void {
  const controls = container.querySelector('.bp-controls');
  if (!controls || controls.querySelector('.cmmc-bp-edit')) return;

  const btn = document.createElement('button');
  btn.className = 'cmmc-bp-edit';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;

  btn.onclick = (e) => {
    e.stopPropagation();
    getInstance().close();
    onEdit();
  };

  controls.appendChild(btn);
}

function registerBackHandler(): void {
  removeBackHandler();
  const handler = () => {
    getInstance().close();
  };
  activeBackHandler = handler;
  document.addEventListener('backbutton', handler);
}

function removeBackHandler(): void {
  if (activeBackHandler) {
    document.removeEventListener('backbutton', activeBackHandler);
    activeBackHandler = null;
  }
}

export function openImagePreview(src: string, thumb?: string, onEdit?: () => void): void {
  void (async () => {
    ensureStyles();
    const dimensions = await getImageDimensions(src);

    const items: BiggerPictureItem[] = [
      {
        img: src,
        thumb: thumb || src,
        width: dimensions?.width ?? DEFAULT_MEDIA_WIDTH,
        height: dimensions?.height ?? DEFAULT_MEDIA_HEIGHT,
      },
    ];

    getInstance().open({
      items,
      el: document.body,
      scale: 1,
      intro: 'fadeup',
      onOpen: (container) => {
        applyDynamicSafeArea(container);
        registerBackHandler();
        if (onEdit) {
          injectEditButton(container, onEdit);
        }
      },
      onClose: () => {
        removeBackHandler();
      },
      onResize: (container) => {
        if (!container) return;
        applyDynamicSafeArea(container);
      },
    });
  })();
}

export function openVideoPreview(src: string, thumb?: string): void {
  void (async () => {
    ensureStyles();
    const dimensions = await getVideoDimensions(src);

    const items: BiggerPictureItem[] = [
      {
        thumb: thumb || src,
        sources: [{ src, type: getMimeType(src) }],
        width: dimensions?.width ?? DEFAULT_MEDIA_WIDTH,
        height: dimensions?.height ?? DEFAULT_MEDIA_HEIGHT,
      },
    ];

    getInstance().open({
      items,
      el: document.body,
      scale: 1,
      intro: 'fadeup',
      onOpen: (container) => {
        applyDynamicSafeArea(container);
        registerBackHandler();
      },
      onClose: () => {
        removeBackHandler();
      },
      onResize: (container) => {
        if (!container) return;
        applyDynamicSafeArea(container);
      },
    });
  })();
}
