import type {
  CompressionCapabilities,
  CompressionOptions,
  CompressionRequest,
  CompressionResult,
  CompressionUpdate,
  SelectedImage
} from '../../main/types';
import type { TuyaApi } from '../../preload';

export type {
  CompressionCapabilities,
  CompressionOptions,
  CompressionRequest,
  CompressionResult,
  CompressionUpdate,
  SelectedImage
};

export type RowStatus = SelectedImage & {
  status: 'queued' | 'processing' | 'done' | 'failed' | 'skipped';
  compressedSize?: number;
  outputPath?: string;
  ratio?: number;
  message?: string;
};

declare global {
  interface Window {
    tuya?: TuyaApi;
  }
}
