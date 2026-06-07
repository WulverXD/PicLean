import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import sharp, { type Sharp } from 'sharp';
import { optimize } from 'svgo';
import type {
  CompressionCapabilities,
  CompressionOptions,
  CompressionRequest,
  CompressionResult,
  CompressionUpdate,
  OutputFormat,
  SelectedImage
} from './types';

type RasterFormat = Exclude<OutputFormat, 'original'> | 'jpeg' | 'svg';

const RASTER_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.tif',
  '.tiff',
  '.bmp',
  '.avif',
  '.heic',
  '.heif'
]);

const ALL_EXTENSIONS = new Set([...RASTER_EXTENSIONS, '.svg']);

export const IMAGE_FILTERS = [
  {
    name: 'Images',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'svg', 'avif', 'heic', 'heif']
  }
];

export function isSupportedImagePath(filePath: string): boolean {
  return ALL_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export async function statImage(filePath: string): Promise<SelectedImage | null> {
  if (!isSupportedImagePath(filePath)) return null;

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) return null;

  return {
    id: `${filePath}:${stat.mtimeMs}:${stat.size}`,
    path: filePath,
    name: basename(filePath),
    ext: extname(filePath).toLowerCase(),
    originalSize: stat.size
  };
}

export async function getCompressionCapabilities(): Promise<CompressionCapabilities> {
  const heif = sharp.format.heif;
  const avif = sharp.format.avif;
  const webp = sharp.format.webp;

  const [pngquant, oxipng, pngcrush, sips] = await Promise.all([
    resolveToolBin('pngquant-bin', 'pngquant'),
    resolveToolBin('oxipng-bin', 'oxipng'),
    resolveToolBin('pngcrush-bin', 'pngcrush'),
    commandExists('/usr/bin/sips')
  ]);

  return {
    sharp: {
      versions: sharp.versions,
      heifInput: sharpSupportsHeicInput() || sips,
      heifOutput: Boolean(heif?.output.buffer || heif?.output.file) || sips,
      avifInput: Boolean(avif?.input.buffer || avif?.input.file),
      avifOutput: Boolean(avif?.output.buffer || avif?.output.file),
      webpInput: Boolean(webp?.input.buffer || webp?.input.file),
      webpOutput: Boolean(webp?.output.buffer || webp?.output.file)
    },
    tools: {
      pngquant: Boolean(pngquant),
      oxipng: Boolean(oxipng),
      pngcrush: Boolean(pngcrush),
      mozjpeg: true,
      svgo: true,
      sips
    }
  };
}

