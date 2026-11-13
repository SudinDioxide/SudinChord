const fs = require('node:fs');
const path = require('node:path');

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.webm']);
const ART_NAMES = [
  'cover.jpg', 'cover.jpeg', 'cover.png',
  'folder.jpg', 'folder.jpeg', 'folder.png',
  'album.jpg', 'album.jpeg', 'album.png',
  'front.jpg', 'front.jpeg', 'front.png',
];

function parseFileName(fileName) {
  const base = fileName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  if (base.includes(' - ')) {
    const parts = base.split(' - ');
    const artist = parts[0].replace(/^\d+[\s.-]+/, '').trim();
    const title = parts.slice(1).join(' - ').trim();
    if (artist && title) return { artist, title };
  }
  const title = base.replace(/^\d+[\s._-]+/, '').trim() || base;
  return { title, artist: 'Unknown Artist' };
}

function parseSynchsafe(b0, b1, b2, b3) {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function parseUint32(b0, b1, b2, b3) {
  return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
}

function decodeText(buf, enc) {
  try {
    if (enc === 0) {
      let s = '';
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0) break;
        s += String.fromCharCode(buf[i]);
      }
      return s.trim();
    }
    if (enc === 1) {
      return new TextDecoder('utf-16').decode(buf).replace(/\0.*$/, '').trim();
    }
    if (enc === 2) {
      return new TextDecoder('utf-16be').decode(buf).replace(/\0.*$/, '').trim();
    }
    return new TextDecoder('utf-8').decode(buf).replace(/\0.*$/, '').trim();
  } catch {
    return '';
  }
}

/** Parses Vorbis comments */
function parseVorbis(bytes, offset, blockLen) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = offset;
  const end = Math.min(bytes.length, offset + blockLen);
  if (p + 4 > end) return {};

  const vendorLen = view.getUint32(p, true);
  p += 4 + vendorLen;
  if (p + 4 > end) return {};

  const commentCount = view.getUint32(p, true);
  p += 4;
  const decoder = new TextDecoder('utf-8');
  const tags = {};

  for (let i = 0; i < commentCount && p + 4 <= end; i++) {
    const len = view.getUint32(p, true);
    p += 4;
    if (p + len > end) break;
    const str = decoder.decode(bytes.subarray(p, p + len));
    p += len;
    const eq = str.indexOf('=');
    if (eq !== -1) {
      const key = str.slice(0, eq).toUpperCase().trim();
      const val = str.slice(eq + 1).trim();
      if (!tags[key]) tags[key] = val;
    }
  }
  return tags;
}

