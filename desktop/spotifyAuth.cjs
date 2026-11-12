const { session, BrowserWindow, shell } = require('electron');
const crypto = require('node:crypto');

const WEB_PLAYER = 'https://open.spotify.com';
const CDN = 'https://open.spotifycdn.com/cdn/build/web-player/';
const PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v2/query';
const CLIENT_TOKEN = 'https://clienttoken.spotify.com/v1/clienttoken';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

const KNOWN_HASHES = {
  libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
  fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  canvas: '575138ab27cd5c1b3e54da54d0a7cc8d85485402de26340c2145f0f6bb5e7a9f',
  searchTracks: 'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',
  profileAttributes: '08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0',
};
const OPERATIONS = Object.keys(KNOWN_HASHES);
const KNOWN_SECRET = {
  version: 61,
  codes: ',7/*F("rLJ2oxaKL^f+E1xvP@N'.split('').map((c) => c.charCodeAt(0)),
};

const LIKED_ID = 'liked';
const LIKED_COVER = 'https://misc.scdn.co/liked-songs/liked-songs-640.png';

let isConnected = true;
let spotifyWindow = null;
let webPlayerCache = null;
let access = null;
let client = null;
let retryAfter = 0;
let profileCache = null;

async function getSpotifyCookie() {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.spotify.com' });
    const spDc = cookies.find((c) => c.name === 'sp_dc');
    return spDc?.value || null;
  } catch {
    return null;
  }
}

async function importCookie(cookieString) {
  if (!cookieString || typeof cookieString !== 'string') return false;
  let val = cookieString.trim();
  const match = val.match(/sp_dc=([^;]+)/);
  if (match) val = match[1].trim();

  if (!val) return false;

  await session.defaultSession.cookies.set({
    url: 'https://open.spotify.com',
    name: 'sp_dc',
    value: val,
    domain: '.spotify.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'no_restriction',
  });

  invalidateTokens();
  profileCache = null;
  return true;
}

function unescapeJs(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) => {
    if (esc[0] === 'u') return String.fromCodePoint(parseInt(esc.replace(/[u{}]/g, ''), 16));
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    const special = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
    return special[esc] ?? esc;
  });
}