export async function compressImages(
  request: CompressionRequest,
  notify: (update: CompressionUpdate) => void
): Promise<CompressionResult[]> {
  const results: CompressionResult[] = [];
  const tempRoot = await fs.mkdtemp(join(tmpdir(), 'piclean-'));

  try {
    for (const item of request.items) {
      notify({
        id: item.id,
        status: 'processing',
        originalSize: item.originalSize,
        message: '压缩中...'
      });

      try {
        const result = await compressOne(item, request.options, tempRoot);
        notify(result);
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result: CompressionResult = {
          id: item.id,
          status: 'failed',
          originalSize: item.originalSize,
          message
        };
        notify(result);
        results.push(result);
      }
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  return results;
}

async function compressOne(
  item: SelectedImage,
  options: CompressionOptions,
  tempRoot: string
): Promise<CompressionResult> {
  const inputExt = extname(item.path).toLowerCase();
  const outputFormat = resolveOutputFormat(inputExt, options.outputFormat);
  const outputPath = await buildOutputPath(item.path, outputFormat, options);

  if (inputExt === '.svg' && outputFormat === 'svg') {
    return compressSvg(item, outputPath, options);
  }

  const sourceBuffer = await readRasterInput(item.path, inputExt, tempRoot);
  const encoded = await encodeRaster(sourceBuffer, outputFormat, options, tempRoot);
  const optimized = outputFormat === 'png' ? await optimizePng(encoded, options, tempRoot) : encoded;

  if (options.skipLarger && optimized.byteLength >= item.originalSize) {
    return {
      id: item.id,
      status: 'skipped',
      originalSize: item.originalSize,
      compressedSize: item.originalSize,
      ratio: 0,
      message: '结果未小于原图'
    };
  }

  await writeOutput(outputPath, optimized);

  return {
    id: item.id,
    status: 'done',
    originalSize: item.originalSize,
    compressedSize: optimized.byteLength,
    outputPath,
    ratio: ratio(item.originalSize, optimized.byteLength),
    message: '完成'
  };
}

async function compressSvg(
  item: SelectedImage,
  outputPath: string,
  options: CompressionOptions
): Promise<CompressionResult> {
  const source = await fs.readFile(item.path, 'utf8');
  const result = options.engines.svgo
    ? optimize(source, {
        multipass: true,
        path: item.path,
        plugins: [
          'preset-default',
          'removeDimensions',
          {
            name: 'sortAttrs'
          }
        ]
      })
    : { data: source };
  const output = Buffer.from(result.data, 'utf8');

  if (options.skipLarger && output.byteLength >= item.originalSize) {
    return {
      id: item.id,
      status: 'skipped',
      originalSize: item.originalSize,
      compressedSize: item.originalSize,
      ratio: 0,
      message: '结果未小于原图'
    };
  }

  await writeOutput(outputPath, output);

  return {
    id: item.id,
    status: 'done',
    originalSize: item.originalSize,
    compressedSize: output.byteLength,
    outputPath,
    ratio: ratio(item.originalSize, output.byteLength),
    message: '完成'
  };
}

async function readRasterInput(inputPath: string, ext: string, tempRoot: string): Promise<Buffer> {
  const heifExt = ext === '.heic' || ext === '.heif';
  const sharpCanReadHeif = sharpSupportsHeicInput();

  if (!heifExt || sharpCanReadHeif) {
    return fs.readFile(inputPath);
  }

  if (process.platform !== 'darwin') {
    throw new Error('当前 sharp/libvips 不支持读取 HEIF，且非 macOS 无法使用系统 ImageIO 兜底');
  }

  const convertedPath = tempPath(tempRoot, 'heif-input', '.png');
  await runCommand('/usr/bin/sips', ['-s', 'format', 'png', inputPath, '--out', convertedPath]);
  return fs.readFile(convertedPath);
}

async function encodeRaster(
  source: Buffer,
  format: RasterFormat,
  options: CompressionOptions,
  tempRoot: string
): Promise<Buffer> {
  if (options.mode === 'targetSize' && options.targetSizeKb && supportsIterativeQuality(format)) {
    return encodeToTargetSize(source, format, options, tempRoot, options.targetSizeKb * 1024);
  }

  return encodeWithQuality(source, format, options, tempRoot, options.quality);
}

async function encodeToTargetSize(
  source: Buffer,
  format: RasterFormat,
  options: CompressionOptions,
  tempRoot: string,
  targetBytes: number
): Promise<Buffer> {
  let low = 24;
  let high = Math.max(25, Math.min(95, options.quality));
  let best = await encodeWithQuality(source, format, options, tempRoot, low);

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const quality = Math.round((low + high) / 2);
    const candidate = await encodeWithQuality(source, format, options, tempRoot, quality);

    if (candidate.byteLength <= targetBytes) {
      best = candidate;
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  return best;
}

async function encodeWithQuality(
  source: Buffer,
  format: RasterFormat,
  options: CompressionOptions,
  tempRoot: string,
  quality: number
): Promise<Buffer> {
  const pipeline = createPipeline(source, options);

  if (format === 'jpeg') {
    return pipeline
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: options.engines.mozjpeg,
        chromaSubsampling: quality >= 90 ? '4:4:4' : '4:2:0'
      })
      .toBuffer();
  }

  if (format === 'png') {
    return pipeline
      .png({
        quality,
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: quality < 92,
        effort: 10
      })
      .toBuffer();
  }

  if (format === 'webp') {
    return pipeline.webp({ quality, effort: 6 }).toBuffer();
  }

  if (format === 'avif') {
    return pipeline.avif({ quality, effort: 7 }).toBuffer();
  }

  if (format === 'heif') {
    return encodeHeif(pipeline, quality, tempRoot);
  }

  throw new Error(`暂不支持输出格式：${format}`);
}

function createPipeline(source: Buffer, options: CompressionOptions): Sharp {
  let pipeline = sharp(source, { animated: false, failOn: 'none' }).rotate();

  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width ?? undefined,
      height: options.height ?? undefined,
      fit: options.keepAspectRatio ? 'inside' : 'fill',
      withoutEnlargement: true
    });
  }

  if (options.keepMetadata) {
    pipeline = pipeline.withMetadata();
  }

  return pipeline;
}

