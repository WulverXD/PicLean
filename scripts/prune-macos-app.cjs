const fs = require('node:fs/promises');
const path = require('node:path');

const KEEP_LOCALES = new Set(['en.lproj', 'zh_CN.lproj', 'zh_TW.lproj']);

module.exports = async function pruneMacosApp(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = await findAppBundle(context.appOutDir);
  if (!appPath) return;

  await Promise.all([
    pruneLocales(path.join(appPath, 'Contents/Resources')),
    pruneLocales(path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Resources')),
    pruneLocales(path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources')),
    removeIfExists(path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Resources/default_app.asar')),
    removeIfExists(path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/default_app.asar'))
  ]);
};

async function findAppBundle(appOutDir) {
  const entries = await fs.readdir(appOutDir, { withFileTypes: true });
  const app = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  return app ? path.join(appOutDir, app.name) : null;
}

async function pruneLocales(resourcesDir) {
  let entries;
  try {
    entries = await fs.readdir(resourcesDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.lproj') && !KEEP_LOCALES.has(entry.name))
      .map((entry) => fs.rm(path.join(resourcesDir, entry.name), { recursive: true, force: true }))
  );
}

async function removeIfExists(filePath) {
  await fs.rm(filePath, { recursive: true, force: true });
}
