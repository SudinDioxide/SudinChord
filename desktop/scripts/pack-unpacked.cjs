const fs = require('fs');
const path = require('path');
const asarPath = path.resolve(__dirname, '../../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
const asar = require(asarPath);

async function main() {
  const desktopDir = path.resolve(__dirname, '..');
  const stageDir = path.join(desktopDir, '.stage');
  const targetAsar = path.join(desktopDir, 'dist-electron', 'win-unpacked', 'resources', 'app.asar');

  if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  const files = [
    'main.cjs',
    'preload.cjs',
    'localMetadata.cjs',
    'ytAuth.cjs',
    'spotifyAuth.cjs',
    'loginModal.html',
    'miniPlayer.html',
    'package.json',
    'icon.png',
    'icon.ico',
  ];

  for (const f of files) {
    const src = path.join(desktopDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stageDir, f));
  }

  const dirs = ['dist', 'extension', 'assets', 'bin'];
  for (const d of dirs) {
    const src = path.join(desktopDir, d);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(stageDir, d), { recursive: true });
    }
  }

  // Include electron-updater and all its dependencies
  const stageNm = path.join(stageDir, 'node_modules');
  fs.mkdirSync(stageNm, { recursive: true });

  const pnpmRoots = [
    path.resolve(__dirname, '../../node_modules/.pnpm/electron-updater@6.8.11_supports-color@7.2.0/node_modules'),
    path.resolve(__dirname, '../../node_modules/.pnpm/fs-extra@10.1.0/node_modules'),
  ];

  for (const root of pnpmRoots) {
    if (fs.existsSync(root)) {
      const items = fs.readdirSync(root);
      for (const item of items) {
        if (item.startsWith('.')) continue;
        const itemSrc = path.join(root, item);
        const itemDest = path.join(stageNm, item);
        if (!fs.existsSync(itemDest)) {
          fs.cpSync(itemSrc, itemDest, { recursive: true, dereference: true });
        }
      }
    }
  }

  console.log('[pack-unpacked] Packing stage to app.asar...');
  await asar.createPackage(stageDir, targetAsar);
  fs.rmSync(stageDir, { recursive: true, force: true });

  const targetBin = path.join(desktopDir, 'dist-electron', 'win-unpacked', 'resources', 'bin');
  const srcBin = path.join(desktopDir, 'bin');
  if (fs.existsSync(srcBin)) {
    fs.cpSync(srcBin, targetBin, { recursive: true });
  }
  console.log('[pack-unpacked] Successfully updated app.asar with all dependencies and bin!');
}

main().catch(console.error);
