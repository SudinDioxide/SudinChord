const fs = require('node:fs');
const path = require('node:path');

const appDist = path.resolve(__dirname, '../../app/dist');
const extDist = path.resolve(__dirname, '../../extension/.output/chrome-mv3');

const desktopDist = path.resolve(__dirname, '../dist');
const desktopExt = path.resolve(__dirname, '../extension');

if (fs.existsSync(appDist)) {
  if (fs.existsSync(desktopDist)) {
    fs.rmSync(desktopDist, { recursive: true, force: true });
  }
  fs.cpSync(appDist, desktopDist, { recursive: true });
  console.log('[sync-assets] Copied fresh app/dist to desktop/dist');
} else {
  console.warn('[sync-assets] app/dist does not exist yet. Run "pnpm --filter @bitchord/app build" first.');
}

if (fs.existsSync(extDist)) {
  fs.cpSync(extDist, desktopExt, { recursive: true });
  console.log('[sync-assets] Copied chrome-mv3 to desktop/extension');
} else {
  console.warn('[sync-assets] chrome-mv3 does not exist yet. Run "pnpm --filter @bitchord/extension build" first.');
}