function secretsIn(script) {
  return [...script.matchAll(/\{secret:(['"])((?:\\.|(?!\1).)*)\1,version:(\d+)\}/g)]
    .map((m) => ({ version: Number(m[3]), codes: [...unescapeJs(m[2])].map((c) => c.charCodeAt(0)) }))
    .sort((a, b) => b.version - a.version);
}

function queryHashIn(script, operation) {
  return script.match(new RegExp(`["']${operation}["']\\s*,\\s*["']query["']\\s*,\\s*["']([0-9a-f]{64})["']`))?.[1] ?? null;
}

async function text(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function getServerTime() {
  try {
    const res = await fetch(`${WEB_PLAYER}/api/server-time`, {
      headers: { 'User-Agent': CHROME_UA },
    });
    const data = await res.json();
    const st = Number(data?.serverTime);
    return st && !isNaN(st) ? st : null;
  } catch {
    return null;
  }
}

async function readWebPlayer() {
  const html = (await text(`${WEB_PLAYER}/`)) ?? '';
  let clientVersion = '';
  const config = html.match(/<script id="appServerConfig" type="text\/plain">([^<]+)<\/script>/)?.[1];
  if (config) {
    try {
      clientVersion = JSON.parse(Buffer.from(config, 'base64').toString('utf8')).clientVersion ?? '';
    } catch {}
  }
  const bundleUrl = html.match(/https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[0-9a-f]+\.js/)?.[0];
  const bundle = bundleUrl ? ((await text(bundleUrl)) ?? '') : '';
  let searchChunk = '';
  const searchId = bundle.match(/(\d+):"xpui-routes-search"/)?.[1];
  if (searchId) {
    for (const [, part] of bundle.matchAll(new RegExp(`\\b${searchId}:"([0-9a-f]{8})"`, 'g'))) {
      searchChunk = (await text(`${CDN}xpui-routes-search.${part}.js`)) ?? '';
      if (searchChunk) break;
    }
  }
  const secret = secretsIn(bundle)[0];
  const found = Object.fromEntries(
    OPERATIONS.map((op) => [op, queryHashIn(bundle, op) ?? queryHashIn(searchChunk, op) ?? KNOWN_HASHES[op]])
  );
  const complete = !!secret && !!clientVersion;
  return {
    clientVersion: clientVersion || '1.2.77.0',
    secret: secret ?? KNOWN_SECRET,
    hashes: found,
    complete,
    at: Date.now(),
  };
}

async function webPlayer(force = false) {
  if (!force && webPlayerCache && Date.now() - webPlayerCache.at < 12 * 3600_000) {
    return webPlayerCache;
  }
  webPlayerCache = await readWebPlayer();
  return webPlayerCache;
}

async function totp(codes, epochMs) {
  const key = Buffer.from(codes.map((code, i) => code ^ ((i % 33) + 9)).join(''), 'utf8');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epochMs / 1000 / 30)));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function invalidateTokens() {
  access = null;
  client = null;
}

let minting = null;
async function accessToken() {
  const cookie = await getSpotifyCookie();
  if (access && access.cookie !== cookie) invalidateTokens();
  if (access && Date.now() < access.expiresAt - 30_000) return access;
  minting ??= mint().finally(() => (minting = null));
  return minting;
}

async function mint() {
  if (!isConnected) throw new Error('Spotify is disconnected');
  const cookie = await getSpotifyCookie();
  if (!cookie) throw new Error('Not signed in to Spotify');
  if (Date.now() < retryAfter) {
    const waitMs = Math.min(Math.max(0, retryAfter - Date.now()), 2000);
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    retryAfter = 0;
  }

  for (const force of [false, true]) {
    const player = await webPlayer(force);
    const now = Date.now();
    const code = await totp(player.secret.codes, now);
    const serverTime = await getServerTime();
    const totpServer = serverTime ? await totp(player.secret.codes, serverTime * 1000) : code;

    const query = new URLSearchParams({
      reason: 'init',
      productType: 'web-player',
      totp: code,
      totpServer: totpServer,
      totpVer: String(player.secret.version),
    });

    const response = await fetch(`${WEB_PLAYER}/api/token?${query}`, {
      headers: {
        'User-Agent': CHROME_UA,
        Cookie: `sp_dc=${cookie}`,
        Referer: `${WEB_PLAYER}/`,
        Origin: WEB_PLAYER,
      },
    });

    if (response.status === 401 || response.status === 403) {
      if (!force) continue;
      retryAfter = Date.now() + 5_000;
      throw new Error('Spotify refused session authentication');
    }
    if (!response.ok) {
      if (!force) continue;
      retryAfter = Date.now() + 5_000;
      throw new Error(`Spotify token failed (${response.status})`);
    }

    const body = await response.json();
    if (!body || !body.accessToken) {
      if (!force) continue;
      retryAfter = Date.now() + 5_000;
      throw new Error(body?.message ?? 'Spotify token response invalid');
    }

    access = {
      token: body.accessToken,
      expiresAt: body.accessTokenExpirationTimestampMs ?? Date.now() + 3600_000,
      clientId: body.clientId ?? null,
      cookie,
    };
    return access;
  }
  throw new Error('Could not mint Spotify access token');
}

async function clientToken(clientId) {
  if (client && Date.now() < client.expiresAt - 30_000) return client.token;
  const player = await webPlayer();
  const response = await fetch(CLIENT_TOKEN, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': CHROME_UA,
    },
    body: JSON.stringify({
      client_data: {
        client_version: player.clientVersion,
        client_id: clientId ?? 'd8a5ed9571ba486e88691e1d3e8e19c0',
        js_sdk_data: { device_brand: 'unknown', device_model: 'unknown', os: 'windows', os_version: 'unknown' },
      },
    }),
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  const token = body?.response?.granted_token?.token;
  if (!token) return null;
  client = {
    token,
    expiresAt: Date.now() + (body.response.granted_token.expires_after_seconds ?? 3600) * 1000,
  };
  return client.token;
}

async function gql(operation, variables = {}, retried = false) {
  const tok = await accessToken();
  const clientTok = await clientToken(tok.clientId).catch(() => null);
  const player = await webPlayer();

  const response = await fetch(PATHFINDER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok.token}`,
      'User-Agent': CHROME_UA,
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'App-Platform': 'WebPlayer',
      ...(clientTok && { 'Client-Token': clientTok }),
    },
    body: JSON.stringify({
      variables,
      operationName: operation,
      extensions: { persistedQuery: { version: 1, sha256Hash: player.hashes[operation] } },
    }),
  });

  if (response.status === 401 && !retried) {
    invalidateTokens();
    return gql(operation, variables, true);
  }
  const body = await response.json().catch(() => null);
  const errors = body?.errors?.map((e) => e.message ?? '') ?? [];
  if (errors.some((m) => /PersistedQueryNotFound/i.test(m)) && !retried) {
    await webPlayer(true);
    return gql(operation, variables, true);
  }
  if (!response.ok) throw new Error(`Spotify ${operation} failed (${response.status})`);
  if (!body) throw new Error(`Spotify ${operation} answered with invalid JSON`);
  if (errors.length && !body.data) throw new Error(errors.join('; '));
  return body;
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : null);
const num = (v) => (typeof v === 'number' ? v : null);
const path = (v, ...keys) => keys.reduce((at, key) => obj(at)?.[key], v);

function largest(sources) {
  let best = null;
  for (const source of arr(sources)) {
    const url = str(path(source, 'url'));
    const width = num(path(source, 'width')) ?? 0;
    if (url && (!best || width > best.width)) best = { url, width };
  }
  return best?.url ?? null;
}

function sized(sources, min = 300) {
  const list = arr(sources)
    .map((s) => ({ url: str(path(s, 'url')), width: num(path(s, 'width')) ?? 0 }))
    .filter((s) => !!s.url)
    .sort((a, b) => a.width - b.width);
  return (list.find((s) => s.width >= min) ?? list.at(-1))?.url ?? null;
}

function artistsOf(data) {
  return arr(path(data, 'artists', 'items'))
    .map((a) => str(path(a, 'profile', 'name')))
    .filter((n) => !!n?.trim())
    .join(', ');
}

function trackOf(data, uri) {
  const title = str(path(data, 'name'))?.trim();
  if (!title || !uri) return null;
  const album = obj(path(data, 'albumOfTrack'));
  return {
    id: uri.split(':').pop(),
    title,
    artist: artistsOf(data),
    album: str(album?.name) ?? null,
    durationMs: num(path(data, 'trackDuration', 'totalMilliseconds')) ?? num(path(data, 'duration', 'totalMilliseconds')) ?? 0,
    imageUrl: sized(path(album, 'coverArt', 'sources')),
  };
}

function parsePlaylistPage(root) {
  const library = obj(path(root, 'data', 'me', 'libraryV3'));
  if (!library) throw new Error('Spotify library response was empty');
  const raw = arr(library.items);
  const items = raw.flatMap((entry) => {
    const wrapper = obj(path(entry, 'item'));
    if (!wrapper || !str(wrapper.__typename)?.toLowerCase().includes('playlist')) return [];
    const data = obj(wrapper.data);
    if (str(data?.__typename) !== 'Playlist') return [];
    const uri = str(wrapper._uri);
    const name = str(data?.name);
    if (!uri || !name?.trim()) return [];
    return [
      {
        id: uri.split(':').pop(),
        name,
        owner: str(path(data, 'ownerV2', 'data', 'name')),
        imageUrl: largest(path(arr(path(data, 'images', 'items'))[0], 'sources')),
      },
    ];
  });
  return { items, total: num(library.totalCount) ?? raw.length, raw: raw.length };
}

function parseTrackPage(root) {
  const content = obj(path(root, 'data', 'playlistV2', 'content'));
  if (!content) throw new Error('Spotify playlist response was empty');
  const raw = arr(content.items);
  const items = raw.flatMap((entry) => {
    const data = path(entry, 'itemV2', 'data');
    const track = trackOf(data, str(path(data, 'uri')) ?? str(path(data, '_uri')));
    return track ? [track] : [];
  });
  return { items, total: num(content.totalCount) ?? raw.length, raw: raw.length };
}

function parseLikedPage(root) {
  const tracks = obj(path(root, 'data', 'me', 'library', 'tracks'));
  if (!tracks) throw new Error('Spotify liked songs response was empty');
  const raw = arr(tracks.items);
  const items = raw.flatMap((entry) => {
    const wrapper = path(entry, 'track');
    const data = path(wrapper, 'data');
    const track = trackOf(data, str(path(wrapper, '_uri')) ?? str(path(data, 'uri')));
    return track ? [track] : [];
  });
  return { items, total: num(tracks.totalCount) ?? raw.length, raw: raw.length };
}

function parseSearchTracks(root) {
  return arr(path(root, 'data', 'searchV2', 'tracksV2', 'items')).flatMap((entry) => {
    const data = path(entry, 'item', 'data');
    const track = trackOf(data, str(path(data, 'uri')));
    return track ? [track] : [];
  });
}

function parseCanvas(root) {
  const url = str(path(root, 'data', 'trackUnion', 'canvas', 'url'));
  return url?.startsWith('https://') && /\.mp4(?:[?#]|$)/i.test(url) ? url : null;
}

async function playlists(offset) {
  const page = parsePlaylistPage(
    await gql('libraryV3', {
      filters: ['Playlists'],
      order: null,
      textFilter: '',
      features: ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'EVENTS'],
      limit: 50,
      offset,
      flatten: true,
      expandedFolders: [],
      folderUri: null,
      includeFoldersWhenFlattening: false,
    })
  );
  if (offset === 0) page.items.unshift({ id: LIKED_ID, name: 'Liked Songs', owner: null, imageUrl: LIKED_COVER });
  return page;
}

async function tracks(playlistId, offset) {
  if (playlistId === LIKED_ID) return parseLikedPage(await gql('fetchLibraryTracks', { offset, limit: 100 }));
  return parseTrackPage(
    await gql('fetchPlaylist', { uri: `spotify:playlist:${playlistId}`, offset, limit: 100, enableWatchFeedEntrypoint: false })
  );
}

async function playlistInfo(playlistId) {
  if (playlistId === LIKED_ID) {
    const page = parseLikedPage(await gql('fetchLibraryTracks', { offset: 0, limit: 1 }));
    return { name: 'Liked Songs', owner: null, imageUrl: LIKED_COVER, total: page.total };
  }
  const root = await gql('fetchPlaylist', { uri: `spotify:playlist:${playlistId}`, offset: 0, limit: 1, enableWatchFeedEntrypoint: false });
  const playlist = obj(path(root, 'data', 'playlistV2'));
  return {
    name: str(playlist?.name) ?? 'Playlist',
    owner: str(path(playlist, 'ownerV2', 'data', 'name')),
    imageUrl: largest(path(arr(path(playlist, 'images', 'items'))[0], 'sources')),
    total: num(path(playlist, 'content', 'totalCount')) ?? 0,
  };
}

async function searchTracks(query) {
  return parseSearchTracks(
    await gql('searchTracks', {
      searchTerm: query,
      offset: 0,
      limit: 10,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includePreReleases: false,
      includeAuthors: false,
    })
  );
}

async function canvas(trackId) {
  return parseCanvas(await gql('canvas', { trackUri: `spotify:track:${trackId}` }));
}

async function createPlaylist(name, description = '', isPublic = false) {
  const tok = await accessToken();
  const clientTok = await clientToken(tok.clientId).catch(() => null);

  let userId = null;
  try {
    const prof = await gql('profileAttributes', {});
    userId = path(prof, 'data', 'me', 'profile', 'username') || path(prof, 'data', 'me', 'profile', 'id');
  } catch (e) {
    console.warn('[Spotify] Could not fetch profile username:', e.message);
  }

  const endpoints = [
    userId ? `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists` : null,
    'https://api.spotify.com/v1/me/playlists',
  ].filter(Boolean);

  const headers = {
    Authorization: `Bearer ${tok.token}`,
    'User-Agent': CHROME_UA,
    Accept: 'application/json',
    'Content-Type': 'application/json;charset=UTF-8',
    'App-Platform': 'WebPlayer',
    ...(clientTok && { 'Client-Token': clientTok }),
  };

  const body = JSON.stringify({
    name,
    description,
    public: isPublic,
  });

  let lastError = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (res.ok) {
        const json = await res.json();
        return {
          id: json.id,
          name: json.name,
          uri: json.uri,
        };
      }

      const text = await res.text();
      let msg = text;
      try {
        const parsed = JSON.parse(text);
        msg = parsed.error?.message || text;
      } catch {}

      lastError = new Error(`Spotify playlist creation failed (${res.status}): ${msg}`);
      if (res.status === 429) {
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Spotify playlist creation failed');
}

async function addToPlaylist(playlistId, uris = []) {
  const tok = await accessToken();
  const clientTok = await clientToken(tok.clientId).catch(() => null);

  const headers = {
    Authorization: `Bearer ${tok.token}`,
    'User-Agent': CHROME_UA,
    Accept: 'application/json',
    'Content-Type': 'application/json;charset=UTF-8',
    'App-Platform': 'WebPlayer',
    ...(clientTok && { 'Client-Token': clientTok }),
  };

  const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      uris,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.error?.message || text;
    } catch {}
    throw new Error(`Spotify add to playlist failed (${res.status}): ${msg}`);
  }
  return await res.json();
}

async function getAuthState() {
  const spDc = await getSpotifyCookie();
  const browserSignedIn = spDc !== null;

  const base = {
    browserSignedIn,
    connected: isConnected,
    signedIn: false,
    user: null,
    problem: null,
  };

  if (!browserSignedIn || !isConnected) return base;

  try {
    if (!profileCache) {
      const profile = obj(path(await gql('profileAttributes', {}), 'data', 'me', 'profile'));
      profileCache = {
        name: str(profile?.name) ?? str(profile?.username) ?? 'Spotify Account',
        avatarUrl: sized(path(profile, 'avatar', 'sources'), 64),
      };
    }
    return { ...base, signedIn: true, user: profileCache };
  } catch (err) {
    return { ...base, signedIn: true, user: profileCache ?? { name: 'Spotify Account', avatarUrl: null }, problem: err.message };
  }
}

function setConnected(connected) {
  isConnected = !!connected;
  invalidateTokens();
  retryAfter = 0;
  profileCache = null;
  return getAuthState();
}

function openSpotifySignIn(parentWindow, onComplete) {
  if (spotifyWindow && !spotifyWindow.isDestroyed()) {
    spotifyWindow.focus();
    return;
  }

  spotifyWindow = new BrowserWindow({
    width: 520,
    height: 720,
    parent: parentWindow || undefined,
    modal: !!parentWindow,
    title: 'Sign in to Spotify - SudinChord',
    autoHideMenuBar: true,
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  spotifyWindow.webContents.setUserAgent(CHROME_UA);

  spotifyWindow.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 680,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      },
    };
  });

  spotifyWindow.loadURL(
    'https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F'
  );

  const checkRedirect = async (url) => {
    if (url.includes('open.spotify.com')) {
      const spDc = await getSpotifyCookie();
      if (spDc) {
        console.log('[Desktop] Spotify login detected!');
        if (onComplete) onComplete();
        setTimeout(() => {
          if (spotifyWindow && !spotifyWindow.isDestroyed()) {
            spotifyWindow.close();
            spotifyWindow = null;
          }
        }, 1200);
      }
    }
  };

  spotifyWindow.webContents.on('did-navigate', (_event, url) => checkRedirect(url));
  spotifyWindow.webContents.on('did-navigate-in-page', (_event, url) => checkRedirect(url));

  spotifyWindow.on('closed', () => {
    spotifyWindow = null;
    if (onComplete) onComplete();
  });
}

module.exports = {
  getAuthState,
  setConnected,
  openSpotifySignIn,
  importCookie,
  playlists,
  tracks,
  playlistInfo,
  searchTracks,
  canvas,
  createPlaylist,
  addToPlaylist,
};
