export type ImageStatus = 'queued' | 'processing' | 'done' | 'failed' | 'skipped';

export type CompressionMode = 'quality' | 'targetSize';

export type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp' | 'heif' | 'avif';

export interface SelectedImage {
  id: string;
  path: string;
  name: string;
  ext: string;
  originalSize: number;
}

export interface CompressionOptions {
  width: number | null;
  height: number | null;
  keepAspectRatio: boolean;
  mode: CompressionMode;
  quality: number;
  targetSizeKb: number | null;
  outputFormat: OutputFormat;
  outputDirectory: string | null;
  suffix: string;
  overwrite: boolean;
  keepMetadata: boolean;
  skipLarger: boolean;
  engines: {
    pngquant: boolean;
    oxipng: boolean;
    pngcrush: boolean;
    svgo: boolean;
    mozjpeg: boolean;
    heif: boolean;
  };
}

export interface CompressionRequest {
  items: SelectedImage[];
  options: CompressionOptions;
}

export interface CompressionUpdate {
  id: string;
  status: ImageStatus;
  originalSize?: number;
  compressedSize?: number;
  outputPath?: string;
  ratio?: number;
  message?: string;
}

export interface CompressionResult extends CompressionUpdate {
  status: 'done' | 'failed' | 'skipped';
}

export interface CompressionCapabilities {
  sharp: {
    versions: Record<string, string>;
    heifInput: boolean;
    heifOutput: boolean;
    avifInput: boolean;
    avifOutput: boolean;
    webpInput: boolean;
    webpOutput: boolean;
  };
  tools: Record<'pngquant' | 'oxipng' | 'pngcrush' | 'mozjpeg' | 'svgo' | 'sips', boolean>;
}
