import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(new URL('..', import.meta.url).pathname);
const svg = resolve(root, 'build/icon.svg');
const png = resolve(root, 'build/icon-1024.png');
const linuxPng = resolve(root, 'build/icon.png');
const iconset = resolve(root, 'build/icon.iconset');
const icnsOutput = resolve(root, 'build/icon.icns');
const icoOutput = resolve(root, 'build/icon.ico');

const sizes = [
  ['icp4', 'icon_16x16.png', 16],
  ['ic11', 'icon_16x16@2x.png', 32],
  ['icp5', 'icon_32x32.png', 32],
  ['ic12', 'icon_32x32@2x.png', 64],
  ['ic07', 'icon_128x128.png', 128],
  ['ic13', 'icon_128x128@2x.png', 256],
  ['ic08', 'icon_256x256.png', 256],
  ['ic14', 'icon_256x256@2x.png', 512],
  ['ic09', 'icon_512x512.png', 512],
  ['ic10', 'icon_512x512@2x.png', 1024]
];

await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });

await sharp(svg).resize(1024, 1024).png().toFile(png);
await sharp(svg).resize(512, 512).png().toFile(linuxPng);

for (const [, name, size] of sizes) {
  await sharp(svg).resize(size, size).png().toFile(resolve(iconset, name));
}

await writeFile(icnsOutput, await createIcns());
await writeFile(icoOutput, await createIco());

async function createIcns() {
  const chunks = await Promise.all(
    sizes.map(async ([type, name]) => {
      const data = await readFile(resolve(iconset, name));
      const header = Buffer.alloc(8);
      header.write(type, 0, 4, 'ascii');
      header.writeUInt32BE(data.byteLength + 8, 4);
      return Buffer.concat([header, data]);
    })
  );
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.byteLength + 8, 4);
  return Buffer.concat([header, body]);
}

async function createIco() {
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const images = await Promise.all(icoSizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = header.byteLength + images.length * 16;

  for (const [index, image] of images.entries()) {
    const size = icoSizes[index];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.byteLength, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.byteLength;
  }

  return Buffer.concat([header, ...entries, ...images]);
}