/** Fast metadata extractor: reads only up to 128KB from disk */
async function extractMetadata(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const fnMeta = parseFileName(fileName);
  const result = {
    title: fnMeta.title,
    artist: fnMeta.artist,
    album: null,
    durationSec: null,
    hasArtwork: false,
    formatInfo: {
      codec: ext.replace('.', '').toUpperCase(),
      bitDepth: 16,
      sampleRate: 44100,
      isHiRes: false,
    },
    fileSize: 0,
  };

  let fd = null;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const stat = await fd.stat();
    result.fileSize = stat.size;
    const buf = Buffer.alloc(131072); // 128 KB
    const { bytesRead } = await fd.read(buf, 0, 131072, 0);
    const bytes = buf.subarray(0, bytesRead);

    let offset = 0;

    // Check ID3v2 header
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const version = bytes[3] || 3;
      const tagSize = parseSynchsafe(bytes[6] || 0, bytes[7] || 0, bytes[8] || 0, bytes[9] || 0);
      const maxOffset = Math.min(bytes.length, 10 + tagSize);
      let p = 10;

      while (p + 10 < maxOffset) {
        const b0 = bytes[p];
        if (b0 === 0) break;
        const frameId = String.fromCharCode(b0, bytes[p + 1], bytes[p + 2], bytes[p + 3]);
        const frameSize =
          version === 4
            ? parseSynchsafe(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
            : parseUint32(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);

        p += 10;
        if (p + frameSize > bytes.length || frameSize <= 0) break;

        const frameData = bytes.subarray(p, p + frameSize);
        const enc = frameData[0] || 0;

        if (frameId === 'TIT2') {
          const t = decodeText(frameData.subarray(1), enc);
          if (t) result.title = t;
        } else if (frameId === 'TPE1' || frameId === 'TPE2') {
          const a = decodeText(frameData.subarray(1), enc);
          if (a) result.artist = a;
        } else if (frameId === 'TALB') {
          const alb = decodeText(frameData.subarray(1), enc);
          if (alb) result.album = alb;
        } else if (frameId === 'TLEN') {
          const ms = parseInt(decodeText(frameData.subarray(1), enc), 10);
          if (ms > 0) result.durationSec = Math.round(ms / 1000);
        } else if (frameId === 'APIC') {
          result.hasArtwork = true;
        } else if (frameId === 'USLT' || frameId === 'SYLT') {
          try {
            let textStart = 4;
            while (textStart < frameData.length && frameData[textStart] !== 0) textStart++;
            if (textStart < frameData.length) textStart++;
            const lyr = decodeText(frameData.subarray(textStart), enc);
            if (lyr && !result.lyrics) result.lyrics = lyr;
          } catch {}
        }

        p += frameSize;
      }

      offset = 10 + tagSize;
    }

    // Check FLAC header ('fLaC')
    if (
      offset + 4 <= bytes.length &&
      bytes[offset] === 0x66 &&
      bytes[offset + 1] === 0x4c &&
      bytes[offset + 2] === 0x61 &&
      bytes[offset + 3] === 0x43
    ) {
      let p = offset + 4;
      let isLast = false;

      while (!isLast && p + 4 <= bytes.length) {
        const header0 = bytes[p];
        isLast = (header0 & 0x80) !== 0;
        const blockType = header0 & 0x7f;
        const blockLen = (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
        p += 4;

        if (blockType === 0 && p + 34 <= bytes.length) {
          // STREAMINFO: exact duration in samples
          const sampleRate = (bytes[p + 10] << 12) | (bytes[p + 11] << 4) | (bytes[p + 12] >> 4);
          const bitsPerSample = (((bytes[p + 12] & 0x01) << 4) | (bytes[p + 13] >> 4)) + 1;
          const totalSamples =
            (bytes[p + 13] & 0x0f) * 4294967296 +
            (bytes[p + 14] << 24) +
            (bytes[p + 15] << 16) +
            (bytes[p + 16] << 8) +
            bytes[p + 17];
          if (sampleRate > 0 && totalSamples > 0) {
            result.durationSec = Math.round(totalSamples / sampleRate);
          }
          result.formatInfo = {
            codec: 'FLAC',
            bitDepth: bitsPerSample || 16,
            sampleRate: sampleRate || 44100,
            isHiRes: (bitsPerSample && bitsPerSample > 16) || (sampleRate && sampleRate >= 88200),
          };
        } else if (blockType === 4) {
          // VORBIS_COMMENT
          const tags = parseVorbis(bytes, p, blockLen);
          if (tags.TITLE) result.title = tags.TITLE;
          if (tags.ARTIST) result.artist = tags.ARTIST;
          if (tags.ALBUM) result.album = tags.ALBUM;
          if (tags.LYRICS && !result.lyrics) result.lyrics = tags.LYRICS;
          if (tags.UNSYNCEDLYRICS && !result.lyrics) result.lyrics = tags.UNSYNCEDLYRICS;
        } else if (blockType === 6) {
          // PICTURE
          result.hasArtwork = true;
        }

        p += blockLen;
      }
    }

    // Check MP4 / M4A boxes (ftyp, moov, mvhd, ilst)
    const mvhdIdx = bytes.indexOf('mvhd');
    if (mvhdIdx !== -1 && mvhdIdx + 24 < bytes.length) {
      const version = bytes[mvhdIdx + 4];
      let timeScale = 0;
      let duration = 0;
      if (version === 0) {
        timeScale = bytes.readUInt32BE(mvhdIdx + 16);
        duration = bytes.readUInt32BE(mvhdIdx + 20);
      } else if (version === 1 && mvhdIdx + 36 < bytes.length) {
        timeScale = bytes.readUInt32BE(mvhdIdx + 24);
        duration = Number(bytes.readBigUInt64BE(mvhdIdx + 28));
      }
      if (timeScale > 0 && duration > 0) {
        result.durationSec = Math.round(duration / timeScale);
      }
    }

    // Extract M4A tags
    function findM4aData(pattern) {
      const idx = bytes.indexOf(pattern);
      if (idx !== -1 && idx + 24 < bytes.length) {
        const dataIdx = bytes.indexOf('data', idx);
        if (dataIdx !== -1 && dataIdx < idx + 32) {
          const size = bytes.readUInt32BE(dataIdx - 4);
          const dataLen = size - 16;
          if (dataLen > 0 && dataIdx + 12 + dataLen <= bytes.length) {
            return bytes.subarray(dataIdx + 12, dataIdx + 12 + dataLen).toString('utf8').trim();
          }
        }
      }
      return null;
    }

    const m4aTitle = findM4aData(Buffer.from([0xa9, 0x6e, 0x61, 0x6d])) || findM4aData('titl');
    if (m4aTitle) result.title = m4aTitle;
    const m4aArtist = findM4aData(Buffer.from([0xa9, 0x41, 0x52, 0x54])) || findM4aData('perf');
    if (m4aArtist) result.artist = m4aArtist;
    const m4aAlbum = findM4aData(Buffer.from([0xa9, 0x61, 0x6c, 0x62]));
    if (m4aAlbum) result.album = m4aAlbum;
    if (bytes.indexOf('covr') !== -1) {
      result.hasArtwork = true;
    }
    if (bytes.indexOf('alac') !== -1) {
      result.isAlac = true;
      result.formatInfo = {
        codec: 'ALAC',
        bitDepth: 24,
        sampleRate: 48000,
        isHiRes: true,
      };
    }
    if (bytes.indexOf('METADATA_BLOCK_PICTURE') !== -1) {
      result.hasArtwork = true;
      result.formatInfo = {
        codec: 'OGG',
        bitDepth: 16,
        sampleRate: 44100,
        isHiRes: false,
      };
    }

    // Check RIFF WAVE header ('RIFF' ... 'WAVE')
    if (bytes.length >= 36 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
      const fmtIdx = bytes.indexOf('fmt ');
      let byteRate = 0;
      let sampleRate = 44100;
      let bitsPerSample = 16;
      if (fmtIdx !== -1 && fmtIdx + 24 <= bytes.length) {
        sampleRate = bytes.readUInt32LE(fmtIdx + 12);
        byteRate = bytes.readUInt32LE(fmtIdx + 16);
        bitsPerSample = bytes.readUInt16LE(fmtIdx + 22);
      }
      result.formatInfo = {
        codec: 'WAV',
        bitDepth: bitsPerSample || 16,
        sampleRate: sampleRate || 44100,
        isHiRes: (bitsPerSample && bitsPerSample > 16) || (sampleRate && sampleRate >= 88200),
      };
      const dataIdx = bytes.indexOf('data');
      if (dataIdx !== -1 && dataIdx + 8 <= bytes.length && byteRate > 0) {
        const dataLen = bytes.readUInt32LE(dataIdx + 4);
        if (dataLen > 0) {
          result.durationSec = Math.round(dataLen / byteRate);
        }
      }
      if (!result.durationSec && byteRate > 0) {
        try {
          const stat = await fs.promises.stat(filePath);
          result.durationSec = Math.round((stat.size - (dataIdx !== -1 ? dataIdx + 8 : 44)) / byteRate);
        } catch {}
      }

      // Check WAV tail for ID3 APIC chunk
      if (!result.hasArtwork && fd) {
        try {
          const stat = await fd.stat();
          if (stat.size > 8192) {
            const tailSize = Math.min(stat.size, 2097152); // check last 2MB for APIC
            const tailBuf = Buffer.alloc(tailSize);
            await fd.read(tailBuf, 0, tailSize, stat.size - tailSize);
            if (tailBuf.indexOf('APIC') !== -1) {
              result.hasArtwork = true;
            }
          }
        } catch {}
      }
    }
  } catch {
    // Ignore and return whatever we got
  } finally {
    if (fd) await fd.close().catch(() => {});
  }

  // Check for track-specific companion art: <song_title>.jpg, <song_title>.png
  // NOTE: We deliberately do NOT fall back to generic folder.jpg / cover.jpg here
  // because in multi-track/multi-album folders, generic folder art incorrectly
  // copies one song's album art across unrelated tracks.
  if (!result.hasArtwork) {
    try {
      const parsed = path.parse(filePath);
      for (const imgExt of ['.jpg', '.jpeg', '.png', '.webp']) {
        if (fs.existsSync(path.join(parsed.dir, `${parsed.name}${imgExt}`))) {
          result.hasArtwork = true;
          break;
        }
      }
    } catch {}
  }

  // Check for companion .lrc or .ttml files in the same directory
  try {
    const parsedPath = path.parse(filePath);
    const lrcPath = path.join(parsedPath.dir, `${parsedPath.name}.lrc`);
    const ttmlPath = path.join(parsedPath.dir, `${parsedPath.name}.ttml`);
    if (fs.existsSync(lrcPath)) {
      result.lyrics = await fs.promises.readFile(lrcPath, 'utf8');
    } else if (fs.existsSync(ttmlPath)) {
      result.lyrics = await fs.promises.readFile(ttmlPath, 'utf8');
    }
  } catch {}

  return result;
}

