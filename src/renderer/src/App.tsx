import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Folder,
  FolderOpen,
  Gauge,
  ImagePlus,
  Info,
  Loader2,
  Play,
  RotateCcw,
  Ruler,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { getTuyaApi } from './api';
import type { CompressionOptions, CompressionUpdate, RowStatus, SelectedImage } from './types';

const DEFAULT_OPTIONS: CompressionOptions = {
  width: null,
  height: null,
  keepAspectRatio: true,
  mode: 'quality',
  quality: 78,
  targetSizeKb: 512,
  outputFormat: 'original',
  outputDirectory: null,
  suffix: '-compressed',
  overwrite: false,
  keepMetadata: false,
  skipLarger: true,
  engines: {
    pngquant: true,
    oxipng: true,
    pngcrush: false,
    svgo: true,
    mozjpeg: true,
    heif: true
  }
};

function App(): ReactElement {
  const [rows, setRows] = useState<RowStatus[]>([]);
  const [options, setOptions] = useState<CompressionOptions>(DEFAULT_OPTIONS);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const api = useMemo(() => getTuyaApi(), []);

  useEffect(() => {
    return api.onCompressionUpdate((update) => {
      setRows((current) => applyUpdate(current, update));
    });
  }, [api]);

  const totals = useMemo(() => {
    const original = rows.reduce((sum, row) => sum + row.originalSize, 0);
    const compressed = rows.reduce((sum, row) => sum + (row.compressedSize ?? 0), 0);
    const done = rows.filter((row) => row.status === 'done' || row.status === 'skipped').length;

    return {
      original,
      compressed,
      done,
      ratio: original > 0 && compressed > 0 ? Math.round((1 - compressed / original) * 100) : 0
    };
  }, [rows]);

  async function addImages(): Promise<void> {
    const images = await api.selectImages();
    mergeImages(images);
  }

  async function chooseOutputDirectory(): Promise<void> {
    const directory = await api.selectOutputDirectory();
    if (directory) {
      setOptions((current) => ({ ...current, outputDirectory: directory }));
    }
  }

  function mergeImages(images: SelectedImage[]): void {
    if (images.length === 0) return;

    setRows((current) => {
      const existing = new Set(current.map((row) => row.path));
      const next = images
        .filter((image) => !existing.has(image.path))
        .map<RowStatus>((image) => ({
          ...image,
          status: 'queued'
        }));
      return [...current, ...next];
    });
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    setIsDragging(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => api.getPathForFile(file))
      .filter(Boolean);

    if (paths.length > 0) {
      mergeImages(await api.readFiles(paths));
    }
  }

  async function compress(): Promise<void> {
    const items = rows.filter((row) => row.status !== 'processing');
    if (items.length === 0 || isCompressing) return;

    setIsCompressing(true);
    setRows((current) =>
      current.map((row) => ({
        ...row,
        status: 'queued',
        compressedSize: undefined,
        ratio: undefined,
        outputPath: undefined,
        message: undefined
      }))
    );

    try {
      await api.compressImages({ items, options });
    } finally {
      setIsCompressing(false);
    }
  }

  function updateOption<K extends keyof CompressionOptions>(key: K, value: CompressionOptions[K]): void {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  return (
    <div
      className={`app-shell platform-${api.platform} ${isDragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <header className="titlebar">
        <div className="brand">
          <span className="app-icon" aria-hidden="true">
            <span />
          </span>
          <span className="brand-text">
            <span>图瘦</span>
            <small>PicLean</small>
          </span>
        </div>
        <div className="summary">
          <span>{rows.length} 张</span>
          <span>{formatBytes(totals.original)}</span>
          <span>{totals.compressed > 0 ? `节省 ${totals.ratio}%` : '待压缩'}</span>
        </div>
      </header>

      <main className="workspace">
        <section className="table" aria-label="图片列表">
          <div className="table-head">
            <span>状态</span>
            <span>文件名</span>
            <span aria-label="输出位置" />
            <span>原图大小</span>
            <span>压缩后大小</span>
            <span aria-label="压缩率" />
          </div>

          <div className="table-body">
            {rows.length === 0 ? (
              <div className="empty-state">
                <ImagePlus size={28} strokeWidth={1.7} />
                <span>拖入图片或点击添加图片</span>
              </div>
            ) : (
              rows.map((row) => (
                <button
                  className={`table-row status-${row.status}`}
                  key={row.id}
                  type="button"
                  onDoubleClick={() => row.outputPath && api.reveal(row.outputPath)}
                  title={row.outputPath || row.path}
                >
                  <span className="status-cell">{statusIcon(row.status)}</span>
                  <span className="filename">{row.name}</span>
                  <span className="folder-cell">
                    {row.outputPath ? (
                      <FolderOpen size={16} onClick={() => api.reveal(row.outputPath as string)} />
                    ) : (
                      <Folder size={16} />
                    )}
                  </span>
                  <span>{formatBytes(row.originalSize)}</span>
                  <span className={row.status === 'processing' ? 'muted' : ''}>
                    {row.status === 'processing'
                      ? '压缩中...'
                      : row.compressedSize
                        ? formatBytes(row.compressedSize)
                        : row.message || '-'}
                  </span>
                  <span className="ratio-cell">
                    {row.status === 'done' && typeof row.ratio === 'number' ? `↓ ${row.ratio}%` : ''}
                    {row.status === 'skipped' ? '未变小' : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="command-bar" aria-label="操作">
          <button className="command primary-link" type="button" onClick={addImages}>
            <ImagePlus size={16} />
            <span>添加图片</span>
          </button>
          <button className="command" type="button" onClick={() => setShowAbout(true)}>
            <Info size={16} />
            <span>鸣谢</span>
          </button>
          <div className="command-spacer" />
          <button className="command" type="button" onClick={() => setRows([])} disabled={rows.length === 0 || isCompressing}>
            <Trash2 size={16} />
            <span>清空列表</span>
          </button>
          <button className="command" type="button" onClick={compress} disabled={rows.length === 0 || isCompressing}>
            {isCompressing ? <Loader2 className="spin" size={16} /> : rows.some((row) => row.status === 'done') ? <RotateCcw size={16} /> : <Play size={16} />}
            <span>{rows.some((row) => row.status === 'done') ? '再次压缩' : '开始压缩'}</span>
          </button>
        </section>

        <section className="settings-panel" aria-label="压缩设置">
          <div className="resize-controls">
            <Ruler size={18} />
            <label>
              <span>宽度</span>
              <input
                inputMode="numeric"
                placeholder="自动"
                value={options.width ?? ''}
                onChange={(event) => updateOption('width', parsePositiveInteger(event.target.value))}
              />
            </label>
            <label>
              <span>高度</span>
              <input
                inputMode="numeric"
                placeholder="自动"
                value={options.height ?? ''}
                onChange={(event) => updateOption('height', parsePositiveInteger(event.target.value))}
              />
            </label>
            <label className="checkbox">
              <input
                checked={options.keepAspectRatio}
                type="checkbox"
                onChange={(event) => updateOption('keepAspectRatio', event.target.checked)}
              />
              <span>保持原始宽高比</span>
            </label>
          </div>

          <div className="quality-controls">
            <Gauge size={18} />
            <div className="mode-row">
              <label className="radio">
                <input
                  checked={options.mode === 'quality'}
                  name="mode"
                  type="radio"
                  onChange={() => updateOption('mode', 'quality')}
                />
                <span>压缩强度</span>
              </label>
              <label className="radio">
                <input
                  checked={options.mode === 'targetSize'}
                  name="mode"
                  type="radio"
                  onChange={() => updateOption('mode', 'targetSize')}
                />
                <span>文件大小</span>
              </label>
              {options.mode === 'targetSize' && (
                <input
                  className="target-size"
                  inputMode="numeric"
                  value={options.targetSizeKb ?? ''}
                  onChange={(event) => updateOption('targetSizeKb', parsePositiveInteger(event.target.value) ?? 512)}
                  aria-label="目标 KB"
                />
              )}
            </div>
            <div className="slider-row">
              <input
                type="range"
                min="20"
                max="95"
                value={options.quality}
                onChange={(event) => updateOption('quality', Number(event.target.value))}
              />
              <span>{options.quality}</span>
            </div>
          </div>
        </section>

        <section className={`more-settings ${showMore ? 'open' : ''}`}>
          <button className="more-toggle" type="button" onClick={() => setShowMore((value) => !value)}>
            {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>显示更多设置</span>
          </button>

          {showMore && (
            <div className="more-grid">
              <label>
                <span>输出格式</span>
                <select
                  value={options.outputFormat}
                  onChange={(event) => updateOption('outputFormat', event.target.value as CompressionOptions['outputFormat'])}
                >
                  <option value="original">保持原格式</option>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                  <option value="heif">HEIF/HEIC</option>
                  <option value="avif">AVIF</option>
                </select>
              </label>
              <label>
                <span>文件后缀</span>
                <input value={options.suffix} onChange={(event) => updateOption('suffix', event.target.value)} />
              </label>
              <button className="directory-button" type="button" onClick={chooseOutputDirectory}>
                <FolderOpen size={14} />
                <span>{options.outputDirectory ? basename(options.outputDirectory) : '输出目录'}</span>
              </button>
              <Toggle label="覆盖原图" checked={options.overwrite} onChange={(value) => updateOption('overwrite', value)} />
              <Toggle label="保留元数据" checked={options.keepMetadata} onChange={(value) => updateOption('keepMetadata', value)} />
              <Toggle label="跳过变大结果" checked={options.skipLarger} onChange={(value) => updateOption('skipLarger', value)} />
            </div>
          )}
        </section>
      </main>

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </div>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2 id="about-title">图瘦 PicLean</h2>
            <p>一个基于「图压」项目衍生的图片压缩工具，让图片瘦下来～</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭鸣谢" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="about-section">
          <h3>为何重构</h3>
          <p>
            很喜欢「图压」的交互逻辑，可惜很长一段时间没有更新，且不支持ARM架构的Mac。
            期间也用过一些替代品，但交互逻辑怪怪的。
            于是参考「图压」的交互界面与用到的开源库重构一下吧，很感谢大家的支持OwO。
          </p>
        </div>

        <div className="about-section">
          <h3>作者</h3>
          <p> 刃刃 </p>
        </div>

        <div className="about-section">
          <h3>开源鸣谢</h3>
          <div className="credits-list">
            {[
              ['Electron', '跨平台桌面运行时'],
              ['React', '界面渲染'],
              ['sharp / libvips', '核心图片处理，提供 HEIF/AVIF/WebP 支持'],
              ['SVGO', 'SVG 优化'],
              ['mozjpeg', 'JPEG 压缩引擎'],
              ['pngquant', 'PNG 量化引擎'],
              ['OxiPNG', 'PNG 无损优化引擎'],
              ['pngcrush', 'PNG 优化引擎'],
              ['HackPlan/UUI', 'UI/UX 交互参考'],
              ['图压', '离不开原项目的点拨']
            ].map(([name, description]) => (
              <div className="credit-item" key={name}>
                <strong>{name}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function applyUpdate(rows: RowStatus[], update: CompressionUpdate): RowStatus[] {
  return rows.map((row) => (row.id === update.id ? { ...row, ...update } : row));
}

function statusIcon(status: RowStatus['status']): ReactElement {
  if (status === 'done') return <CheckCircle2 className="ok" size={18} strokeWidth={3} />;
  if (status === 'failed') return <XCircle className="danger" size={18} />;
  if (status === 'skipped') return <AlertCircle className="warn" size={18} />;
  if (status === 'processing') return <Loader2 className="spin working" size={18} />;
  return <ImagePlus className="pending" size={18} />;
}

function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
  return `${(mb / 1024).toFixed(1)}GB`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export default App;
