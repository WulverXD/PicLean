import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  CompressionCapabilities,
  CompressionRequest,
  CompressionResult,
  CompressionUpdate,
  SelectedImage
} from '../main/types';

const api = {
  platform: process.platform,
  getCapabilities: (): Promise<CompressionCapabilities> => ipcRenderer.invoke('app:capabilities'),
  selectImages: (): Promise<SelectedImage[]> => ipcRenderer.invoke('dialog:select-images'),
  selectOutputDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-output-directory'),
  readFiles: (paths: string[]): Promise<SelectedImage[]> => ipcRenderer.invoke('images:read-files', paths),
  compressImages: (request: CompressionRequest): Promise<CompressionResult[]> =>
    ipcRenderer.invoke('images:compress', request),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal', path),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  onCompressionUpdate: (callback: (update: CompressionUpdate) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: CompressionUpdate): void => callback(update);
    ipcRenderer.on('compression:update', listener);
    return () => ipcRenderer.removeListener('compression:update', listener);
  }
};

contextBridge.exposeInMainWorld('tuya', api);

export type TuyaApi = typeof api;
