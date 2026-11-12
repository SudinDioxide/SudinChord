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

  // Also include electron-updater from node_modules if present
  const updaterSrc = path.join(desktopDir, 'node_modules', 'electron-updater');
  if (fs.existsSync(updaterSrc)) {
    const updaterDest = path.join(stageDir, 'node_modules', 'electron-updater');
    fs.mkdirSync(path.dirname(updaterDest), { recursive: true });
    fs.cpSync(updaterSrc, updaterDest, { recursive: true, dereference: true });
  }

  console.log('[pack-unpacked] Packing stage to app.asar...');
  await asar.createPackage(stageDir, targetAsar);
  fs.rmSync(stageDir, { recursive: true, force: true });
  console.log('[pack-unpacked] Successfully updated app.asar!');
}

main().catch(console.error);
