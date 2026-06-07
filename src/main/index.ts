import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { join } from 'node:path';
import {
  compressImages,
  getCompressionCapabilities,
  IMAGE_FILTERS,
  isSupportedImagePath,
  statImage
} from './compressor';
import type { CompressionRequest, SelectedImage } from './types';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    title: '图瘦 PicLean',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc(): void {
  ipcMain.handle('app:capabilities', () => getCompressionCapabilities());

  ipcMain.handle('dialog:select-images', async () => {
    const options: OpenDialogOptions = {
      title: '添加图片',
      properties: ['openFile', 'multiSelections'],
      filters: IMAGE_FILTERS
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    if (result.canceled) return [];
    return readImages(result.filePaths);
  });

  ipcMain.handle('dialog:select-output-directory', async () => {
    const options: OpenDialogOptions = {
      title: '选择输出目录',
      properties: ['openDirectory', 'createDirectory']
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('images:read-files', async (_event, filePaths: string[]) => readImages(filePaths));

  ipcMain.handle('images:compress', async (event, request: CompressionRequest) =>
    compressImages(request, (update) => {
      event.sender.send('compression:update', update);
    })
  );

  ipcMain.handle('shell:reveal', async (_event, path: string) => {
    shell.showItemInFolder(path);
  });
}

async function readImages(filePaths: string[]): Promise<SelectedImage[]> {
  const normalized = Array.from(new Set(filePaths)).filter(isSupportedImagePath);
  const images = await Promise.all(normalized.map((filePath) => statImage(filePath)));
  return images.filter((image): image is SelectedImage => Boolean(image));
}
