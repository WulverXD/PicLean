import type {
  CompressionCapabilities,
  CompressionRequest,
  CompressionResult,
  CompressionUpdate,
  SelectedImage
} from './types';
import type { TuyaApi } from '../../preload';

const listeners = new Set<(update: CompressionUpdate) => void>();

const demoImages: SelectedImage[] = [
  {
    id: 'demo-tuya-ui',
    path: '/Demo/tuya-ui.png',
    name: 'tuya-ui.png',
    ext: '.png',
    originalSize: 904 * 1024
  },
  {
    id: 'demo-photo',
    path: '/Demo/IMG739800.jpg',
    name: 'IMG739800.jpg',
    ext: '.jpg',
    originalSize: Math.round(8.7 * 1024 * 1024)
  },
  {
    id: 'demo-heif',
    path: '/Demo/live-photo.heic',
    name: 'live-photo.heic',
    ext: '.heic',
    originalSize: Math.round(4.2 * 1024 * 1024)
  },
  {
    id: 'demo-svg',
    path: '/Demo/xinxiao.svg',
    name: 'xinxiao.svg',
    ext: '.svg',
    originalSize: 8 * 1024
  }
];

const demoCapabilities: CompressionCapabilities = {
  sharp: {
    versions: {
      sharp: '0.34.5',
      vips: '8.x'
    },
    heifInput: true,
    heifOutput: true,
    avifInput: true,
    avifOutput: true,
    webpInput: true,
    webpOutput: true
  },
  tools: {
    pngquant: true,
    oxipng: true,
    pngcrush: true,
    mozjpeg: true,
    svgo: true,
    sips: true
  }
};

export function getTuyaApi(): TuyaApi {
  if (window.tuya) return window.tuya;

  return {
    platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'linux',
    getCapabilities: async () => demoCapabilities,
    selectImages: async () => demoImages,
    selectOutputDirectory: async () => '/Demo/Compressed',
    readFiles: async (paths: string[]) =>
      paths.map((path, index) => ({
        id: `drop-${path}-${index}`,
        path,
        name: path.split(/[\\/]/).pop() || `image-${index + 1}.png`,
        ext: `.${(path.split('.').pop() || 'png').toLowerCase()}`,
        originalSize: (index + 1) * 640 * 1024
      })),
    compressImages: async (request: CompressionRequest) => {
      const results: CompressionResult[] = [];

      for (const [index, item] of request.items.entries()) {
        emit({ id: item.id, status: 'processing', originalSize: item.originalSize, message: '压缩中...' });
        await delay(260 + index * 80);

        const ratio = item.ext === '.svg' ? 42 : item.ext === '.heic' ? 58 : index === 0 ? 77 : 76;
        const compressedSize = Math.max(1024, Math.round(item.originalSize * (1 - ratio / 100)));
        const result: CompressionResult = {
          id: item.id,
          status: 'done',
          originalSize: item.originalSize,
          compressedSize,
          outputPath: `/Demo/Compressed/${item.name}`,
          ratio,
          message: '完成'
        };
        emit(result);
        results.push(result);
      }

      return results;
    },
    reveal: async () => undefined,
    getPathForFile: (file: File) => file.name,
    onCompressionUpdate: (callback: (update: CompressionUpdate) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}

function emit(update: CompressionUpdate): void {
  for (const listener of listeners) listener(update);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
