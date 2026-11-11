const { session, BrowserWindow } = require('electron');
const crypto = require('node:crypto');

const MUSIC_ORIGIN = 'https://music.youtube.com';
const SIGNING_COOKIES = ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID'];
const WEB_REMIX_VERSION = '1.20251006.03.00';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

let selectedChannelId = null;
let isConnected = true;
let cachedAccounts = null;
let cachedAccountsTime = 0;

async function getCookies(targetUrl) {
  try {
    const map = new Map();
    const ytCookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
    for (const c of ytCookies) {
      map.set(c.name, c.value);
    }

    if (targetUrl) {
      const urlCookies = await session.defaultSession.cookies.get({ url: targetUrl });
      for (const c of urlCookies) {
        map.set(c.name, c.value);
      }
    } else {
      const mCookies = await session.defaultSession.cookies.get({ url: MUSIC_ORIGIN });
      for (const c of mCookies) {
        map.set(c.name, c.value);
      }
    }

    // Include .google.com cookies if SAPISID is not found in YouTube cookies
    let hasSigningSecret = false;
    for (const name of SIGNING_COOKIES) {
      if (map.has(name) && map.get(name)) {
        hasSigningSecret = true;
        break;
      }
    }
    if (!hasSigningSecret) {
      const gCookies = await session.defaultSession.cookies.get({ domain: '.google.com' });
      for (const c of gCookies) {
        map.set(c.name, c.value);
      }
    }

    return map;
  } catch {
    return new Map();
  }
}

async function getSigningSecret() {
  const map = await getCookies();
  for (const name of SIGNING_COOKIES) {
    if (map.has(name) && map.get(name)) {
      return map.get(name);
    }
  }
  return null;
}

function sapisidHash(secret, origin) {
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${timestamp} ${secret} ${origin}`).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

async function signedFetch(url, init = {}, identity = { authUser: '0', pageId: null }, signAs) {
  const secret = await getSigningSecret();
  if (!secret) throw new Error('Not signed in to YouTube.');
  const origin = signAs || new URL(url).origin;
  const authHeader = sapisidHash(secret, origin);

  const cookieMap = await getCookies(url);
  const cookieHeader = Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  const headers = {};
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers)) {
      const lower = k.toLowerCase();
      if (
        lower === 'authorization' ||
        lower === 'cookie' ||
        lower === 'origin' ||
        lower === 'referer' ||
        lower === 'x-origin' ||
        lower === 'x-goog-authuser' ||
        lower === 'x-goog-pageid' ||
        lower === 'user-agent' ||
        lower === 'host' ||
        lower === 'content-length'
      ) {
        continue;
      }
      headers[k] = v;
    }
  }

  headers['Authorization'] = authHeader;
  headers['Cookie'] = cookieHeader;
  headers['Origin'] = origin;
  headers['Referer'] = `${origin}/`;
  headers['X-Origin'] = origin;
  headers['X-Goog-AuthUser'] = identity.authUser || '0';
  if (identity.pageId) headers['X-Goog-PageId'] = identity.pageId;
  headers['User-Agent'] = CHROME_UA;

  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (!headers['X-Youtube-Client-Name'] && !headers['x-youtube-client-name']) {
    headers['X-Youtube-Client-Name'] = '67';
  }
  if (!headers['X-Youtube-Client-Version'] && !headers['x-youtube-client-version']) {
    headers['X-Youtube-Client-Version'] = WEB_REMIX_VERSION;
  }

  return fetch(url, {
    method: init.method || 'GET',
    headers,
    body: init.body,
  });
}

function renderers(root, key, out = []) {
  if (Array.isArray(root)) {
    for (const item of root) renderers(item, key, out);
  } else if (root && typeof root === 'object') {
    for (const [k, v] of Object.entries(root)) {
      if (k === key && v && typeof v === 'object' && !Array.isArray(v)) out.push(v);
      else renderers(v, key, out);
    }
  }
  return out;
}

function findString(root, key) {
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findString(item, key);
      if (found) return found;
    }
  } else if (root && typeof root === 'object') {
    for (const [k, v] of Object.entries(root)) {
      if (k === key && typeof v === 'string' && v) return v;
      const found = findString(v, key);
      if (found) return found;
    }
  }
  return null;
}

function text(node) {
  if (!node) return '';
  if (node.runs && Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return node.simpleText || '';
}

function photo(item) {
  const thumbnails = item?.accountPhoto?.thumbnails;
  return thumbnails?.at(-1)?.url || null;
}

async function musicApi(endpoint, identity) {
  const response = await signedFetch(
    `${MUSIC_ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': '67',
        'X-Youtube-Client-Version': WEB_REMIX_VERSION,
      },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: WEB_REMIX_VERSION, hl: 'en', gl: 'US' },
          user: {},
        },
      }),
    },
    identity,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function readLogin(authUser) {
  const identity = { authUser, pageId: null };
  try {
    const menu = await musicApi('account/account_menu', identity);
    const header = renderers(menu, 'activeAccountHeaderRenderer')[0];
    if (!header) return null;

    const name = text(header.accountName) || 'YouTube Music';
    const email = text(header.email) || null;
    const handle = text(header.channelHandle) || null;
    const avatarUrl = photo(header);

    let channels = [];
    try {
      const list = await musicApi('account/accounts_list', identity);
      for (const item of renderers(list, 'accountItem')) {
        const cName = text(item.accountName);
        if (!cName) continue;
        const pageId = findString(item, 'pageId');
        const cHandle = text(item.channelHandle) || text(item.accountByline) || null;
        channels.push({
          id: `${authUser}:${pageId || 'own'}`,
          name: cName,
          handle: cHandle,
          avatarUrl: photo(item),
          brand: pageId !== null,
          authUser,
          pageId,
          selectedOnWeb: item.isSelected === true,
        });
      }
    } catch {}

    if (!channels.length) {
      channels = [
        {
          id: `${authUser}:own`,
          name,
          handle: handle || email,
          avatarUrl,
          brand: false,
          authUser,
          pageId: null,
          selectedOnWeb: true,
        },
      ];
    }

    return { authUser, name, email, avatarUrl, channels };
  } catch {
    return null;
  }
}