async function encodeHeif(pipeline: Sharp, quality: number, tempRoot: string): Promise<Buffer> {
  const sharpCanWriteHeif = Boolean(sharp.format.heif?.output.buffer || sharp.format.heif?.output.file);

  if (sharpCanWriteHeif) {
    try {
      return await pipeline
        .clone()
        .heif({
          quality,
          compression: 'hevc'
        })
        .toBuffer();
    } catch {
      // Fall through to ImageIO on macOS. libheif builds often read HEIF but do not ship HEVC encoders.
    }
  }

  if (process.platform !== 'darwin') {
    throw new Error('当前运行环境不支持 HEIF 输出');
  }

  const sourcePath = tempPath(tempRoot, 'heif-source', '.png');
  const outputPath = tempPath(tempRoot, 'heif-output', '.heic');
  await fs.writeFile(sourcePath, await pipeline.png({ compressionLevel: 0 }).toBuffer());
  await runCommand('/usr/bin/sips', [
    '-s',
    'format',
    'heic',
    '-s',
    'formatOptions',
    String(quality),
    sourcePath,
    '--out',
    outputPath
  ]);
  return fs.readFile(outputPath);
}

async function optimizePng(source: Buffer, options: CompressionOptions, tempRoot: string): Promise<Buffer> {
  let current = source;

  if (options.engines.pngquant) {
    current = await runPngquant(current, options, tempRoot);
  }

  if (options.engines.oxipng) {
    current = await runOxipng(current, tempRoot);
  }

  if (options.engines.pngcrush) {
    current = await runPngcrush(current, tempRoot);
  }

  return current;
}

async function runPngquant(source: Buffer, options: CompressionOptions, tempRoot: string): Promise<Buffer> {
  const bin = await resolveToolBin('pngquant-bin', 'pngquant');
  if (!bin) return source;

  const inputPath = tempPath(tempRoot, 'pngquant-in', '.png');
  const outputPath = tempPath(tempRoot, 'pngquant-out', '.png');
  await fs.writeFile(inputPath, source);

  try {
    const minQuality = Math.max(10, Math.min(options.quality - 20, 90));
    const maxQuality = Math.max(minQuality + 1, Math.min(options.quality, 100));
    await runPackageBin(bin, [
      '--force',
      '--strip',
      `--quality=${minQuality}-${maxQuality}`,
      '--output',
      outputPath,
      inputPath
    ]);
    return keepSmaller(source, await fs.readFile(outputPath));
  } catch {
    return source;
  }
}

async function runOxipng(source: Buffer, tempRoot: string): Promise<Buffer> {
  const bin = await resolveToolBin('oxipng-bin', 'oxipng');
  if (!bin) return source;

  const outputPath = tempPath(tempRoot, 'oxipng', '.png');
  await fs.writeFile(outputPath, source);

  try {
    await runPackageBin(bin, ['-o', '4', '--strip', 'safe', outputPath]);
    return keepSmaller(source, await fs.readFile(outputPath));
  } catch {
    return source;
  }
}

async function runPngcrush(source: Buffer, tempRoot: string): Promise<Buffer> {
  const bin = await resolveToolBin('pngcrush-bin', 'pngcrush');
  if (!bin) return source;

  const inputPath = tempPath(tempRoot, 'pngcrush-in', '.png');
  const outputPath = tempPath(tempRoot, 'pngcrush-out', '.png');
  await fs.writeFile(inputPath, source);

  try {
    await runPackageBin(bin, ['-q', '-brute', '-reduce', inputPath, outputPath]);
    return keepSmaller(source, await fs.readFile(outputPath));
  } catch {
    return source;
  }
}

function keepSmaller(previous: Buffer, candidate: Buffer): Buffer {
  return candidate.byteLength < previous.byteLength ? candidate : previous;
}

function supportsIterativeQuality(format: RasterFormat): boolean {
  return format === 'jpeg' || format === 'webp' || format === 'heif' || format === 'avif';
}

function tempPath(tempRoot: string, label: string, ext: string): string {
  return join(tempRoot, `${label}-${randomUUID()}${ext}`);
}