// In-memory artwork cache to prevent duplicate disk reads and EMFILE handle limits
const artworkCache = new Map();

/** Extracts embedded or folder album art image buffer & mime type */
async function extractArtwork(filePath) {
  if (artworkCache.has(filePath)) {
    return artworkCache.get(filePath);
  }

  let result = null;
  function cacheAndReturn(res) {
    if (res && res.buffer) {
      if (artworkCache.size > 800) {
        artworkCache.delete(artworkCache.keys().next().value);
      }
      artworkCache.set(filePath, res);
    }
    return res;
  }

  let fd = null;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const stat = await fd.stat();
    const readSize = Math.min(stat.size, 10485760); // up to 10MB for embedded art
    const buf = Buffer.allocUnsafe(readSize);
    const { bytesRead } = await fd.read(buf, 0, readSize, 0);
    const bytes = buf.subarray(0, bytesRead);

    let offset = 0;

    // Check ID3 APIC
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const version = bytes[3] || 3;
      const tagSize = parseSynchsafe(bytes[6] || 0, bytes[7] || 0, bytes[8] || 0, bytes[9] || 0);
      const maxOffset = Math.min(bytes.length, 10 + tagSize);
      let p = 10;

      while (p + 10 < maxOffset) {
        const b0 = bytes[p];
        if (b0 === 0) break;
        const frameId = String.fromCharCode(b0, bytes[p + 1], bytes[p + 2], bytes[p + 3]);
        const frameSize =
          version === 4
            ? parseSynchsafe(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
            : parseUint32(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);

        p += 10;
        if (p + frameSize > bytes.length || frameSize <= 0) break;

        if (frameId === 'APIC') {
          const frameData = bytes.subarray(p, p + frameSize);
          const enc = frameData[0] || 0;
          let q = 1;
          let mime = '';
          while (q < frameData.length && frameData[q] !== 0) {
            mime += String.fromCharCode(frameData[q]);
            q++;
          }
          q++; // null
          if (!mime) mime = 'image/jpeg';
          q++; // pic type

          if (enc === 1 || enc === 2) {
            while (q + 1 < frameData.length && !(frameData[q] === 0 && frameData[q + 1] === 0)) q += 2;
            q += 2;
          } else {
            while (q < frameData.length && frameData[q] !== 0) q++;
            q++;
          }

          if (q < frameData.length) {
            return cacheAndReturn({ buffer: frameData.subarray(q), mime });
          }
        }

        p += frameSize;
      }
      offset = 10 + tagSize;
    }

    // Check FLAC PICTURE
    if (
      offset + 4 <= bytes.length &&
      bytes[offset] === 0x66 &&
      bytes[offset + 1] === 0x4c &&
      bytes[offset + 2] === 0x61 &&
      bytes[offset + 3] === 0x43
    ) {
      let p = offset + 4;
      let isLast = false;

      while (!isLast && p + 4 <= bytes.length) {
        const header0 = bytes[p];
        isLast = (header0 & 0x80) !== 0;
        const blockType = header0 & 0x7f;
        const blockLen = (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
        p += 4;

        if (blockType === 6) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          let q = p;
          const end = Math.min(bytes.length, p + blockLen);
          if (q + 32 <= end) {
            q += 4; // pic type
            const mimeLen = view.getUint32(q, false);
            q += 4;
            if (q + mimeLen <= end) {
              const rawMime = new TextDecoder('ascii').decode(bytes.subarray(q, q + mimeLen));
              const mime = rawMime.trim().replace(/\0/g, '') || 'image/jpeg';
              q += mimeLen;
              const descLen = view.getUint32(q, false);
              q += 4 + descLen + 16;
              if (q + 4 <= end) {
                const dataLen = view.getUint32(q, false);
                q += 4;
                if (q + dataLen <= bytes.length) {
                  return cacheAndReturn({ buffer: bytes.subarray(q, q + dataLen), mime });
                }
              }
            }
          }
        }

        p += blockLen;
      }
    }

    // Check M4A covr atom
    const covrIdx = bytes.indexOf('covr');
    if (covrIdx !== -1) {
      const dataIdx = bytes.indexOf('data', covrIdx);
      if (dataIdx !== -1 && dataIdx < covrIdx + 32) {
        const size = bytes.readUInt32BE(dataIdx - 4);
        const flags = bytes.readUInt32BE(dataIdx + 4);
        const mime = (flags & 0xff) === 14 ? 'image/png' : 'image/jpeg';
        const dataLen = size - 16;
        if (dataLen > 0) {
          if (dataIdx + 12 + dataLen <= bytes.length) {
            return cacheAndReturn({ buffer: bytes.subarray(dataIdx + 12, dataIdx + 12 + dataLen), mime });
          } else if (fd && stat.size >= dataIdx + 12 + dataLen) {
            // Read large embedded art (e.g. 15MB PNG)
            const covrBuf = Buffer.alloc(dataLen);
            await fd.read(covrBuf, 0, dataLen, dataIdx + 12);
            return cacheAndReturn({ buffer: covrBuf, mime });
          }
        }
      }
    }

    // Check OGG Vorbis comment for METADATA_BLOCK_PICTURE
    const picTag = 'METADATA_BLOCK_PICTURE=';
    const picTagIdx = bytes.indexOf(Buffer.from(picTag));
    if (picTagIdx !== -1) {
      try {
        let tagEnd = picTagIdx + picTag.length;
        while (tagEnd < bytes.length && bytes[tagEnd] !== 0 && bytes[tagEnd] !== 0x0a && bytes[tagEnd] !== 0x0d) tagEnd++;
        const base64Str = bytes.subarray(picTagIdx + picTag.length, tagEnd).toString('ascii').trim();
        const picBytes = Buffer.from(base64Str, 'base64');
        if (picBytes.length > 32) {
          const mimeLen = picBytes.readUInt32BE(4);
          const mime = picBytes.subarray(8, 8 + mimeLen).toString('ascii') || 'image/jpeg';
          const descLen = picBytes.readUInt32BE(8 + mimeLen);
          const dataOffset = 8 + mimeLen + 4 + descLen + 16;
          const dataLen = picBytes.readUInt32BE(dataOffset);
          const imgBuf = picBytes.subarray(dataOffset + 4, dataOffset + 4 + dataLen);
          if (imgBuf.length > 0) {
            return cacheAndReturn({ buffer: imgBuf, mime });
          }
        }
      } catch {}
    }

    // Check WAV files for ID3 APIC chunk in tail if not in header
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.wav' && fd && stat.size > 8192) {
      try {
        const tailSize = Math.min(stat.size, 15728640); // check up to 15MB from tail
        const tailBuf = Buffer.alloc(tailSize);
        await fd.read(tailBuf, 0, tailSize, stat.size - tailSize);
        const apicIdx = tailBuf.indexOf('APIC');
        if (apicIdx !== -1 && apicIdx + 10 < tailBuf.length) {
          const frameSize = tailBuf.readUInt32BE(apicIdx + 4);
          if (frameSize > 0 && apicIdx + 10 + frameSize <= tailBuf.length) {
            const frameData = tailBuf.subarray(apicIdx + 10, apicIdx + 10 + frameSize);
            const enc = frameData[0] || 0;
            let q = 1;
            let mime = '';
            while (q < frameData.length && frameData[q] !== 0) {
              mime += String.fromCharCode(frameData[q]);
              q++;
            }
            q++;
            if (!mime) mime = 'image/jpeg';
            q++;
            if (enc === 1 || enc === 2) {
              while (q + 1 < frameData.length && !(frameData[q] === 0 && frameData[q + 1] === 0)) q += 2;
              q += 2;
            } else {
              while (q < frameData.length && frameData[q] !== 0) q++;
              q++;
            }
            if (q < frameData.length) {
              return cacheAndReturn({ buffer: frameData.subarray(q), mime });
            }
          }
        }
      } catch {}
    }
  } catch {
    // Fall back to companion art
  } finally {
    if (fd) await fd.close().catch(() => {});
  }

  // Check track-specific companion cover art: <song_title>.jpg, <song_title>.png
  // NOTE: We deliberately do NOT fall back to generic folder.jpg / cover.jpg here
  // because in multi-track/multi-album folders, generic folder art incorrectly
  // copies one song's album art across unrelated tracks.
  try {
    const parsed = path.parse(filePath);
    for (const imgExt of ['.jpg', '.jpeg', '.png', '.webp']) {
      const full = path.join(parsed.dir, `${parsed.name}${imgExt}`);
      if (fs.existsSync(full)) {
        const mime = imgExt === '.png' ? 'image/png' : imgExt === '.webp' ? 'image/webp' : 'image/jpeg';
        const buffer = await fs.promises.readFile(full);
        return cacheAndReturn({ buffer, mime });
      }
    }
  } catch {}

  return null;
}

module.exports = {
  AUDIO_EXTS,
  ART_NAMES,
  extractMetadata,
  extractArtwork,
  parseFileName,
};