async function readAccounts(force = false) {
  if (!force && cachedAccounts && Date.now() - cachedAccountsTime < 300000) {
    return cachedAccounts;
  }

  const results = await Promise.all([readLogin('0'), readLogin('1'), readLogin('2')]);
  const list = results.filter(Boolean);
  cachedAccounts = list;
  cachedAccountsTime = Date.now();
  return list;
}

function chooseChannel(accounts, selectedId) {
  const allChannels = accounts.flatMap((a) => a.channels);
  if (!allChannels.length) return null;
  if (selectedId) {
    const match = allChannels.find((c) => c.id === selectedId);
    if (match) return match;
  }
  const primary = accounts[0];
  const selected = primary.channels.find((c) => c.selectedOnWeb) || primary.channels[0];
  return selected || null;
}

async function getAuthState(refresh = false) {
  const secret = await getSigningSecret();
  const browserSignedIn = secret !== null;

  if (!browserSignedIn || !isConnected) {
    return {
      browserSignedIn,
      connected: isConnected,
      signedIn: false,
      accounts: [],
      active: null,
      problem: null,
    };
  }

  const accounts = await readAccounts(refresh);
  const active = chooseChannel(accounts, selectedChannelId);

  return {
    browserSignedIn: true,
    connected: true,
    signedIn: active !== null,
    problem: active ? null : 'Failed to retrieve YouTube account channel',
    accounts: accounts.map((a) => ({
      ...a,
      channels: a.channels.map((c) => ({
        id: c.id,
        name: c.name,
        handle: c.handle,
        avatarUrl: c.avatarUrl,
        brand: c.brand,
      })),
    })),
    active: active
      ? {
          id: active.id,
          name: active.name,
          handle: active.handle,
          avatarUrl: active.avatarUrl,
          brand: active.brand,
          authUser: active.authUser,
        }
      : null,
  };
}

async function getActiveIdentity() {
  if (!isConnected) return null;
  const accounts = await readAccounts(false);
  const active = chooseChannel(accounts, selectedChannelId);
  if (!active) return null;
  return { authUser: active.authUser, pageId: active.pageId };
}

let authWindow = null;

function openGoogleSignIn(parentWindow, onComplete) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width: 580,
    height: 740,
    parent: parentWindow || undefined,
    modal: !!parentWindow,
    title: 'Sign in to YouTube Music - Google Accounts',
    autoHideMenuBar: true,
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Use Firefox UA to prevent Google from triggering "This browser or app may not be secure"
  authWindow.webContents.setUserAgent(FIREFOX_UA);

  // Mask navigator.webdriver
  authWindow.webContents.on('did-finish-load', () => {
    authWindow?.webContents
      ?.executeJavaScript(`
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        } catch (_) {}
      `)
      .catch(() => {});
  });

  authWindow.loadURL(
    'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F',
    { userAgent: FIREFOX_UA }
  );

  const checkRedirect = async (url) => {
    // If navigation landed on music.youtube.com or youtube.com (after accounts.google.com flow)
    if (
      url.includes('music.youtube.com') ||
      (url.includes('youtube.com') && !url.includes('accounts.google.com'))
    ) {
      const secret = await getSigningSecret();
      if (secret) {
        console.log('[Desktop] YouTube authentication detected!');
        cachedAccounts = null;
        if (onComplete) onComplete();
        setTimeout(() => {
          if (authWindow && !authWindow.isDestroyed()) {
            authWindow.close();
            authWindow = null;
          }
        }, 1000);
      }
    }
  };

  authWindow.webContents.on('did-navigate', (_event, url) => checkRedirect(url));
  authWindow.webContents.on('did-navigate-in-page', (_event, url) => checkRedirect(url));

  authWindow.on('closed', () => {
    authWindow = null;
    cachedAccounts = null;
    if (onComplete) onComplete();
  });
}

async function importCookies(cookieString) {
  if (!cookieString || typeof cookieString !== 'string') return false;
  const pairs = cookieString.split(';').map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name || !value) continue;

    try {
      await session.defaultSession.cookies.set({
        url: 'https://music.youtube.com',
        domain: '.youtube.com',
        name,
        value,
        path: '/',
        secure: true,
      });
      await session.defaultSession.cookies.set({
        url: 'https://www.google.com',
        domain: '.google.com',
        name,
        value,
        path: '/',
        secure: true,
      });
    } catch (err) {
      console.warn('[Desktop] Failed to set cookie:', name, err.message);
    }
  }
  cachedAccounts = null;
  return true;
}

function selectChannel(id) {
  selectedChannelId = id;
  return getAuthState(false);
}

function setConnected(connected) {
  isConnected = !!connected;
  return getAuthState(false);
}

module.exports = {
  CHROME_UA,
  FIREFOX_UA,
  getAuthState,
  getActiveIdentity,
  signedFetch,
  openGoogleSignIn,
  importCookies,
  selectChannel,
  setConnected,
};