function sharpSupportsHeicInput(): boolean {
  const suffixes = sharp.format.heif?.input.fileSuffix ?? [];
  return suffixes.includes('.heic') || suffixes.includes('.heif');
}

function resolveOutputFormat(inputExt: string, selected: OutputFormat): RasterFormat {
  if (selected !== 'original') return selected;

  if (inputExt === '.jpg' || inputExt === '.jpeg') return 'jpeg';
  if (inputExt === '.png') return 'png';
  if (inputExt === '.webp') return 'webp';
  if (inputExt === '.heic' || inputExt === '.heif') return 'heif';
  if (inputExt === '.avif') return 'avif';
  if (inputExt === '.svg') return 'svg';

  return 'jpeg';
}

async function buildOutputPath(
  inputPath: string,
  outputFormat: RasterFormat,
  options: CompressionOptions
): Promise<string> {
  const inputExt = extname(inputPath).toLowerCase();
  const outputExt = extensionForFormat(outputFormat, inputExt);
  const inputDir = dirname(inputPath);
  const outputDir = options.outputDirectory || inputDir;
  const inputBase = basename(inputPath, extname(inputPath));

  if (options.overwrite && outputDir === inputDir && inputExt === outputExt) {
    return inputPath;
  }

  const suffix = sanitizeSuffix(options.suffix);
  const basePath = join(outputDir, `${inputBase}${suffix}${outputExt}`);
  return uniqueOutputPath(basePath);
}

function sanitizeSuffix(rawSuffix: string): string {
  const suffix = rawSuffix.trim().replace(/[\\/:*?"<>|\0]/g, '-').slice(0, 64);
  return suffix && !/^-+$/.test(suffix) ? suffix : '-compressed';
}

async function uniqueOutputPath(candidate: string): Promise<string> {
  const ext = extname(candidate);
  const dir = dirname(candidate);
  const base = basename(candidate, ext);
  let outputPath = candidate;
  let index = 2;

  while (await exists(outputPath)) {
    outputPath = join(dir, `${base}-${index}${ext}`);
    index += 1;
  }

  return outputPath;
}

function extensionForFormat(format: RasterFormat, inputExt: string): string {
  if (format === 'jpeg') return inputExt === '.jpeg' ? '.jpeg' : '.jpg';
  if (format === 'heif') return inputExt === '.heif' ? '.heif' : '.heic';
  if (format === 'svg') return '.svg';
  return `.${format}`;
}

async function writeOutput(outputPath: string, content: Buffer): Promise<void> {
  await fs.mkdir(dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content);
  await fs.rename(tempPath, outputPath);
}

function ratio(original: number, compressed: number): number {
  if (original <= 0) return 0;
  return Math.max(0, Math.round((1 - compressed / original) * 100));
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await fs.access(command);
    return true;
  } catch {
    return false;
  }
}

async function resolvePackageBin(packageName: string): Promise<string | null> {
  try {
    const loaded = await import(packageName);
    const exported = (loaded.default ?? loaded) as unknown;

    if (typeof exported === 'string') return exported;
    if (typeof exported === 'object' && exported !== null && 'path' in exported) {
      const maybePath = (exported as { path?: unknown }).path;
      return typeof maybePath === 'string' ? maybePath : null;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveToolBin(packageName: string, commandName: string): Promise<string | null> {
  return (await resolvePackageBin(packageName)) ?? (await resolvePathCommand(commandName));
}

async function resolvePathCommand(commandName: string): Promise<string | null> {
  const finder = process.platform === 'win32' ? 'where' : '/usr/bin/which';

  try {
    const stdout = await captureCommand(finder, [commandName], 5000);
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

async function runPackageBin(binPath: string, args: string[]): Promise<void> {
  const command = binPath.endsWith('.js') ? process.execPath : binPath;
  const commandArgs = binPath.endsWith('.js') ? [binPath, ...args] : args;
  return runCommand(command, commandArgs);
}

function captureCommand(command: string, args: string[], timeoutMs = 180000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${basename(command)} timed out`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `${basename(command)} exited with code ${code}`));
    });
  });
}

function runCommand(command: string, args: string[], timeoutMs = 180000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${basename(command)} timed out`));
    }, timeoutMs);

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${basename(command)} exited with code ${code}`));
    });
  });
}
